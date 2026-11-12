import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
import { usePreferences } from "@/store/preferences";

type ToolCall = { id: string; name: string; args: Record<string, unknown> };

const languageInstruction = {
  en: "Answer in simple English.",
  hi: "सरल हिंदी में जवाब दें।",
  ta: "எளிய தமிழில் பதிலளிக்கவும்.",
};

const liveTools = [{
  functionDeclarations: [
    { name: "get_task_summary", description: "Read the family task list", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" } }, required: ["family_id"] } },
    { name: "get_medicine_summary", description: "Read medicine schedule details", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" } }, required: ["family_id"] } },
    { name: "get_family_contacts", description: "Read connected family contacts", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" } }, required: ["family_id"] } },
    { name: "create_task", description: "Create a task after the user explicitly confirms", parameters: { type: "OBJECT", properties: { family_id: { type: "STRING" }, title: { type: "STRING" }, assigned_to: { type: "STRING" }, description: { type: "STRING" } }, required: ["family_id", "title", "assigned_to"] } },
    { name: "complete_task", description: "Complete a task after explicit user confirmation", parameters: { type: "OBJECT", properties: { task_id: { type: "STRING" } }, required: ["task_id"] } },
    { name: "confirm_medicine_taken", description: "Record a dose as taken only after explicit user confirmation", parameters: { type: "OBJECT", properties: { medicine_id: { type: "STRING" }, scheduled_for: { type: "STRING" } }, required: ["medicine_id"] } },
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
  const language = usePreferences((state) => state.language);
  const family = useFamilyContext();
  const socket = useRef<WebSocket | null>(null);
  const streamStarted = useRef(false);
  const setupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioChunks = useRef<string[]>([]);
  const player = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("Tap start and speak naturally.");
  const [transcript, setTranscript] = useState("");
  const [tool, setTool] = useState<ToolCall | null>(null);
  const [toolLabel, setToolLabel] = useState("");

  const stream = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: "int16",
    onBuffer: (frame) => {
      if (socket.current?.readyState !== WebSocket.OPEN) return;
      socket.current.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: `audio/pcm;rate=${frame.sampleRate}`, data: toBase64(frame.data) }] } }));
    },
  });

  const stop = useCallback(() => {
    try { stream.stream.stop(); } catch { /* stream may not have started */ }
    if (setupTimer.current) clearTimeout(setupTimer.current);
    setupTimer.current = null;
    streamStarted.current = false;
    socket.current?.close();
    socket.current = null;
    setConnected(false); setConnecting(false); setTool(null); setToolLabel("");
    setMessage("Tap start and speak naturally.");
  }, [stream.stream]);

  useEffect(() => () => { stop(); player.current?.release(); }, [stop]);

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
      if (server?.inputTranscription?.text) setTranscript((old) => `${old}\nYou: ${server.inputTranscription.text}`.trim());
      if (server?.outputTranscription?.text) setTranscript((old) => `${old}\nSaathi: ${server.outputTranscription.text}`.trim());
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
  }, [stream.stream]);

  const begin = useCallback(async () => {
    setConnecting(true); streamStarted.current = false; audioChunks.current = []; setTranscript(""); setMessage("Connecting securely…");
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
          systemInstruction: { parts: [{ text: `You are Saathi, a kind voice companion for older adults. ${languageInstruction[language]} The active family_id is ${familyContext.family.id}; the signed-in user's id is ${familyContext.membership.user_id}. Use these when reading or creating tasks. Only assign tasks to the signed-in user unless the user identifies a known family member. Call one tool at a time. Give one short instruction at a time. Never ask for passwords, OTPs, PINs or banking credentials. Never change medicine dosage. Ask before changing data. ${languageInstruction[language]}` }] },
          tools: liveTools,
        } }));
        setupTimer.current = setTimeout(() => {
          if (!streamStarted.current) { setConnecting(false); setMessage("The voice service did not respond. Please try again."); socket.current?.close(); }
        }, 12000);
      };
      ws.onmessage = (event) => { void handleServerMessage(event); };
      ws.onerror = () => { try { stream.stream.stop(); } catch { /* already stopped */ } setMessage("Connection interrupted. Please try again."); setConnected(false); setConnecting(false); };
      ws.onclose = () => {
        try { stream.stream.stop(); } catch { /* already stopped */ }
        if (setupTimer.current) clearTimeout(setupTimer.current);
        setupTimer.current = null; streamStarted.current = false; setConnected(false); setConnecting(false);
      };
    } catch (error) {
      setConnecting(false); setMessage(error instanceof Error ? error.message : "Voice assistant is unavailable right now.");
    }
  }, [family.data, handleServerMessage, language, stream.stream]);

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

  return <Screen>
    <Heading title="Talk to Saathi" subtitle="A calm voice companion for everyday questions." />
    <Panel>
      <Text accessibilityRole="text" style={styles.message}>{message}</Text>
      {transcript ? <Text style={styles.transcript}>{transcript}</Text> : null}
      {tool ? <View style={styles.tool}>
        <Text style={styles.message}>{toolLabel}</Text>
        <ActionButton disabled={!toolLabel || toolLabel.startsWith("Could not") || toolLabel === "Loading details…"} onPress={() => void respondToTool(true)}>Confirm action</ActionButton>
        <ActionButton variant="secondary" onPress={() => void respondToTool(false)}>Cancel</ActionButton>
      </View> : null}
      {!connected ? <ActionButton disabled={family.isLoading || !family.data} loading={connecting} onPress={() => void begin()}>Start talking</ActionButton> : <ActionButton variant="danger" onPress={stop}>Stop listening</ActionButton>}
      <Text style={styles.privacy}>Microphone audio is sent to Gemini Live while this session is active. Stop to end the session.</Text>
    </Panel>
  </Screen>;
}

const styles = StyleSheet.create({
  message: { fontFamily: "Inter_600SemiBold", fontSize: 21, lineHeight: 30, color: colors.ink },
  transcript: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 23, color: colors.muted, marginVertical: 12 },
  tool: { gap: 12, marginVertical: 12 },
  privacy: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 12 },
});
