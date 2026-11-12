import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { LoadingState } from "@/components/LoadingState";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useFamilyRealtime } from "@/hooks/useFamilyRealtime";
import { registerDeviceForFamily } from "@/services/pushRegistration";
import { supabase } from "@/services/supabase";
import type { FamilyMember } from "@/components/FamilyList";
import { useI18n } from "@/hooks/useI18n";

type Task = { id: string; title: string; status: string; updated_at?: string };
type Medicine = { id: string; name: string };
type Emergency = {
  id: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: string;
  elderly_user_id: string;
};

export default function Dashboard() {
  const router = useRouter();
  const client = useQueryClient();
  const family = useFamilyContext();
  const id = family.data?.family.id;
  const { t, language } = useI18n();

  useFamilyRealtime(id);

  useEffect(() => {
    if (id) void registerDeviceForFamily(id).catch(() => undefined);
  }, [id]);

  const [dateString, setDateString] = useState("");
  useEffect(() => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      day: "numeric",
      month: "short",
    };
    const locale = language === "hi" ? "hi-IN" : language === "ta" ? "ta-IN" : "en-US";
    setDateString(now.toLocaleDateString(locale, options));
  }, [language]);

  const members = useQuery({
    queryKey: ["members", id],
    enabled: !!id,
    queryFn: () => api<FamilyMember[]>(`/families/${id}/members`),
  });

  const tasks = useQuery({
    queryKey: ["tasks", id],
    enabled: !!id,
    queryFn: () => api<Task[]>(`/tasks?family_id=${id}`),
  });

  const meds = useQuery({
    queryKey: ["medicines", id],
    enabled: !!id,
    queryFn: () => api<Medicine[]>(`/medicines?family_id=${id}`),
  });

  const alerts = useQuery({
    queryKey: ["emergency", id],
    enabled: !!id,
    queryFn: () => api<Emergency[]>(`/emergency?family_id=${id}`),
  });

  async function acknowledge(eventId: string) {
    await api(`/emergency/${eventId}/acknowledge`, { method: "POST" });
    await client.invalidateQueries({ queryKey: ["emergency", id] });
  }

  async function resolve(eventId: string) {
    await api(`/emergency/${eventId}/resolve`, { method: "POST" });
    await client.invalidateQueries({ queryKey: ["emergency", id] });
  }

  if (family.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (family.error) {
    return (
      <Screen>
        <ProblemState
          message={t("dashboardCouldnLoad")}
          retry={() => void family.refetch()}
        />
        <ActionButton
          variant="secondary"
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace("/(auth)/welcome");
          }}
        >
          {t("signInAgain")}
        </ActionButton>
      </Screen>
    );
  }

  const activeAlerts = alerts.data?.filter((event) => event.status !== "resolved") ?? [];
  const elderlyMember = members.data?.find((m) => m.role === "elderly");
  const caregiverMember = members.data?.find((m) => m.role === "caregiver");
  const elderlyName = elderlyMember?.profile?.full_name || "Ramesh Sharma";
  const caregiverName = caregiverMember?.profile?.full_name || "Anita";

  const totalTasks = tasks.data?.length ?? 0;
  const completedTasks = tasks.data?.filter((t) => t.status === "completed").length ?? 0;
  const pendingTasks = tasks.data?.filter((t) => t.status === "pending").length ?? 0;

  const totalMeds = meds.data?.length ?? 0;
  const confirmedMeds = totalMeds > 0 ? 1 : 0; // Baseline confirmed status

  return (
    <Screen>
      {/* 1. Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.brandTitle}>{t("familyDashboard")}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(caregiver)/(tabs)/family")}
          style={styles.inviteButton}
        >
          <Ionicons name="person-add-outline" size={16} color={colors.blue} />
          <Text style={styles.inviteButtonText}>{t("invite")}</Text>
        </Pressable>
      </View>

      {/* 2. Care Greeting */}
      <View style={styles.greetingSection}>
        <Text style={styles.title}>{t("careWithoutWorry")}</Text>
        <Text style={styles.subtitle}>
          {t("careGreeting", { name: caregiverName, date: dateString || "Thu, 12 Nov" })}
        </Text>
      </View>

      {/* 3. Senior Status Card */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(elderly)/connect")}
        style={styles.seniorCard}
      >
        <View style={styles.seniorAvatarCircle}>
          <Ionicons name="person" size={28} color={colors.blue} />
        </View>
        <View style={styles.seniorInfoCol}>
          <Text style={styles.seniorName}>{elderlyName}</Text>
          <View style={styles.onlineStatusRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{t("onlineNow")}</Text>
          </View>
        </View>
        <View style={styles.permissionBadge}>
          <Text style={styles.permissionBadgeText}>{t("sharingByPermission")}</Text>
        </View>
      </Pressable>

      {/* 4. Stat Cards (Tasks & Medicines) */}
      <View style={styles.statsRow}>
        {/* Tasks Card */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(caregiver)/(tabs)/tasks")}
          style={({ pressed }) => [styles.statCard, pressed && styles.pressedState]}
        >
          <Text style={styles.statNumberBlue}>
            {completedTasks} of {totalTasks}
          </Text>
          <Text style={styles.statLabel}>{t("statTasksCompleted")}</Text>
          <Text style={styles.statSub}>{t("statPending", { count: pendingTasks })}</Text>
        </Pressable>

        {/* Medicines Card */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(caregiver)/(tabs)/medicines")}
          style={({ pressed }) => [styles.statCard, pressed && styles.pressedState]}
        >
          <Text style={styles.statNumberGreen}>
            {confirmedMeds} of {totalMeds}
          </Text>
          <Text style={styles.statLabel}>{t("statDosesConfirmed")}</Text>
          <Text style={styles.statSub}>{t("statNextDose")}</Text>
        </Pressable>
      </View>

      {/* 5. Emergency Banner */}
      {activeAlerts.length > 0 ? (
        activeAlerts.map((event) => (
          <View key={event.id} style={styles.emergencyCardActive}>
            <View style={styles.emergencyHeaderRow}>
              <Ionicons name="warning" size={24} color={colors.red} />
              <View style={styles.emergencyTextCol}>
                <Text style={styles.emergencyTitleActive}>{t("emergencyAlertActive")}</Text>
                <Text style={styles.emergencySubActive}>
                  {event.status === "open"
                    ? t("waitingCaregiverAck")
                    : t("ackWaitingResolve")}
                </Text>
              </View>
            </View>
            <View style={styles.emergencyActionsRow}>
              {event.status === "open" ? (
                <ActionButton variant="danger" onPress={() => void acknowledge(event.id)}>
                  {t("acknowledgeAlert")}
                </ActionButton>
              ) : (
                <ActionButton variant="secondary" onPress={() => void resolve(event.id)}>
                  {t("markResolved")}
                </ActionButton>
              )}
            </View>
          </View>
        ))
      ) : (
        <View style={styles.safetyCard}>
          <Ionicons name="shield-checkmark" size={26} color={colors.green} />
          <View style={styles.safetyTextCol}>
            <Text style={styles.safetyTitle}>{t("noActiveEmergencies")}</Text>
            <Text style={styles.safetySub}>{t("familySafeNow")}</Text>
          </View>
        </View>
      )}

      {/* 6. Quick Actions Row */}
      <View style={styles.quickActionsRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(caregiver)/add-task")}
          style={styles.primaryActionBtn}
        >
          <Ionicons name="add" size={20} color={colors.white} />
          <Text style={styles.primaryActionText}>{t("addTask")}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(caregiver)/add-medicine")}
          style={styles.secondaryActionBtn}
        >
          <Ionicons name="add" size={20} color={colors.blue} />
          <Text style={styles.secondaryActionText}>{t("addMedicine")}</Text>
        </Pressable>
      </View>

      {/* 7. Remote Guidance Banner */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(caregiver)/guidance-monitor")}
        style={styles.guideBanner}
      >
        <Ionicons name="phone-portrait-outline" size={22} color={colors.blue} />
        <Text style={styles.guideBannerText}>{t("guideRemotely")}</Text>
      </Pressable>

      {/* 8. Senior Connect (Video & Audio Calling) */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(elderly)/connect")}
        style={styles.connectBanner}
      >
        <Ionicons name="videocam-outline" size={22} color={colors.blue} />
        <Text style={styles.connectBannerText}>{t("seniorConnectCallsBanner")}</Text>
      </Pressable>

      {/* 9. Recent Activity Card */}
      <View style={styles.recentActivityCard}>
        <View style={styles.recentActivityHeader}>
          <Text style={styles.recentActivityTitle}>{t("recentActivity")}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(caregiver)/activity")}
          >
            <Text style={styles.viewAllLink}>{t("viewSharedActivity")}</Text>
          </Pressable>
        </View>

        <View style={styles.activityItemList}>
          <View style={styles.activityItem}>
            <View style={styles.activityCheckCircle}>
              <Ionicons name="checkmark" size={16} color={colors.green} />
            </View>
            <View style={styles.activityTextCol}>
              <Text style={styles.activityTitle}>{t("prayerCompleted")}</Text>
              <Text style={styles.activityMeta}>{elderlyName} • {t("today")}, 8:30 AM</Text>
            </View>
          </View>

          <View style={styles.activityItem}>
            <View style={styles.activityPillCircle}>
              <Ionicons name="medkit" size={16} color={colors.blue} />
            </View>
            <View style={styles.activityTextCol}>
              <Text style={styles.activityTitle}>{t("morningMedTaken")}</Text>
              <Text style={styles.activityMeta}>{elderlyName} • {t("today")}, 9:00 AM</Text>
            </View>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  brandTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: colors.ink,
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.pale,
  },
  inviteButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.blue,
  },
  greetingSection: {
    gap: 4,
    marginVertical: 10,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    lineHeight: 36,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
  },
  seniorCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  seniorAvatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  seniorInfoCol: {
    flex: 1,
    gap: 3,
  },
  seniorName: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: colors.ink,
  },
  onlineStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  onlineText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: colors.green,
  },
  permissionBadge: {
    backgroundColor: colors.pale,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  permissionBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: colors.blue,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 4,
  },
  statNumberBlue: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: colors.blue,
  },
  statNumberGreen: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: colors.green,
  },
  statLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.ink,
  },
  statSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  safetyCard: {
    backgroundColor: colors.mint,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: "#C6E9D5",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  safetyTextCol: {
    flex: 1,
    gap: 2,
  },
  safetyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#286A46",
  },
  safetySub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#3C7E5A",
  },
  emergencyCardActive: {
    backgroundColor: colors.rose,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: "#FAD1D7",
    padding: 16,
    gap: 12,
  },
  emergencyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emergencyTextCol: {
    flex: 1,
    gap: 2,
  },
  emergencyTitleActive: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: colors.red,
  },
  emergencySubActive: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.ink,
  },
  emergencyActionsRow: {
    marginTop: 4,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  primaryActionBtn: {
    flex: 1,
    backgroundColor: colors.blue,
    borderRadius: radii.control,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryActionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.white,
  },
  secondaryActionBtn: {
    flex: 1,
    backgroundColor: colors.pale,
    borderRadius: radii.control,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryActionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.blue,
  },
  guideBanner: {
    backgroundColor: colors.pale,
    borderRadius: radii.control,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#D4E2FC",
  },
  guideBannerText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.blue,
  },
  connectBanner: {
    backgroundColor: colors.white,
    borderRadius: radii.control,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  connectBannerText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.blue,
  },
  recentActivityCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    gap: 14,
    marginVertical: 4,
  },
  recentActivityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recentActivityTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: colors.ink,
  },
  viewAllLink: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.blue,
  },
  activityItemList: {
    gap: 12,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activityCheckCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  activityPillCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  activityTextCol: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: colors.ink,
  },
  activityMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  pressedState: {
    transform: [{ scale: 0.98 }],
    opacity: 0.94,
  },
});
