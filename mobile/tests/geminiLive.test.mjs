import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveAudioInput, buildLiveScreenInput, formatLiveCaption, resamplePcm16ForGemini, shouldInterruptLocalPlayback } from "../src/utils/geminiLive.ts";

test("sends microphone frames as current Gemini Live audio input", () => {
  assert.deepEqual(buildLiveAudioInput("pcm-frame", 16000), {
    realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: "pcm-frame" } },
  });
});

test("resamples mono and stereo microphone PCM to Gemini's 16 kHz format", () => {
  const mono = new Int16Array([0, 1000, 2000, 3000]);
  const monoOut = new Int16Array(resamplePcm16ForGemini(mono.buffer, 32000, 1).buffer);
  assert.deepEqual([...monoOut], [0, 2000]);

  const stereo = new Int16Array([1000, 3000, 2000, 4000]);
  const stereoOut = new Int16Array(resamplePcm16ForGemini(stereo.buffer, 16000, 2).buffer);
  assert.deepEqual([...stereoOut], [2000, 3000]);
});

test("packages a consented JPEG screen frame as Gemini Live video input", () => {
  const frame = "/9j/test-frame";
  assert.deepEqual(buildLiveScreenInput(frame), {
    realtimeInput: { video: { mimeType: "image/jpeg", data: frame } },
  });
});

test("does not add screen frames to audio-only sessions implicitly", () => {
  const input = buildLiveScreenInput("jpeg");
  assert.equal("video" in input.realtimeInput, true);
  assert.equal("audio" in input.realtimeInput, false);
});

test("interrupts local speech playback on Gemini interruption or live user speech", () => {
  assert.equal(shouldInterruptLocalPlayback({ interrupted: true }, true), true);
  assert.equal(shouldInterruptLocalPlayback({ interimInputTranscription: { text: "wait" } }, true), true);
  assert.equal(shouldInterruptLocalPlayback({ inputTranscription: { text: "wait" } }, true), true);
  assert.equal(shouldInterruptLocalPlayback({ interimInputTranscription: { text: "wait" } }, false), false);
  assert.equal(shouldInterruptLocalPlayback({ interrupted: false }, true), false);
});

test("formats live captions with the correct speaker", () => {
  assert.equal(formatLiveCaption("You", "  Can you help?  "), "You: Can you help?");
  assert.equal(formatLiveCaption("Saathi", "Try this button."), "Saathi: Try this button.");
});
