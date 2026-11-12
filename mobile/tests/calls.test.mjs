import assert from "node:assert/strict";
import test from "node:test";
import { canInitiateCall, formatCallDuration } from "../src/utils/callPresentation.ts";

test("formats call duration in mm:ss accurately", () => {
  assert.equal(formatCallDuration(0), "00:00");
  assert.equal(formatCallDuration(59), "00:59");
  assert.equal(formatCallDuration(60), "01:00");
  assert.equal(formatCallDuration(145), "02:25");
  assert.equal(formatCallDuration(3600), "60:00");
  assert.equal(formatCallDuration(-3), "00:00");
});

test("allows calls only after a senior connection is accepted", () => {
  assert.equal(canInitiateCall("connected"), true);
  assert.equal(canInitiateCall("none"), false);
  assert.equal(canInitiateCall("pending_sent"), false);
  assert.equal(canInitiateCall("pending_received"), false);
  assert.equal(canInitiateCall("blocked"), false);
});
