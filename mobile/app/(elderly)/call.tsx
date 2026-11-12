import { useEffect, useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, radii, touchTargets } from "@/theme/tokens";
import { LiveKitCallSession, isNativeWebRTCAvailable, TrackReferences } from "@/services/livekit";
import { endCall, rejectCall } from "@/services/calls";
import { supabase } from "@/services/supabase";
import { formatCallDuration } from "@/utils/callPresentation";
import { useI18n } from "@/hooks/useI18n";

export default function ActiveCallScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{
    callId: string;
    roomName: string;
    token: string;
    livekitUrl: string;
    callType: "audio" | "video";
    peerName?: string;
    role?: "caller" | "receiver";
  }>();

  const callId = params.callId;
  const roomName = params.roomName;
  const token = params.token;
  const livekitUrl = params.livekitUrl || process.env.EXPO_PUBLIC_LIVEKIT_URL || "wss://saathi-jcyj1o0z.livekit.cloud";
  const isVideoCall = params.callType === "video";
  const peerName = params.peerName || "Senior Friend";

  // Native VideoTrack reference if bundled in custom dev build
  const NativeVideoTrack = isNativeWebRTCAvailable()
    ? (() => {
        try {
          return require("@livekit/react-native").VideoTrack;
        } catch {
          return null;
        }
      })()
    : null;

  // Media state
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "reconnecting" | "disconnected"
  >("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(!isVideoCall);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isExpoGoMode, setIsExpoGoMode] = useState(false);
  const [callEndedNotice, setCallEndedNotice] = useState<string | null>(null);
  const [trackRefs, setTrackRefs] = useState<TrackReferences>({
    localTrackRef: null,
    remoteTrackRef: null,
  });

  // Call duration timer
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const sessionRef = useRef<LiveKitCallSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup & Exit Helper
  const handleExit = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.disconnect().catch(() => {});
      sessionRef.current = null;
    }
    router.replace("/(elderly)/connect");
  }, [router]);

  // Connect to LiveKit Room
  useEffect(() => {
    if (!token || !roomName) {
      Alert.alert("Call Error", "Missing call credentials.", [{ text: "OK", onPress: handleExit }]);
      return;
    }

    const session = new LiveKitCallSession({
      onConnectionChange: (status) => {
        setConnectionState(status);
        if (status === "connected") {
          setIsExpoGoMode(session.getState().isExpoGoSimulation);
          setTrackRefs(session.getTrackRefs());
          // Start call duration timer
          if (!timerRef.current) {
            timerRef.current = setInterval(() => {
              setSecondsElapsed((sec) => sec + 1);
            }, 1000);
          }
        } else if (status === "disconnected") {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      },
      onTracksChanged: (refs) => {
        setTrackRefs(refs);
      },
      onError: (err) => {
        console.warn("LiveKit session warning:", err);
      },
    });

    sessionRef.current = session;
    session.connect(livekitUrl, token, isVideoCall);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      session.disconnect().catch(() => {});
    };
  }, [token, roomName, livekitUrl, isVideoCall, handleExit]);

  // Listen to remote call state changes (e.g. peer hung up or rejected)
  useEffect(() => {
    if (!callId) return;

    const topic = `call_active_${callId}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calls",
          filter: `id=eq.${callId}`,
        },
        (payload: any) => {
          const updated = payload.new;
          if (updated && ["ended", "rejected", "missed"].includes(updated.status)) {
            setCallEndedNotice("The other person has ended the call.");
            setTimeout(() => {
              handleExit();
            }, 1800);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callId, handleExit]);

  // End Call Handler
  const handleEndCall = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (callId) {
      try {
        await endCall(callId);
      } catch (err) {
        console.warn("Error ending call on server:", err);
      }
    }
    handleExit();
  };

  // Media Toggle Handlers
  const handleToggleMute = async () => {
    if (sessionRef.current) {
      const muted = await sessionRef.current.toggleMicrophone();
      setIsMuted(muted);
    }
  };

  const handleToggleCamera = async () => {
    if (sessionRef.current) {
      const cameraOff = await sessionRef.current.toggleCamera();
      setIsCameraOff(cameraOff);
    }
  };

  const handleSwitchCamera = async () => {
    if (sessionRef.current) {
      const front = await sessionRef.current.switchCamera();
      setIsFrontCamera(front);
    }
  };

  const handleToggleSpeaker = () => {
    if (sessionRef.current) {
      const speaker = sessionRef.current.toggleSpeaker();
      setIsSpeakerOn(speaker);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Bar with Peer Info & Connection State */}
      <View style={styles.header}>
        <Text style={styles.peerName}>{peerName}</Text>
        <View style={styles.statusRow}>
          {connectionState === "connecting" ? (
            <View style={styles.inlineState}>
              <ActivityIndicator size="small" color={colors.white} />
              <Text style={styles.statusText}>Connecting...</Text>
            </View>
          ) : connectionState === "reconnecting" ? (
            <View style={styles.inlineState}>
              <ActivityIndicator size="small" color="#F59E0B" />
              <Text style={[styles.statusText, { color: "#F59E0B" }]}>
                Reconnecting...
              </Text>
            </View>
          ) : (
            <View style={styles.inlineState}>
              <View style={styles.connectedDot} />
              <Text style={styles.durationText}>{formatCallDuration(secondsElapsed)}</Text>
            </View>
          )}
        </View>

        {isExpoGoMode && (
          <View style={styles.expoBadge}>
            <Text style={styles.expoBadgeText}>
              📱 Expo Go Simulation Active (Real WebRTC requires custom dev build)
            </Text>
          </View>
        )}

        {callEndedNotice && (
          <View style={styles.noticeBanner}>
            <Text style={styles.noticeBannerText}>{callEndedNotice}</Text>
          </View>
        )}
      </View>

      {/* Main Media Viewport */}
      <View style={styles.viewport}>
        {isVideoCall && !isCameraOff ? (
          <View style={styles.videoPlaceholder}>
            {NativeVideoTrack && trackRefs.remoteTrackRef ? (
              <View style={styles.remoteVideoArea}>
                <NativeVideoTrack
                  trackRef={trackRefs.remoteTrackRef}
                  objectFit="cover"
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.videoNameBadge}>
                  <Text style={styles.videoNameBadgeText}>{peerName}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.remoteVideoArea}>
                <View style={styles.avatarBig}>
                  <Text style={styles.avatarBigText}>{peerName.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.videoLabel}>{peerName}</Text>
                {connectionState === "connected" && (
                  <Text style={styles.videoSublabel}>Camera is active</Text>
                )}
              </View>
            )}

            {/* Self Camera Inset */}
            <View style={styles.selfVideoInset}>
              {NativeVideoTrack && trackRefs.localTrackRef && !isCameraOff ? (
                <NativeVideoTrack
                  trackRef={trackRefs.localTrackRef}
                  mirror={isFrontCamera}
                  objectFit="cover"
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <Text style={styles.selfVideoText}>
                  {isFrontCamera ? "🤳 Front" : "📷 Back"}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.audioPlaceholder}>
            <View style={styles.avatarBig}>
              <Text style={styles.avatarBigText}>{peerName.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.audioCallingText}>
              {connectionState === "connected" ? t("speakingState") : t("callingState")}
            </Text>
            {isMuted && <Text style={styles.mutedBadge}>{t("micMuted")}</Text>}
          </View>
        )}
      </View>

      {/* Bottom Senior-Friendly Controls */}
      <View style={styles.controlsBar}>
        <View style={styles.secondaryControlsRow}>
          {/* Mute Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isMuted ? "Unmute microphone" : "Mute microphone"}
            style={[styles.circleControl, isMuted && styles.controlActive]}
            onPress={handleToggleMute}
          >
            <Text style={styles.controlIcon}>{isMuted ? "🔇" : "🎤"}</Text>
            <Text style={styles.controlLabel}>{isMuted ? t("unmute") : t("mute")}</Text>
          </Pressable>

          {/* Camera Toggle Button (for Video calls) */}
          {isVideoCall && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isCameraOff ? "Turn on camera" : "Turn off camera"}
              style={[styles.circleControl, isCameraOff && styles.controlActive]}
              onPress={handleToggleCamera}
            >
              <Text style={styles.controlIcon}>{isCameraOff ? "🚫" : "📹"}</Text>
              <Text style={styles.controlLabel}>{isCameraOff ? t("cameraOn") : t("cameraOff")}</Text>
            </Pressable>
          )}

          {/* Switch Camera (if Video Call & Camera On) */}
          {isVideoCall && !isCameraOff && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Flip camera"
              style={styles.circleControl}
              onPress={handleSwitchCamera}
            >
              <Text style={styles.controlIcon}>🔄</Text>
              <Text style={styles.controlLabel}>{t("flipCamera")}</Text>
            </Pressable>
          )}

          {/* Speaker Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isSpeakerOn ? "Speaker on" : "Earpiece mode"}
            style={[styles.circleControl, isSpeakerOn && styles.controlActive]}
            onPress={handleToggleSpeaker}
          >
            <Text style={styles.controlIcon}>{isSpeakerOn ? "🔊" : "🔈"}</Text>
            <Text style={styles.controlLabel}>{t("speaker")}</Text>
          </Pressable>
        </View>

        {/* Big Red End Call Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End call"
          style={({ pressed }) => [styles.endCallButton, pressed && styles.pressed]}
          onPress={handleEndCall}
        >
          <Text style={styles.endCallText}>{t("endCall")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "space-between",
  },
  header: {
    paddingTop: 54,
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: "center",
  },
  peerName: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: colors.white,
    textAlign: "center",
  },
  statusRow: {
    marginTop: 8,
  },
  inlineState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  connectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.green,
  },
  statusText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.pale,
  },
  durationText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: colors.pale,
  },
  expoBadge: {
    backgroundColor: "rgba(36, 87, 197, 0.4)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  expoBadgeText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: colors.pale,
    textAlign: "center",
  },
  noticeBanner: {
    backgroundColor: colors.red,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 12,
  },
  noticeBannerText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: colors.white,
    textAlign: "center",
  },
  viewport: {
    flex: 1,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: radii.cardMax,
    overflow: "hidden",
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  remoteVideoArea: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  selfVideoInset: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 90,
    height: 120,
    backgroundColor: "#334155",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.blue,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    zIndex: 10,
  },
  videoNameBadge: {
    position: "absolute",
    bottom: 16,
    left: 16,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  videoNameBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.white,
  },
  videoSublabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 6,
  },
  selfVideoText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: colors.white,
  },
  videoLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    color: colors.white,
    marginTop: 16,
  },
  audioPlaceholder: {
    alignItems: "center",
  },
  avatarBig: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarBigText: {
    fontFamily: "Inter_700Bold",
    fontSize: 52,
    color: colors.white,
  },
  audioCallingText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    color: colors.pale,
  },
  mutedBadge: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.red,
    marginTop: 8,
  },
  controlsBar: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
    backgroundColor: "#0B1120",
    borderTopLeftRadius: radii.cardMax,
    borderTopRightRadius: radii.cardMax,
  },
  secondaryControlsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginBottom: 20,
  },
  circleControl: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#334155",
    justifyContent: "center",
    alignItems: "center",
    padding: 6,
  },
  controlActive: {
    backgroundColor: colors.blue,
  },
  controlIcon: {
    fontSize: 26,
    marginBottom: 2,
  },
  controlLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: colors.white,
    textAlign: "center",
  },
  endCallButton: {
    minHeight: touchTargets.primaryHeight,
    backgroundColor: colors.red,
    borderRadius: radii.control,
    justifyContent: "center",
    alignItems: "center",
  },
  endCallText: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: colors.white,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});

