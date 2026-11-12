import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  createAudioPlaylist,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Panel } from "@/components/Panel";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";
import { screenCapture, screenCaptureEvents } from "@/services/screenCapture";
import { buildLiveAudioInput, buildLiveScreenInput, formatLiveCaption, resamplePcm16ForGemini, shouldInterruptLocalPlayback } from "@/utils/geminiLive";

type ToolCall = { id: string; name: string; args: Record<string, unknown> };

const languageInstruction = {
  en: "Answer in simple English.",
  hi: "सरल हिंदी में जवाब दें।",
  ta: "எளிய தமிழில் பதிலளிக்கவும்.",
};

const liveTools = [{
  functionDeclarations: [
    { name: "get_task_summary", behavior: "BLOCKING", description: "Read the family task list", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" } }, required: ["family_id"] } },
    { name: "get_medicine_summary", behavior: "BLOCKING", description: "Read medicine schedule details", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" } }, required: ["family_id"] } },
    { name: "get_family_contacts", behavior: "BLOCKING", description: "Read connected family contacts", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" } }, required: ["family_id"] } },
    { name: "create_task", behavior: "BLOCKING", description: "Create a task after the user explicitly confirms", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" }, title: { type: "STRING" }, assigned_to: { type: "STRING" }, description: { type: "STRING" } }, required: ["family_id", "title", "assigned_to"] } },
    { name: "complete_task", behavior: "BLOCKING", description: "Complete a task after explicit user confirmation", parameters: { type: "OBJECT", properties: { task_id: { type: "STRING" } }, required: ["task_id"] } },
    { name: "confirm_medicine_taken", behavior: "BLOCKING", description: "Record a dose as taken only after explicit user confirmation", parameters: { type: "OBJECT", properties: { medicine_id: { type: "STRING" }, scheduled_for: { type: "STRING" } }, required: ["medicine_id"] } },
  ],
}];

function toBase64(buffer: ArrayBuffer | ArrayBufferView) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array("buffer" in buffer ? buffer.buffer : buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function wavBase64(chunks: string[], sampleRate = 24000) {
  const parts = chunks.map((chunk) => Uint8Array.from(atob(chunk), (character) => character.charCodeAt(0)));
  const dataLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(44 + dataLength);
  const view = new DataView(output.buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) output[offset + index] = value.charCodeAt(index);
  };
  writeText(0, "RIFF"); view.setUint32(4, 36 + dataLength, true); writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeText(36, "data"); view.setUint32(40, dataLength, true);
  let offset = 44;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  let binary = "";
  for (let index = 0; index < output.length; index += 0x8000) binary += String.fromCharCode(...output.subarray(index, index + 0x8000));
  return btoa(binary);
}

async function extractMessageText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data.buffer);
  }
  if (data && typeof (data as { text?: () => Promise<string> }).text === "function") {
    return await (data as { text: () => Promise<string> }).text();
  }
  if (typeof FileReader !== "undefined" && typeof Blob !== "undefined" && data instanceof Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(data);
    });
  }
  return String(data);
}

