import { Modal, StyleSheet, Text, View, Pressable, ActivityIndicator } from "react-native";
import { useIncomingCall } from "@/hooks/useIncomingCall";
import { colors, radii, touchTargets } from "@/theme/tokens";

export function IncomingCallModal() {
  const { incomingCall, isAnswering, accept, decline } = useIncomingCall();

  if (!incomingCall) return null;

  const isVideo = incomingCall.callType === "video";

  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Avatar representation */}
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {incomingCall.callerName.charAt(0).toUpperCase()}
            </Text>
          </View>

          <Text style={styles.callerName}>{incomingCall.callerName}</Text>
          <Text style={styles.callTypeLabel}>
            {isVideo ? "📹 Incoming Video Call" : "📞 Incoming Audio Call"}
          </Text>
          <Text style={styles.hintText}>
            A senior friend wants to connect with you.
          </Text>

          {/* Accept / Decline Action Buttons */}
          <View style={styles.actionsContainer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Accept call"
              style={({ pressed }) => [
                styles.acceptButton,
                pressed && styles.pressed,
                isAnswering && styles.disabled,
              ]}
              onPress={accept}
              disabled={isAnswering}
            >
              {isAnswering ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.buttonText}>
                  {isVideo ? "Accept Video" : "Accept Audio"}
                </Text>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decline call"
              style={({ pressed }) => [
                styles.declineButton,
                pressed && styles.pressed,
                isAnswering && styles.disabled,
              ]}
              onPress={decline}
              disabled={isAnswering}
            >
              <Text style={styles.buttonText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(23, 43, 77, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: radii.cardMax,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.pale,
    borderWidth: 3,
    borderColor: colors.blue,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  avatarText: {
    fontFamily: "Inter_700Bold",
    fontSize: 40,
    color: colors.blue,
  },
  callerName: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    lineHeight: 34,
    color: colors.ink,
    textAlign: "center",
    marginBottom: 8,
  },
  callTypeLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    color: colors.blue,
    marginBottom: 8,
  },
  hintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 32,
  },
  actionsContainer: {
    width: "100%",
    gap: 16,
  },
  acceptButton: {
    minHeight: touchTargets.primaryHeight,
    backgroundColor: colors.green,
    borderRadius: radii.control,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  declineButton: {
    minHeight: touchTargets.primaryHeight,
    backgroundColor: colors.red,
    borderRadius: radii.control,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  buttonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    color: colors.white,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.6,
  },
});

