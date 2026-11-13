import { useState } from "react";
import { StyleSheet, Text, View, Pressable, Linking, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { Panel } from "@/components/Panel";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";
import { captureAndUploadEmergencyEvidence } from "@/services/emergencyCapture";
import type { FamilyMember } from "@/components/FamilyList";

type Result = {
  event: { id: string; status: string; created_at: string };
  notification_delivery: { status: string; sent: number };
};

type EmergencyEvent = {
  id: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: string;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  resolved_at?: string | null;
};

export default function SOS() {
  const router = useRouter();
  const { t } = useI18n();
  const family = useFamilyContext();
  const familyId = family.data?.family.id;

  const [showConfirm, setShowConfirm] = useState(false);
  const [showSafetyConfirm, setShowSafetyConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(false);

  const event = useQuery({
    queryKey: ["emergency-event", result?.event.id],
    enabled: !!result,
    queryFn: () => api<EmergencyEvent>(`/emergency/${result?.event.id}`),
    refetchInterval: result ? 3000 : false,
  });

  const members = useQuery({
    queryKey: ["members", familyId],
    enabled: !!familyId,
    queryFn: () => api<FamilyMember[]>(`/families/${familyId}/members`),
  });

  const caregiver = members.data?.find((m) => m.role === "caregiver");
  const caregiverName = caregiver?.profile?.full_name || "Anita Sharma";
  const caregiverPhone = caregiver?.profile?.phone || "+91 98765 01234";

  async function resolveEmergency() {
    if (!result?.event?.id) return;
    setResolving(true);
    try {
      await api(`/emergency/${result.event.id}/resolve`, { method: "POST" });
      setShowSafetyConfirm(false);
      router.back();
    } catch {
      Alert.alert("Notice", "Couldn't update safety status. Please call your caregiver directly.");
    } finally {
      setResolving(false);
    }
  }

  async function send() {
    if (!familyId) return;
    setSending(true);
    setError(false);
    try {
      const data = await api<Result>("/emergency", {
        method: "POST",
        body: JSON.stringify({
          family_id: familyId,
          message: "A family member requested help.",
        }),
      });
      setResult(data);
      setShowConfirm(false);

      // Silently capture front/back camera photos and screen snapshot in background
      void captureAndUploadEmergencyEvidence(data.event.id);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  // 1a. Safety Confirmation Step (Figma Screen 50: Emergency · Safety confirmation)
  if (result && showSafetyConfirm) {
    return (
      <Screen>
        <View style={styles.topNav}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowSafetyConfirm(false)}
            style={styles.backRow}
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
            <Text style={styles.backLabel}>{t("cancel")}</Text>
          </Pressable>
        </View>

        <View style={styles.confirmBox}>
          <View style={styles.safetyCircleLarge}>
            <Ionicons name="shield-checkmark" size={52} color={colors.green} />
          </View>
          <Text style={styles.confirmTitle}>Are you safe now?</Text>
          <Text style={styles.confirmSubtitle}>
            Confirming that you are safe will resolve the emergency alert and notify your family.
          </Text>
        </View>

        <View style={styles.confirmActions}>
          <ActionButton
            variant="primary"
            loading={resolving}
            onPress={() => void resolveEmergency()}
          >
            Yes, I am safe
          </ActionButton>
          <ActionButton
            variant="secondary"
            disabled={resolving}
            onPress={() => setShowSafetyConfirm(false)}
          >
            I still need help
          </ActionButton>
        </View>
      </Screen>
    );
  }

  // 1. Alert Sent / Acknowledged View
  if (result) {
    const isAck = !!event.data?.acknowledged_at;
    const isResolved = event.data?.status === "resolved";
    const ackMember = members.data?.find((m) => m.user_id === event.data?.acknowledged_by);

    return (
      <Screen>
        <View style={styles.topNav}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backRow}
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
            <Text style={styles.backLabel}>{t("back")}</Text>
          </Pressable>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>
            {isResolved
              ? t("emergencyResolved")
              : isAck
              ? t("caregiverResponded")
              : t("alertSentToFamily")}
          </Text>
          <Text style={styles.subtitle}>
            {t("sosSubtitle")}
          </Text>
        </View>

        <Panel variant={isAck ? "mint" : "pale"} style={styles.statusPanel}>
          <View style={styles.statusHeaderRow}>
            <Ionicons
              name={isAck ? "checkmark-circle" : "alert-circle"}
              size={36}
              color={isAck ? colors.green : colors.blue}
            />
            <View style={styles.statusTextCol}>
              <Text style={styles.statusTitle}>
                {isAck
                  ? t("ackBy", { name: ackMember?.profile?.full_name || caregiverName })
                  : t("waitingForAck")}
              </Text>
              <Text style={styles.statusTime}>
                {t("alertCreatedAt", {
                  time: new Date(result.event.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </Text>
            </View>
          </View>

          {isAck ? (
            <Text style={styles.statusDescription}>
              {t("helpOnWay")}
            </Text>
          ) : (
            <Text style={styles.statusDescription}>
              {t("notificationDeliveredUrgent")}
            </Text>
          )}
        </Panel>

        {/* Emergency Contact */}
        <View style={styles.contactCard}>
          <View style={styles.contactAvatar}>
            <Ionicons name="call" size={24} color={colors.green} />
          </View>
          <View style={styles.contactInfo}>
            <Text style={styles.contactName}>{caregiverName}</Text>
            <Text style={styles.contactRole}>{t("emergencyContact")} • {caregiverPhone}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${caregiverName}`}
            onPress={() => Linking.openURL(`tel:${caregiverPhone}`)}
            style={styles.callCircleBtn}
          >
            <Ionicons name="call" size={20} color={colors.white} />
          </Pressable>
        </View>

        {/* 112 Helpline Button */}
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL("tel:112")}
          style={styles.helplineCard}
        >
          <Ionicons name="medical" size={22} color={colors.red} />
          <Text style={styles.helplineText}>{t("dial112Urgent")}</Text>
        </Pressable>

        <View style={styles.bottomSection}>
          {!isResolved ? (
            <ActionButton
              onPress={() => setShowSafetyConfirm(true)}
            >
              I am safe now
            </ActionButton>
          ) : null}
          <ActionButton variant="secondary" onPress={() => router.back()}>
            {t("done")}
          </ActionButton>
        </View>
      </Screen>
    );
  }

  // 2. Confirmation Step (Figma Screen 21)
  if (showConfirm) {
    return (
      <Screen>
        <View style={styles.topNav}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowConfirm(false)}
            style={styles.backRow}
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
            <Text style={styles.backLabel}>{t("cancel")}</Text>
          </Pressable>
        </View>

        <View style={styles.confirmBox}>
          <View style={styles.warningCircleLarge}>
            <Ionicons name="warning" size={48} color={colors.red} />
          </View>
          <Text style={styles.confirmTitle}>{t("sendAlertQuestion")}</Text>
          <Text style={styles.confirmSubtitle}>
            {t("sendAlertDesc", { name: caregiverName })}
          </Text>
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={styles.errorMessage}>
            We couldn't connect. Please check connection or call 112 directly.
          </Text>
        ) : null}

        <View style={styles.confirmActions}>
          <ActionButton
            variant="danger"
            loading={sending}
            onPress={() => void send()}
          >
            {t("yesSendAlert")}
          </ActionButton>
          <ActionButton
            variant="secondary"
            disabled={sending}
            onPress={() => setShowConfirm(false)}
          >
            {t("noCancelAlert")}
          </ActionButton>
        </View>
      </Screen>
    );
  }

  // 3. Initial SOS Screen (Figma Screen 20)
  return (
    <Screen>
      <View style={styles.topNav}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backRow}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
          <Text style={styles.backLabel}>{t("back")}</Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>{t("needImmediateHelp")}</Text>
        <Text style={styles.subtitle}>
          {t("sosSubtitle")}
        </Text>
      </View>

      {/* Giant SOS Card Button (Figma 160px height) */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowConfirm(true)}
        style={({ pressed }) => [
          styles.bigSosButton,
          pressed && styles.pressedState,
        ]}
      >
        <View style={styles.sosEmblem}>
          <Ionicons name="warning" size={38} color={colors.red} />
        </View>
        <Text style={styles.bigSosText}>SOS</Text>
        <Text style={styles.bigSosSub}>{t("emergencyHelp")}</Text>
      </Pressable>

      <Text style={styles.confirmNotice}>
        {t("confirmBeforeAlert")}
      </Text>

      {/* Emergency Contact Card */}
      <View style={styles.contactCard}>
        <View style={styles.contactAvatar}>
          <Ionicons name="call" size={24} color={colors.green} />
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{caregiverName}</Text>
          <Text style={styles.contactRole}>{t("emergencyContact")} • {caregiverPhone}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL(`tel:${caregiverPhone}`)}
          style={styles.callCircleBtn}
        >
          <Ionicons name="call" size={20} color={colors.white} />
        </Pressable>
      </View>

      <ActionButton
        variant="secondary"
        onPress={() => Linking.openURL(`tel:${caregiverPhone}`)}
      >
        {t("callFamily")}
      </ActionButton>

      {/* Helpline 112 Note */}
      <Pressable
        accessibilityRole="button"
        onPress={() => Linking.openURL("tel:112")}
        style={styles.helplineCard}
      >
        <Ionicons name="information-circle" size={22} color={colors.red} />
        <Text style={styles.helplineText}>
          {t("helplineText", { number: "112" })}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topNav: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
  },
  backLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.ink,
  },
  header: {
    gap: 6,
    marginVertical: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    lineHeight: 36,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    lineHeight: 26,
    color: colors.muted,
  },
  bigSosButton: {
    backgroundColor: colors.red,
    borderRadius: 24,
    height: 168,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginVertical: 14,
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  sosEmblem: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  bigSosText: {
    fontFamily: "Inter_700Bold",
    fontSize: 34,
    color: colors.white,
    letterSpacing: 2,
  },
  bigSosSub: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: "rgba(255, 255, 255, 0.9)",
  },
  confirmNotice: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 16,
  },
  contactCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 8,
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  contactInfo: {
    flex: 1,
    gap: 3,
  },
  contactName: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: colors.ink,
  },
  contactRole: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.muted,
  },
  callCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  helplineCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FDF2F4",
    borderWidth: 1,
    borderColor: "#FAD1D7",
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  helplineText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: colors.red,
    flex: 1,
  },
  helplineBold: {
    fontFamily: "Inter_700Bold",
  },
  confirmBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
    marginVertical: 24,
  },
  warningCircleLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FDF2F4",
    borderWidth: 2,
    borderColor: "#FAD1D7",
    alignItems: "center",
    justifyContent: "center",
  },
  safetyCircleLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.mint,
    borderWidth: 2,
    borderColor: "#C5E8D4",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: colors.ink,
    textAlign: "center",
  },
  confirmSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    lineHeight: 26,
    color: colors.muted,
    textAlign: "center",
  },
  confirmActions: {
    gap: 14,
    marginTop: "auto",
    paddingBottom: 20,
  },
  errorMessage: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.red,
    textAlign: "center",
    marginVertical: 8,
  },
  statusPanel: {
    gap: 14,
    marginVertical: 12,
  },
  statusHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  statusTextCol: {
    flex: 1,
    gap: 2,
  },
  statusTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: colors.ink,
  },
  statusTime: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.muted,
  },
  statusDescription: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
  },
  bottomSection: {
    marginTop: "auto",
    paddingTop: 16,
    paddingBottom: 16,
  },
  pressedState: {
    transform: [{ scale: 0.98 }],
    opacity: 0.93,
  },
});
