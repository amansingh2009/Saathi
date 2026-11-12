const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withScreenCapture(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] || [];
    const permissions = ["android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION", "android.permission.POST_NOTIFICATIONS"];
    for (const permission of permissions) {
      if (!manifest["uses-permission"].some((item) => item.$["android:name"] === permission)) manifest["uses-permission"].push({ $: { "android:name": permission } });
    }
    const app = manifest.application?.[0];
    if (app) {
      app.service ||= [];
      if (!app.service.some((item) => item.$["android:name"] === "com.saathi.screencapture.ScreenCaptureService")) {
        app.service.push({ $: { "android:name": "com.saathi.screencapture.ScreenCaptureService", "android:exported": "false", "android:foregroundServiceType": "mediaProjection" } });
      }
    }
    return mod;
  });
};
