import assert from "node:assert/strict";
import test from "node:test";
import { weeklyReminderTriggers } from "../src/utils/medicineSchedule.ts";

test("converts database weekday values and deduplicates schedule days", () => {
  assert.deepEqual(weeklyReminderTriggers("09:05:00", [0, 1, 1, 6]), [
    { weekday: 1, hour: 9, minute: 5 },
    { weekday: 2, hour: 9, minute: 5 },
    { weekday: 7, hour: 9, minute: 5 },
  ]);
});

test("rejects malformed times and out-of-range days", () => {
  assert.deepEqual(weeklyReminderTriggers("25:61", [0, 6]), []);
  assert.deepEqual(weeklyReminderTriggers("9:05", [0]), []);
  assert.deepEqual(weeklyReminderTriggers("09:05", [-1, 7, 2.5]), []);
});

test("allows a minute-resolution time and only valid weekdays", () => {
  assert.deepEqual(weeklyReminderTriggers("00:00", [3, 8, 2]), [
    { weekday: 4, hour: 0, minute: 0 },
    { weekday: 3, hour: 0, minute: 0 },
  ]);
});