export default function Assistant() {
  const router = useRouter();
  const { t, language } = useI18n();
  const family = useFamilyContext();
  const socket = useRef<WebSocket | null>(null);
  const streamStarted = useRef(false);
  const stopRequested = useRef(false);
  const setupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputPlaylist = useRef<ReturnType<typeof createAudioPlaylist> | null>(null);
  const playbackGeneration = useRef(0);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [message, setMessage] = useState("Tap start and speak naturally.");
  const [transcript, setTranscript] = useState("");
  const [liveCaption, setLiveCaption] = useState("");
  const [tool, setTool] = useState<ToolCall | null>(null);
  const [toolLabel, setToolLabel] = useState("");
  const [sharingScreen, setSharingScreen] = useState(false);
  const screenShareStartedHere = useRef(false);

  const stream = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: "int16",
    onBuffer: (frame) => {
      if (socket.current?.readyState !== WebSocket.OPEN) return;
      const pcm = resamplePcm16ForGemini(frame.data, frame.sampleRate, frame.channels);
      socket.current.send(JSON.stringify(buildLiveAudioInput(toBase64(pcm), 16000)));
    },
  });

  const clearOutputAudio = useCallback(() => {
    playbackGeneration.current += 1;
    outputPlaylist.current?.pause();
    outputPlaylist.current?.clear();
    setAssistantSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    stopRequested.current = true;
    try { stream.stream.stop(); } catch { /* stream may not have started */ }
    clearOutputAudio();
    if (setupTimer.current) clearTimeout(setupTimer.current);
    setupTimer.current = null;
    streamStarted.current = false;
    socket.current?.close();
    socket.current = null;
    if (screenShareStartedHere.current) {
      screenShareStartedHere.current = false;
      void screenCapture?.stop();
    }
    setSharingScreen(false);
    setConnected(false); setConnecting(false); setTool(null); setToolLabel("");
    setMessage("Tap start and speak naturally.");
  }, [clearOutputAudio, stream.stream]);

  useEffect(() => () => {
    stop();
    outputPlaylist.current?.destroy();
    outputPlaylist.current = null;
  }, [stop]);

  useEffect(() => {
    if (!screenCaptureEvents) return;
    const frameSub = screenCaptureEvents.addListener("onScreenCaptureFrame", (event: { jpegBase64: string }) => {
      if (!sharingScreen || !event.jpegBase64 || socket.current?.readyState !== WebSocket.OPEN) return;
      socket.current.send(JSON.stringify(buildLiveScreenInput(event.jpegBase64)));
    });
    const stoppedSub = screenCaptureEvents.addListener("onScreenCaptureStopped", () => {
      screenShareStartedHere.current = false;
      setSharingScreen(false);
    });
    return () => { frameSub.remove(); stoppedSub.remove(); };
  }, [sharingScreen]);

  const handleServerMessage = useCallback(async (event: MessageEvent) => {
    try {
      const rawText = await extractMessageText(event.data);
      if (!rawText) return;
      const data = JSON.parse(rawText);
      if (data.setupComplete && !streamStarted.current) {
        streamStarted.current = true;
        if (setupTimer.current) clearTimeout(setupTimer.current);
        setupTimer.current = null;
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldPlayInBackground: false });
        outputPlaylist.current?.destroy();
        outputPlaylist.current = createAudioPlaylist({ sources: [], loop: "none", updateInterval: 100 });
        outputPlaylist.current.addListener("playlistStatusUpdate", (status) => setAssistantSpeaking(status.playing));
        await stream.stream.start();
        setConnected(true); setConnecting(false); setMessage("I’m listening. You can stop whenever you like.");
      }
      const server = data.serverContent;
      if (server?.interrupted) {
        clearOutputAudio();
        setMessage(t("listening"));
      }
      if (shouldInterruptLocalPlayback(server, outputPlaylist.current?.playing === true)) {
        clearOutputAudio();
      }
      const interimInput = server?.interimInputTranscription?.text;
      if (interimInput) setLiveCaption(formatLiveCaption("You", interimInput));
      if (server?.inputTranscription?.text) {
        const text = server.inputTranscription.text;
        setTranscript((old) => `${old}\n${formatLiveCaption("You", text)}`.trim());
        setLiveCaption(formatLiveCaption("You", text));
      }
      if (server?.outputTranscription?.text) {
        const text = server.outputTranscription.text;
        setTranscript((old) => `${old}\n${formatLiveCaption("Saathi", text)}`.trim());
        setLiveCaption(formatLiveCaption("Saathi", text));
      }
      const responseAudio: string[] = [];
      for (const part of server?.modelTurn?.parts ?? []) {
        if (part.inlineData?.mimeType?.startsWith("audio/pcm")) responseAudio.push(part.inlineData.data);
        if (part.text) setMessage(part.text);
      }
      if (responseAudio.length) {
        const generation = playbackGeneration.current;
        const audio = wavBase64(responseAudio);
        const uri = `${FileSystem.cacheDirectory}saathi-response-${Date.now()}.wav`;
        await FileSystem.writeAsStringAsync(uri, audio, { encoding: FileSystem.EncodingType.Base64 });
        if (generation !== playbackGeneration.current) {
          void FileSystem.deleteAsync(uri, { idempotent: true });
          return;
        }
        const playlist = outputPlaylist.current;
        if (playlist) {
          playlist.add(uri);
          playlist.play();
          setAssistantSpeaking(true);
          setTimeout(() => { void FileSystem.deleteAsync(uri, { idempotent: true }); }, 120_000);
        }
      }

      const call = data.toolCall?.functionCalls?.[0];
      if (!call) return;
      const pending: ToolCall = { id: call.id, name: call.name, args: call.args ?? {} };
      if (["create_task", "complete_task", "confirm_medicine_taken"].includes(pending.name)) {
        try { stream.stream.stop(); } catch { /* stream was already paused */ }
        setTool(pending);
        setToolLabel(pending.name === "create_task" ? `Create task “${String(pending.args.title ?? "")}” for you?` : "Loading details…");
        setMessage("Saathi would like to make a change. Please review it first.");
        if (pending.name === "complete_task") {
          void api<{ title: string }>(`/tasks/${pending.args.task_id}`).then((task) => setToolLabel(`Mark “${task.title}” as complete?`)).catch(() => setToolLabel("Could not load the task details. Please cancel and try again."));
        }
        if (pending.name === "confirm_medicine_taken") {
          void api<{ name: string }>(`/medicines/${pending.args.medicine_id}`).then((medicine) => setToolLabel(`Record “${medicine.name}” as taken?`)).catch(() => setToolLabel("Could not load the medicine details. Please cancel and try again."));
        }
        return;
      }

      void api("/ai/tool-execution", { method: "POST", body: JSON.stringify({ name: pending.name, arguments: pending.args, confirmed: false }) })
        .then((result) => { if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: pending.id, name: pending.name, response: { result } }] } })); })
        .catch(() => { if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: pending.id, name: pending.name, response: { error: "Information could not be loaded." } }] } })); });
    } catch {
      setMessage("I couldn’t understand that response. Please try again.");
    }
  }, [clearOutputAudio, stream.stream, t]);

  const begin = useCallback(async () => {
    stopRequested.current = false;
    setConnecting(true); streamStarted.current = false; setTranscript(""); setLiveCaption(""); setMessage("Connecting securely…");
    try {
      const familyContext = family.data;
      if (!familyContext) throw new Error("Connect Saathi to your family before starting a conversation.");
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("Allow microphone access to talk with Saathi.");
      const token = await api<{ token: string; model: string }>("/ai/live-token", { method: "POST" });
      const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token.token)}`);
      ws.binaryType = "arraybuffer";
      socket.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ setup: {
          model: `models/${token.model}`,
          generationConfig: { responseModalities: ["AUDIO"] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: { activityHandling: "START_OF_ACTIVITY_INTERRUPTS" },
          systemInstruction: { parts: [{ text: `You are Saathi, a kind voice companion for older adults. When the user explicitly starts screen sharing, inspect the incoming screen images and give one calm, short step at a time. The screen may contain private information; discuss only what helps with the user's request and never repeat secrets, OTPs, PINs, passwords, or banking credentials. ${languageInstruction[language]} The active family_id is ${familyContext.family.id}; the signed-in user's id is ${familyContext.membership.user_id}. Use these when reading or creating tasks. Only assign tasks to the signed-in user unless the user identifies a known family member. Call one tool at a time. Give one short instruction at a time. Never ask for passwords, OTPs, PINs or banking credentials. Never change medicine dosage. Ask before changing data. ${languageInstruction[language]}` }] },
          tools: liveTools,
        } }));
        setupTimer.current = setTimeout(() => {
          if (!streamStarted.current) { stopRequested.current = true; setConnecting(false); setMessage("The voice service did not respond. Please try again."); socket.current?.close(); }
        }, 12000);
      };
      ws.onmessage = (event) => { void handleServerMessage(event); };
      ws.onerror = () => {
        try { stream.stream.stop(); } catch { /* already stopped */ }
        clearOutputAudio();
        if (screenShareStartedHere.current) { screenShareStartedHere.current = false; void screenCapture?.stop(); }
        setSharingScreen(false); setMessage("Connection interrupted. Please try again."); setConnected(false); setConnecting(false);
      };
      ws.onclose = () => {
        try { stream.stream.stop(); } catch { /* already stopped */ }
        clearOutputAudio();
        if (screenShareStartedHere.current) { screenShareStartedHere.current = false; void screenCapture?.stop(); }
        setSharingScreen(false);
        if (setupTimer.current) clearTimeout(setupTimer.current);
        setupTimer.current = null; streamStarted.current = false; setConnected(false); setConnecting(false);
        if (!stopRequested.current) setMessage("The voice connection ended. Tap Start talking to try again.");
      };
    } catch (error) {
      setConnecting(false); setMessage(error instanceof Error ? error.message : "Voice assistant is unavailable right now.");
    }
  }, [clearOutputAudio, family.data, handleServerMessage, language, stream.stream]);

  async function respondToTool(confirmed: boolean) {
    if (!tool || !socket.current) return;
    const pending = tool;
    setTool(null);
    if (!confirmed) {
      socket.current.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: pending.id, name: pending.name, response: { cancelled: true } }] } }));
      setMessage("Okay, I left everything as it was.");
    } else {
      try {
        const result = await api("/ai/tool-execution", { method: "POST", body: JSON.stringify({ name: pending.name, arguments: pending.args, confirmed: true }) });
        socket.current.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: pending.id, name: pending.name, response: { result } }] } }));
        setMessage("Done. I’ve updated that for you.");
      } catch {
        socket.current.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: pending.id, name: pending.name, response: { error: "Action could not be completed." } }] } }));
        setMessage("I couldn’t complete that action. Your information was not changed.");
      }
    }
    setToolLabel("");
    if (socket.current?.readyState === WebSocket.OPEN) {
      try { await stream.stream.start(); } catch { setMessage("The microphone stopped. Tap stop and reconnect to continue."); }
    }
  }

  async function toggleScreenSharing() {
    if (!screenCapture || !screenCaptureEvents) {
      setMessage("Screen sharing with Saathi is available in the Android app.");
      return;
    }
    if (sharingScreen) {
      screenShareStartedHere.current = false;
      await screenCapture.stop();
      setSharingScreen(false);
      setMessage(t("screenSharingStopped"));
      return;
    }
    try {
      const approved = await screenCapture.requestAndStart();
      if (!approved) {
        setMessage("Screen sharing wasn’t started. Your screen was not sent to Saathi.");
        return;
      }
      screenShareStartedHere.current = true;
      setSharingScreen(true);
      setMessage(t("screenSharingStarted"));
    } catch {
      setMessage("Screen sharing could not start. Your voice session is still available.");
    }
  }

  return (
    <Screen>
      {/* Top Bar with Back Navigation & Language Pill */}
      <View style={styles.topNav}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backRow}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
          <Text style={styles.backLabel}>{t("talkToSaathi")}</Text>
        </Pressable>
        <View style={styles.langBadge}>
          <Text style={styles.langText}>
            {language === "hi" ? "हिन्दी" : language === "ta" ? "தமிழ்" : "English"}
          </Text>
        </View>
      </View>

      {/* Main Heading */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("howCanIHelp")}</Text>
        <Text style={styles.subtitle}>{t("speakNaturally")}</Text>
      </View>

      {/* Central Visual Voice Pulse Area */}
      <View style={styles.pulseCard}>
        <Pressable
          accessibilityRole="button"
          disabled={connecting}
          onPress={() => {
            if (connected) {
              stop();
            } else {
              void begin();
            }
          }}
          style={({ pressed }) => [
            styles.micOuterCircle,
            connected ? styles.micOuterConnected : styles.micOuterIdle,
            pressed && styles.pressedState,
          ]}
        >
          <View
            style={[
              styles.micInnerCircle,
              connected ? styles.micInnerConnected : styles.micInnerIdle,
            ]}
          >
            <Ionicons
              name={connected ? "mic" : "mic-outline"}
              size={54}
              color={connected ? colors.white : colors.blue}
            />
          </View>
        </Pressable>
        <Text style={styles.statusLabel}>
          {connecting
            ? t("connectingSecurely")
            : connected
            ? assistantSpeaking ? t("speaking") : t("listening")
            : t("tapToSpeak")}
        </Text>
        <Text style={styles.messageText}>{message}</Text>
      </View>

      {/* Live Transcript (if available) */}
      {transcript || liveCaption ? (
        <Panel variant="bordered" style={styles.transcriptPanel}>
          <Text style={styles.transcriptHeader}>{liveCaption ? t("liveCaption") : t("conversation")}</Text>
          {liveCaption ? <Text style={styles.liveCaption} accessibilityLiveRegion="polite">{liveCaption}</Text> : null}
          {transcript ? <Text style={styles.transcript}>{transcript}</Text> : null}
        </Panel>
      ) : null}

      {/* Explicit Tool Confirmation (Task or Medicine) */}
      {tool ? (
        <Panel variant="pale" style={styles.toolPanel}>
          <Ionicons name="alert-circle" size={28} color={colors.blue} />
          <Text style={styles.toolTitle}>{t("confirmAction")}</Text>
          <Text style={styles.toolBody}>{toolLabel}</Text>
          <ActionButton
            disabled={!toolLabel || toolLabel.startsWith("Could not") || toolLabel === "Loading details…"}
            onPress={() => void respondToTool(true)}
          >
            {t("yesConfirm")}
          </ActionButton>
          <ActionButton variant="secondary" onPress={() => void respondToTool(false)}>
            {t("noCancel")}
          </ActionButton>
        </Panel>
      ) : null}

      {/* "Try saying..." Suggestions List */}
      {!connected && !transcript ? (
        <View style={styles.suggestionsSection}>
          <Text style={styles.suggestionsHeader}>{t("trySaying")}</Text>
          <View style={styles.suggestionsList}>
            <View style={styles.suggestionItem}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.blue} />
              <Text style={styles.suggestionText}>"{t("suggestionBhajan")}"</Text>
            </View>
            <View style={styles.suggestionItem}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.blue} />
              <Text style={styles.suggestionText}>"{t("suggestionMed")}"</Text>
            </View>
            <View style={styles.suggestionItem}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.blue} />
              <Text style={styles.suggestionText}>"{t("suggestionCall")}"</Text>
            </View>
            <View style={styles.suggestionItem}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.blue} />
              <Text style={styles.suggestionText}>"{t("suggestionHelp")}"</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Bottom Action Controls */}
      <View style={styles.bottomControls}>
        {!connected ? (
          <ActionButton
            disabled={family.isLoading || !family.data}
            loading={connecting}
            onPress={() => void begin()}
          >
            {t("startTalking")}
          </ActionButton>
        ) : (
          <>
          <ActionButton variant={sharingScreen ? "danger" : "secondary"} onPress={() => void toggleScreenSharing()}>
            {sharingScreen ? t("stopShareScreen") : t("shareScreen")}
          </ActionButton>
          <ActionButton variant="danger" onPress={stop}>
            {t("stopListening")}
          </ActionButton>
          </>
        )}
        <Text style={styles.privacyNote}>
          {sharingScreen
            ? t("voicePrivacyScreen")
            : t("voicePrivacy")}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  backLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.ink,
  },
  langBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  langText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: colors.muted,
  },
  header: {
    gap: 6,
    marginVertical: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    lineHeight: 36,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    lineHeight: 26,
    color: colors.muted,
  },
  pulseCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: "center",
    gap: 12,
    marginVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  micOuterCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: "center",
    justifyContent: "center",
  },
  micOuterIdle: {
    backgroundColor: colors.pale,
  },
  micOuterConnected: {
    backgroundColor: "#DCE7FD",
    borderWidth: 4,
    borderColor: colors.blue,
  },
  micInnerCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  micInnerIdle: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  micInnerConnected: {
    backgroundColor: colors.blue,
  },
  statusLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.blue,
  },
  messageText: {
    fontFamily: "Inter_500Medium",
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
    textAlign: "center",
  },
  transcriptPanel: {
    gap: 8,
  },
  transcriptHeader: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.ink,
  },
  transcript: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
  },
  liveCaption: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 19,
    lineHeight: 28,
    color: colors.blue,
  },
  toolPanel: {
    gap: 12,
    alignItems: "center",
  },
  toolTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
  },
  toolBody: {
    fontFamily: "Inter_500Medium",
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
    textAlign: "center",
  },
  suggestionsSection: {
    gap: 10,
    marginVertical: 12,
  },
  suggestionsHeader: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: colors.ink,
  },
  suggestionsList: {
    gap: 8,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  suggestionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.ink,
    flex: 1,
  },
  bottomControls: {
    gap: 10,
    marginTop: "auto",
    paddingTop: 16,
    paddingBottom: 16,
  },
  privacyNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: "center",
  },
  pressedState: {
    transform: [{ scale: 0.97 }],
  },
});
