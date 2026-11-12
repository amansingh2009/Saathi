export function resamplePcm16ForGemini(data: ArrayBuffer | ArrayBufferView, sampleRate: number, channels = 1) {
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (sampleRate <= 0 || channels <= 0 || bytes.byteLength % (2 * channels) !== 0) {
    throw new Error("Invalid microphone PCM frame");
  }
  const sourceFrames = bytes.byteLength / 2 / channels;
  if (sourceFrames === 0) return new Uint8Array();
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const mono = new Float32Array(sourceFrames);
  for (let frame = 0; frame < sourceFrames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) sum += input.getInt16((frame * channels + channel) * 2, true);
    mono[frame] = sum / channels;
  }
  const outputFrames = Math.max(1, Math.floor(sourceFrames * 16000 / sampleRate));
  const output = new Uint8Array(outputFrames * 2);
  const view = new DataView(output.buffer);
  for (let index = 0; index < outputFrames; index++) {
    const position = index * sampleRate / 16000;
    const low = Math.min(Math.floor(position), sourceFrames - 1);
    const high = Math.min(low + 1, sourceFrames - 1);
    const fraction = position - low;
    const sample = Math.round(mono[low] * (1 - fraction) + mono[high] * fraction);
    view.setInt16(index * 2, Math.max(-32768, Math.min(32767, sample)), true);
  }
  return output;
}

export function buildLiveAudioInput(audioBase64: string, sampleRate = 16000) {
  return {
    realtimeInput: {
      audio: { mimeType: `audio/pcm;rate=${sampleRate}`, data: audioBase64 },
    },
  };
}

export function buildLiveScreenInput(jpegBase64: string) {
  return {
    realtimeInput: {
      video: { mimeType: "image/jpeg", data: jpegBase64 },
    },
  };
}

export function shouldInterruptLocalPlayback(serverContent: unknown, isPlaying: boolean) {
  if (!serverContent || typeof serverContent !== "object") return false;
  const content = serverContent as { interrupted?: boolean; interimInputTranscription?: { text?: string }; inputTranscription?: { text?: string } };
  return content.interrupted === true || (isPlaying && Boolean((content.interimInputTranscription?.text ?? content.inputTranscription?.text)?.trim()));
}

export function formatLiveCaption(speaker: "You" | "Saathi", text: string) {
  return `${speaker}: ${text.trim()}`;
}
