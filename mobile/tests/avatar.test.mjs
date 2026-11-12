import assert from "node:assert/strict";
import test from "node:test";

function formatAvatarStoragePath(userId, fileExtension = "jpg") {
  const sanitizedExt = fileExtension.replace(/^\.+/, "").toLowerCase();
  return `${userId}/avatar.${sanitizedExt}`;
}

function isDirectHttpUrl(url) {
  if (!url || typeof url !== "string") return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

test("formats user avatar storage paths correctly", () => {
  assert.equal(formatAvatarStoragePath("user-123", "jpg"), "user-123/avatar.jpg");
  assert.equal(formatAvatarStoragePath("user-abc", ".PNG"), "user-abc/avatar.png");
});

test("identifies direct HTTP/HTTPS URLs vs storage paths", () => {
  assert.equal(isDirectHttpUrl("https://example.com/avatar.jpg"), true);
  assert.equal(isDirectHttpUrl("http://localhost:8000/pic.png"), true);
  assert.equal(isDirectHttpUrl("user-123/avatar.jpg"), false);
  assert.equal(isDirectHttpUrl(null), false);
  assert.equal(isDirectHttpUrl(undefined), false);
});
