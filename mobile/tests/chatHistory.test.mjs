import assert from "node:assert/strict";
import test from "node:test";

function appendChatMessage(history, message, maxWindow = 30) {
  const next = [
    ...history,
    {
      id: message.id || `${Date.now()}-${message.role}`,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || Date.now(),
    },
  ];
  return next.slice(-maxWindow);
}

test("preserves conversation history in chronological order", () => {
  let history = [];
  history = appendChatMessage(history, { role: "user", content: "Hello Saathi" });
  history = appendChatMessage(history, { role: "model", content: "Hello Ramesh ji!" });
  history = appendChatMessage(history, { role: "user", content: "What are my tasks?" });

  assert.equal(history.length, 3);
  assert.equal(history[0].role, "user");
  assert.equal(history[0].content, "Hello Saathi");
  assert.equal(history[1].role, "model");
  assert.equal(history[1].content, "Hello Ramesh ji!");
  assert.equal(history[2].role, "user");
  assert.equal(history[2].content, "What are my tasks?");
});

test("caps message window to retain recent context without exceeding token limits", () => {
  let history = [];
  for (let i = 0; i < 40; i++) {
    history = appendChatMessage(history, { role: i % 2 === 0 ? "user" : "model", content: `Message ${i}` }, 25);
  }
  assert.equal(history.length, 25);
  assert.equal(history[0].content, "Message 15");
  assert.equal(history[24].content, "Message 39");
});

