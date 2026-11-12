import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "@/services/api";

export async function registerDeviceForFamily(familyId: string) {
  if (Platform.OS === "web") return;
  try {
    const permissions = await Notifications.getPermissionsAsync();
    const status = permissions.granted ? permissions : await Notifications.requestPermissionsAsync();
    if (!status.granted) return;
    const token = await Notifications.getDevicePushTokenAsync();
    if (!token?.data) return;
    await api("/notifications/register-device", {
      method: "POST",
      body: JSON.stringify({ family_id: familyId, token: token.data, platform: Platform.OS === "ios" ? "ios" : "android" }),
    });
  } catch {
    // Expo Go or emulator might not support native remote push tokens; ignore gracefully
  }
}
