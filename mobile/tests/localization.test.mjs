import assert from "node:assert/strict";
import test from "node:test";
import { t, strings } from "../src/constants/strings.ts";

test("core labels have English, Hindi, and Tamil versions", () => {
  assert.equal(t("en", "sos"), "Emergency help");
  assert.equal(t("hi", "sos"), "आपातकालीन सहायता");
  assert.equal(t("ta", "sos"), "அவசர உதவி");
  assert.equal(t("en", "medicines"), "Medicines");
  assert.equal(t("hi", "medicines"), "दवाइयाँ");
  assert.equal(t("ta", "medicines"), "மருந்துகள்");
  assert.equal(t("en", "talk"), "Talk to Saathi");
  assert.equal(t("hi", "talk"), "साथी से बात करें");
  assert.equal(t("ta", "talk"), "சாத்தியுடன் பேசுங்கள்");
});

test("parameter interpolation works across all languages", () => {
  assert.equal(
    t("en", "readyToHelp", { name: "Anita" }),
    "Anita is connected and ready to help."
  );
  assert.equal(
    t("hi", "readyToHelp", { name: "अनीता" }),
    "अनीता जुड़े हुए हैं और मदद के लिए तैयार हैं।"
  );
  assert.equal(
    t("ta", "readyToHelp", { name: "அனிதா" }),
    "அனிதா இணைக்கப்பட்டு உதவ தயாராக உள்ளார்."
  );

  assert.equal(
    t("en", "tasksCompletedCount", { completed: 2, total: 4 }),
    "2 of 4 completed"
  );
  assert.equal(
    t("hi", "tasksCompletedCount", { completed: 2, total: 4 }),
    "4 में से 2 पूरे"
  );
  assert.equal(
    t("ta", "tasksCompletedCount", { completed: 2, total: 4 }),
    "4 இல் 2 முடிந்தது"
  );
});

test("all language translation dictionaries have identical keys", () => {
  const enKeys = Object.keys(strings.en).sort();
  const hiKeys = Object.keys(strings.hi).sort();
  const taKeys = Object.keys(strings.ta).sort();

  assert.deepEqual(hiKeys, enKeys, "Hindi keys must match English keys exactly");
  assert.deepEqual(taKeys, enKeys, "Tamil keys must match English keys exactly");

  for (const key of enKeys) {
    assert.ok(strings.en[key]?.length > 0, `English key ${key} is empty`);
    assert.ok(strings.hi[key]?.length > 0, `Hindi key ${key} is empty`);
    assert.ok(strings.ta[key]?.length > 0, `Tamil key ${key} is empty`);
  }
});
