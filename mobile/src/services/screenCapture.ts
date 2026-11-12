import { Platform } from "react-native";
import { EventEmitter, requireOptionalNativeModule } from "expo-modules-core";

type NativeCapture = { requestAndStart(): Promise<boolean>; stop(): Promise<boolean> };
export const screenCapture = Platform.OS === "android" ? requireOptionalNativeModule<NativeCapture>("SaathiScreenCapture") : null;
type CaptureEvents = {
  onScreenCaptureFrame: (event: { jpegBase64: string; capturedAt: number }) => void;
  onScreenCaptureStopped: (event: Record<string, never>) => void;
};
export const screenCaptureEvents = screenCapture ? new EventEmitter<CaptureEvents>(screenCapture as never) : null;
