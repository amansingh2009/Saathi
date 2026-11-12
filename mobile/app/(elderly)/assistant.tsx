import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fromByteArray, toByteArray } from "base64-js";
import {
  createAudioPlayer,
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
type ChatMessage = { id: string; role: "user" | "model"; content: string };
type BrowserCapture = { stream: MediaStream; timer: ReturnType<typeof setInterval> };

const languageInstruction = {
  en: "Answer in simple English.",
  hi: "सरल हिंदी में जवाब दें।",
  ta: "எளிய தமிழில் பதிலளிக்கவும்.",
};

const liveTools = [{
  functionDeclarations: [
    { name: "get_task_summary", description: "Read the family task list", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" } }, required: ["family_id"] } },
    { name: "get_medicine_summary", description: "Read medicine schedule details", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" } }, required: ["family_id"] } },
    { name: "get_medicine_history", description: "Read recorded medicine responses for a requested inclusive date range. Use YYYY-MM-DD dates and Asia/Kolkata timezone.", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" }, start_date: { type: "STRING" }, end_date: { type: "STRING" }, timezone: { type: "STRING" } }, required: ["family_id", "start_date", "end_date", "timezone"] } },
    { name: "get_family_contacts", description: "Read connected family contacts", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" } }, required: ["family_id"] } },
    { name: "create_task", description: "Create a task after the user explicitly confirms", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" }, title: { type: "STRING" }, assigned_to: { type: "STRING" }, description: { type: "STRING" } }, required: ["family_id", "title", "assigned_to"] } },
    { name: "complete_task", description: "Complete a task after explicit user confirmation", parameters: { type: "OBJECT", properties: { task_id: { type: "STRING" } }, required: ["task_id"] } },
    { name: "confirm_medicine_taken", description: "Record a dose as taken only after explicit user confirmation", parameters: { type: "OBJECT", properties: { medicine_id: { type: "STRING" }, scheduled_for: { type: "STRING" } }, required: ["medicine_id"] } },
  ],
}];

function toBase64(buffer: ArrayBuffer | ArrayBufferView): string {
  const bytes = buffer instanceof Uint8Array
    ? buffer
    : new Uint8Array("buffer" in buffer ? buffer.buffer : buffer);
  return fromByteArray(bytes);
}

function wavBase64(chunks: string[], sampleRate = 24000): string {
  const parts = chunks.map((chunk) => toByteArray(chunk));
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
  return fromByteArray(output);
}

async function extractMessageText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (typeof TextDecoder !== "undefined") {
    try {
      if (data instanceof ArrayBuffer) {
        return new TextDecoder("utf-8").decode(data);
      }
      if (ArrayBuffer.isView(data)) {
        return new TextDecoder("utf-8").decode(data.buffer);
      }
    } catch {
      // Fall through to manual decode
    }
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array("buffer" in data ? (data as any).buffer : data);
    let result = "";
    for (let i = 0; i < bytes.length; i += 1024) {
      result += String.fromCharCode(...bytes.subarray(i, Math.min(i + 1024, bytes.length)));
    }
    return result;
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

export default function Assistant({ initialMode: propInitialMode }: { initialMode?: "text" | "voice" } = {}) {
  const router = useRouter();
  const params = useLocalSearchParams<{ initialMode?: "text" | "voice" }>();
  const effectiveInitialMode = propInitialMode || params.initialMode;
  const { t, language } = useI18n();
  const family = useFamilyContext();
  const socket = useRef<WebSocket | null>(null);
  const browserCapture = useRef<BrowserCapture | null>(null);
  const streamStarted = useRef(false);
  const setupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioChunks = useRef<string[]>([]);
  const player = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("Tap start and speak naturally.");
  const [transcript, setTranscript] = useState("");
  const [liveCaption, setLiveCaption] = useState("");
  const [tool, setTool] = useState<ToolCall | null>(null);
  const [toolLabel, setToolLabel] = useState("");
  const [sharingScreen, setSharingScreen] = useState(false);
  const [mode, setMode] = useState<"text" | "voice">(effectiveInitialMode === "text" ? "text" : "voice");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");
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

  const stopBrowserCapture = useCallback(() => {
    const current = browserCapture.current;
    if (!current) return;
    clearInterval(current.timer);
    for (const track of current.stream.getTracks()) track.stop();
    browserCapture.current = null;
  }, []);

  const stop = useCallback(() => {
    try { stream.stream.stop(); } catch { /* stream may not have started */ }
    audioChunks.current = [];
    player.current?.pause();
    if (player.current) void player.current.seekTo(0);
    if (setupTimer.current) clearTimeout(setupTimer.current);
    setupTimer.current = null;
    streamStarted.current = false;
    socket.current?.close();
    socket.current = null;
    if (screenShareStartedHere.current) {
      screenShareStartedHere.current = false;
      void screenCapture?.stop();
    }
    stopBrowserCapture();
    setSharingScreen(false);
    setConnected(false); setConnecting(false); setTool(null); setToolLabel("");
    setMessage("Tap start and speak naturally.");
  }, [stopBrowserCapture, stream.stream]);

  function selectMode(nextMode: "text" | "voice") {
    if (nextMode === mode) return;
    if (connected || connecting) stop();
    setMode(nextMode);
  }

  useEffect(() => () => { stop(); player.current?.release(); }, [stop]);

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
        await stream.stream.start();
        setConnected(true); setConnecting(false); setMessage("I’m listening. You can stop whenever you like.");
      }
      const server = data.serverContent;
      if (server?.interrupted) {
        audioChunks.current = [];
        player.current?.pause();
        if (player.current) void player.current.seekTo(0);
        setMessage(t("listening"));
      }
      if (shouldInterruptLocalPlayback(server, player.current?.playing === true)) {
        player.current?.pause();
        if (player.current) void player.current.seekTo(0);
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
      for (const part of server?.modelTurn?.parts ?? []) {
        if (part.inlineData?.mimeType?.startsWith("audio/pcm")) audioChunks.current.push(part.inlineData.data);
        if (part.text) setMessage(part.text);
      }
      if (server?.turnComplete && audioChunks.current.length) {
        const audio = wavBase64(audioChunks.current);
        audioChunks.current = [];
        const uri = `${FileSystem.cacheDirectory}saathi-response-${Date.now()}.wav`;
        await FileSystem.writeAsStringAsync(uri, audio, { encoding: FileSystem.EncodingType.Base64 });
        player.current?.release();
        player.current = createAudioPlayer(uri);
        player.current.play();
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
  }, [stream.stream, t]);

  const begin = useCallback(async () => {
    setConnecting(true); streamStarted.current = false; audioChunks.current = []; setTranscript(""); setLiveCaption(""); setMessage("Connecting securely…");
    try {
      const familyContext = family.data;
      const familyId = familyContext?.family?.id;
      const memberId = familyContext?.membership?.user_id;

      const familyPromptSnippet = familyId && memberId
        ? ` The active family_id is ${familyId}; the signed-in user's id is ${memberId}. Use these when reading or creating tasks. Only assign tasks to the signed-in user unless the user identifies a known family member.`
        : ` The user is not yet connected to a family group. If the user asks about family tasks or medicines, kindly explain that a family group has not been connected yet, and guide them to connect with their family from the Home screen. You can still converse warmly, tell stories, discuss devotional or spiritual topics, and answer everyday questions.`;

      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("Allow microphone access to talk with Saathi.");
      const token = await api<{ token: string; model: string }>("/ai/live-token", { method: "POST" });
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
      const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token.token)}`);
      ws.binaryType = "arraybuffer";
      socket.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({
          setup: {
            model: `models/${token.model}`,
            generationConfig: { responseModalities: ["AUDIO"] },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: { activityHandling: "START_OF_ACTIVITY_INTERRUPTS" },
            systemInstruction: { parts: [{ text: `You are Saathi, a kind voice companion for older adults. Today is ${today} in Asia/Kolkata. When the user explicitly starts screen sharing, inspect incoming screen images and give one calm, short step at a time. The screen may contain private information; discuss only what helps with the user's request and never repeat secrets, OTPs, PINs, passwords, or banking credentials. ${languageInstruction[language]}${familyPromptSnippet} If asked about tasks, use get_task_summary. If asked about a medicine schedule, use get_medicine_summary. If asked which medicines the user took or skipped, determine the requested dates, ask a brief follow-up if the range is unclear, then use get_medicine_history with inclusive YYYY-MM-DD dates and Asia/Kolkata timezone. Report only recorded results; never infer that an unrecorded dose was taken. Call one tool at a time. Give one short instruction at a time. Never ask for passwords, OTPs, PINs or banking credentials. Never change medicine dosage. Ask before changing data. ${languageInstruction[language]}` }] },
            tools: liveTools,
          }
        }));
        setupTimer.current = setTimeout(() => {
          if (!streamStarted.current) { setConnecting(false); setMessage("The voice service did not respond. Please try again."); socket.current?.close(); }
        }, 12000);
      };
      ws.onmessage = (event) => { void handleServerMessage(event); };
      ws.onerror = () => {
        try { stream.stream.stop(); } catch { /* already stopped */ }
        audioChunks.current = [];
        player.current?.pause();
        if (player.current) void player.current.seekTo(0);
        if (screenShareStartedHere.current) { screenShareStartedHere.current = false; void screenCapture?.stop(); }
        stopBrowserCapture();
        setSharingScreen(false); setMessage("Connection interrupted. Please try again."); setConnected(false); setConnecting(false);
      };
      ws.onclose = () => {
        try { stream.stream.stop(); } catch { /* already stopped */ }
        audioChunks.current = [];
        player.current?.pause();
        if (player.current) void player.current.seekTo(0);
        if (screenShareStartedHere.current) { screenShareStartedHere.current = false; void screenCapture?.stop(); }
        stopBrowserCapture();
        setSharingScreen(false);
        if (setupTimer.current) clearTimeout(setupTimer.current);
        setupTimer.current = null; streamStarted.current = false; setConnected(false); setConnecting(false);
      };
    } catch (error) {
      setConnecting(false); setMessage(error instanceof Error ? error.message : "Voice assistant is unavailable right now.");
    }
  }, [family.data, handleServerMessage, language, stopBrowserCapture, stream.stream]);

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

  async function sendTextMessage(text = chatDraft) {
    const content = text.trim();
    if (!content || chatBusy) return;
    const userMessage: ChatMessage = { id: `${Date.now()}-user`, role: "user", content };
    const nextMessages = [...chatMessages, userMessage].slice(-24);
    setChatMessages(nextMessages);
    setChatDraft("");
    setChatError("");
    setChatBusy(true);
    try {
      const result = await api<{ reply: string }>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          family_id: family.data?.family.id ?? null,
          messages: nextMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
      });
      setChatMessages((current) => [...current, { id: `${Date.now()}-model`, role: "model" as const, content: result.reply }].slice(-24));
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Saathi couldn’t reply. Please try again.");
    } finally {
      setChatBusy(false);
    }
  }

  async function startBrowserScreenSharing() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMessage("Screen sharing isn’t supported by this browser. Try the Saathi Android app.");
      return;
    }
    let captureStream: MediaStream | null = null;
    try {
      captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 1, max: 1 } },
        audio: false,
      });
      const track = captureStream.getVideoTracks()[0];
      const settings = track?.getSettings();
      const sourceWidth = settings?.width ?? 1280;
      const sourceHeight = settings?.height ?? 720;
      const scale = Math.min(1, 1280 / sourceWidth, 720 / sourceHeight);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = captureStream;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Screen capture is not available in this browser.");
      const timer = setInterval(() => {
        if (socket.current?.readyState !== WebSocket.OPEN || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const jpegBase64 = canvas.toDataURL("image/jpeg", 0.65).split(",")[1];
        if (jpegBase64) socket.current.send(JSON.stringify(buildLiveScreenInput(jpegBase64)));
      }, 1000);
      browserCapture.current = { stream: captureStream, timer };
      track.onended = () => {
        stopBrowserCapture();
        setSharingScreen(false);
        setMessage(t("screenSharingStopped"));
      };
      setSharingScreen(true);
      setMessage(t("screenSharingStarted"));
    } catch (error) {
      for (const track of captureStream?.getTracks() ?? []) track.stop();
      setMessage(error instanceof Error ? error.message : "Screen sharing wasn’t started. Your screen was not sent to Saathi.");
    }
  }

  async function toggleScreenSharing() {
    if (sharingScreen) {
      if (Platform.OS === "web") {
        stopBrowserCapture();
      } else if (screenCapture) {
        screenShareStartedHere.current = false;
        await screenCapture.stop();
      }
      setSharingScreen(false);
      setMessage(t("screenSharingStopped"));
      return;
    }
    if (Platform.OS === "web") {
      await startBrowserScreenSharing();
      return;
    }
    if (!screenCapture || !screenCaptureEvents) {
      setMessage("Screen sharing is not available on this device.");
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
        <Text style={styles.title}>{t("talkToSaathi")}</Text>
        <Text style={styles.subtitle}>{t("companionSubtitle")}</Text>
      </View>

      <View style={styles.modePicker}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === "text" }} onPress={() => selectMode("text")} style={[styles.modeButton, mode === "text" && styles.modeButtonActive]}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={mode === "text" ? colors.white : colors.blue} />
          <Text style={[styles.modeButtonLabel, mode === "text" && styles.modeButtonLabelActive]}>{t("textMode")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === "voice" }} onPress={() => selectMode("voice")} style={[styles.modeButton, mode === "voice" && styles.modeButtonActive]}>
          <Ionicons name="mic-outline" size={20} color={mode === "voice" ? colors.white : colors.blue} />
          <Text style={[styles.modeButtonLabel, mode === "voice" && styles.modeButtonLabelActive]}>{t("voiceMode")}</Text>
        </Pressable>
      </View>

      {mode === "text" ? (
        <>
          <Panel variant="pale" style={styles.chatWelcomePanel}>
            <Ionicons name="sparkles" size={22} color={colors.blue} />
            <Text style={styles.chatWelcomeText}>{t("chatWelcome")}</Text>
          </Panel>
          <View style={styles.chatMessages}>
            {chatMessages.length === 0 ? (
              <View style={styles.quickPrompts}>
                <Text style={styles.suggestionsHeader}>{t("trySaying")}</Text>
                {[t("suggestionTasks"), t("suggestionMed")].map((prompt) => (
                  <Pressable key={prompt} accessibilityRole="button" style={styles.quickPrompt} onPress={() => void sendTextMessage(prompt)}>
                    <Text style={styles.quickPromptText}>{prompt}</Text>
                    <Ionicons name="arrow-up-circle" size={24} color={colors.blue} />
                  </Pressable>
                ))}
              </View>
            ) : chatMessages.map((item) => (
              <View key={item.id} style={[styles.chatBubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}>
                {item.role === "model" ? <Text style={styles.assistantName}>Saathi</Text> : null}
                <Text style={[styles.chatBubbleText, item.role === "user" && styles.userBubbleText]}>{item.content}</Text>
              </View>
            ))}
            {chatBusy ? <Text style={styles.chatThinking}>{t("chatThinking")}</Text> : null}
            {chatError ? <Text accessibilityRole="alert" style={styles.chatError}>{chatError}</Text> : null}
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.chatComposer}>
              <TextInput
                accessibilityLabel={t("textChatPlaceholder")}
                value={chatDraft}
                onChangeText={setChatDraft}
                onSubmitEditing={() => void sendTextMessage()}
                placeholder={t("textChatPlaceholder")}
                placeholderTextColor={colors.muted}
                returnKeyType="send"
                style={styles.chatInput}
                editable={!chatBusy}
              />
              <Pressable accessibilityRole="button" accessibilityLabel={t("sendMessage")} disabled={!chatDraft.trim() || chatBusy} onPress={() => void sendTextMessage()} style={[styles.sendButton, (!chatDraft.trim() || chatBusy) && styles.sendButtonDisabled]}>
                {chatBusy ? <Ionicons name="time-outline" size={23} color={colors.white} /> : <Ionicons name="send" size={21} color={colors.white} />}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </>
      ) : (
        <>
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
              ? t("listening")
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
        </>
      )}
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
  modePicker: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 6,
  },
  modeButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  modeButtonActive: {
    backgroundColor: colors.blue,
  },
  modeButtonLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.blue,
  },
  modeButtonLabelActive: {
    color: colors.white,
  },
  chatWelcomePanel: {
    flexDirection: "row",
    alignItems: "center",
  },
  chatWelcomeText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
  },
  chatMessages: {
    gap: 12,
    minHeight: 160,
  },
  quickPrompts: {
    gap: 10,
    paddingTop: 4,
  },
  quickPrompt: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  quickPromptText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  chatBubble: {
    maxWidth: "88%",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.blue,
    borderBottomRightRadius: 5,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomLeftRadius: 5,
  },
  assistantName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.blue,
  },
  chatBubbleText: {
    fontFamily: "Inter_400Regular",
    fontSize: 17,
    lineHeight: 25,
    color: colors.ink,
  },
  userBubbleText: {
    color: colors.white,
  },
  chatThinking: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.muted,
    paddingHorizontal: 8,
  },
  chatError: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    lineHeight: 22,
    color: colors.red,
  },
  chatComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
  },
  chatInput: {
    flex: 1,
    minHeight: 54,
    paddingHorizontal: 12,
    color: colors.ink,
    fontFamily: "Inter_400Regular",
    fontSize: 18,
  },
  sendButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blue,
  },
  sendButtonDisabled: {
    opacity: 0.45,
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
