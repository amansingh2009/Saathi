import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { LoadingState } from "@/components/LoadingState";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { supabase } from "@/services/supabase";
import { useI18n } from "@/hooks/useI18n";
import { colors, radii } from "@/theme/tokens";

type Task = { id: string; title: string; status: string };
type Medicine = { id: string; name: string; dosage?: string };
type Member = { user_id: string; role: string; profile?: { full_name?: string } };

export default function ElderlyHome() {
  const router = useRouter();
  const { t, language, setLanguage } = useI18n();
  const family = useFamilyContext();
  const familyId = family.data?.family.id;

  const [currentTime, setCurrentTime] = useState("");
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const locale = language === "hi" ? "hi-IN" : language === "ta" ? "ta-IN" : "en-US";
      const options: Intl.DateTimeFormatOptions = {
        weekday: "long",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      };
      setCurrentTime(now.toLocaleString(locale, options));
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 60000);
    return () => clearInterval(interval);
  }, [language]);

  const tasks = useQuery({
    queryKey: ["tasks", familyId],
    enabled: !!familyId,
    queryFn: () => api<Task[]>(`/tasks?family_id=${familyId}`),
  });

  const meds = useQuery({
    queryKey: ["medicines", familyId],
    enabled: !!familyId,
    queryFn: () => api<Medicine[]>(`/medicines?family_id=${familyId}`),
  });

  const members = useQuery({
    queryKey: ["members", familyId],
    enabled: !!familyId,
    queryFn: () => api<Member[]>(`/families/${familyId}/members`),
  });

  const medHistory = useQuery({
    queryKey: ["medicine-history", familyId],
    enabled: !!familyId,
    queryFn: () =>
      api<Array<{ id: string; medication_id: string; status: string; created_at: string }>>(
        `/medicines/history?family_id=${familyId}`
      ),
  });

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
          message="We couldn’t load your family details."
          retry={() => void family.refetch()}
        />
        <ActionButton
          variant="secondary"
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace("/(auth)/welcome");
          }}
        >
          {t("signIn")}
        </ActionButton>
      </Screen>
    );
  }

  if (!family.data) {
    return (
      <Screen>
        <View style={styles.headerRow}>
          <Text style={styles.brandLogo}>{t("appName")}</Text>
        </View>
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>Connect with your family</Text>
          <Text style={styles.welcomeSubtitle}>
            Join using an invitation from a trusted family member.
          </Text>
          <ActionButton onPress={() => router.push("/(auth)/join-family")}>
            Join family
          </ActionButton>
        </View>
      </Screen>
    );
  }

  const completedCount = tasks.data?.filter((t) => t.status === "completed").length ?? 0;
  const totalCount = tasks.data?.length ?? 0;
  const pendingCount = tasks.data?.filter((t) => t.status === "pending").length ?? 0;
  const isAllTasksDone = totalCount > 0 && pendingCount === 0;
  const today = new Date().toDateString();
  const todayTakenLog = medHistory.data?.find(
    (log) => log.status === "confirmed_taken" && new Date(log.created_at).toDateString() === today
  );
  const locale = language === "hi" ? "hi-IN" : language === "ta" ? "ta-IN" : "en-US";
  const caregiver = members.data?.find((m) => m.role === "caregiver")?.profile?.full_name || "Anita";
  const firstMed = meds.data?.[0];

  return (
    <Screen>
      {/* 1. Top bar: Logo + Language Badge */}
      <View style={styles.headerRow}>
        <Text style={styles.brandLogo}>{t("appName")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change language"
          onPress={() => setShowLanguageModal(true)}
          style={styles.langBadge}
        >
          <Ionicons name="globe-outline" size={16} color={colors.muted} />
          <Text style={styles.langText}>
            {language === "hi" ? "हिन्दी" : language === "ta" ? "தமிழ்" : "English"}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.muted} />
        </Pressable>
      </View>

      {/* 2. Senior Greeting + Date/Time */}
      <View style={styles.greetingSection}>
        <Text style={styles.greetingTitle}>
          {t("helloGrandpa")}
        </Text>
        <Text style={styles.greetingDate}>{currentTime || "Thursday, 12 Nov • 9:41 AM"}</Text>
      </View>

      {/* 3. Hero Voice Action: Talk to Saathi */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(elderly)/assistant")}
        style={({ pressed }) => [
          styles.voiceHeroCard,
          pressed && styles.pressedState,
        ]}
      >
        <View style={styles.micCircle}>
          <Ionicons name="mic" size={32} color={colors.blue} />
        </View>
        <View style={styles.voiceTextCol}>
          <Text style={styles.voiceHeroTitle}>{t("talk")}</Text>
          <Text style={styles.voiceHeroSubtitle}>{t("tapAndSay")}</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={colors.white} />
      </Pressable>

      {/* 4. SOS Emergency Card */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(elderly)/sos")}
        style={({ pressed }) => [
          styles.sosCard,
          pressed && styles.pressedState,
        ]}
      >
        <Ionicons name="warning" size={26} color={colors.white} />
        <Text style={styles.sosText}>{t("sosCard")}</Text>
        <Ionicons name="chevron-forward" size={22} color={colors.white} />
      </Pressable>

      {/* 5. Today's Tasks Card (Figma Screen 52: Home · Walk completed) */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(elderly)/(tabs)/tasks")}
        style={({ pressed }) => [
          styles.infoCard,
          isAllTasksDone && styles.infoCardCelebration,
          pressed && styles.pressedState,
        ]}
      >
        <View style={isAllTasksDone ? styles.iconCircleGreen : styles.iconCircleBlue}>
          <Ionicons
            name={isAllTasksDone ? "checkmark-done-circle" : "checkbox-outline"}
            size={24}
            color={isAllTasksDone ? colors.green : colors.blue}
          />
        </View>
        <View style={styles.infoCol}>
          <Text style={styles.infoTitle}>
            {isAllTasksDone ? "All Tasks Completed! 🎉" : t("todaysTasks")}
          </Text>
          <Text style={styles.infoSubtitle}>
            {totalCount > 0
              ? isAllTasksDone
                ? `${t("tasksCompletedCount", { completed: completedCount, total: totalCount })} • Well done!`
                : t("tasksCompletedCount", { completed: completedCount, total: totalCount })
              : t("noTasksToday")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>

      {/* 6. Morning Medicine Card (Figma Screen 43: Home · Medicine confirmed) */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(elderly)/(tabs)/medicines")}
        style={({ pressed }) => [
          styles.infoCard,
          todayTakenLog && styles.infoCardCelebration,
          pressed && styles.pressedState,
        ]}
      >
        <View style={styles.iconCircleGreen}>
          <Ionicons
            name={todayTakenLog ? "checkmark-circle" : "medkit"}
            size={24}
            color={colors.green}
          />
        </View>
        <View style={styles.infoCol}>
          <Text style={styles.infoTitle}>
            {todayTakenLog ? "Morning Medicine • Taken ✓" : t("morningMedicine")}
          </Text>
          <Text style={styles.infoSubtitle}>
            {todayTakenLog
              ? `Confirmed taken today at ${new Date(todayTakenLog.created_at).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : firstMed
              ? `${firstMed.name}${firstMed.dosage ? ` • ${firstMed.dosage}` : ""} • 10:00 AM`
              : "Metformin 500 mg • 10:00 AM"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>

      {/* 7. Quick Actions Row (Bhajan + Call Family / Friends) */}
      <View style={styles.actionGridRow}>
        {/* Listen to Bhajan */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(elderly)/bhajan")}
          style={({ pressed }) => [
            styles.gridActionCard,
            pressed && styles.pressedState,
          ]}
        >
          <View style={styles.iconCirclePurple}>
            <Ionicons name="musical-notes" size={26} color="#7C3AED" />
          </View>
          <Text style={styles.gridActionTitle}>{t("listenBhajan")}</Text>
          <Text style={styles.gridActionSub}>{t("devotionalPrayer")}</Text>
        </Pressable>

        {/* Senior Connect / Call Friends */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(elderly)/connect")}
          style={({ pressed }) => [
            styles.gridActionCard,
            pressed && styles.pressedState,
          ]}
        >
          <View style={styles.iconCircleTeal}>
            <Ionicons name="call" size={26} color="#0D9488" />
          </View>
          <Text style={styles.gridActionTitle}>{t("seniorConnect")}</Text>
          <Text style={styles.gridActionSub}>{t("callFriends")}</Text>
        </Pressable>
      </View>

      {/* 8. Get Smartphone Help */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(elderly)/help")}
        style={({ pressed }) => [
          styles.helpCard,
          pressed && styles.pressedState,
        ]}
      >
        <View style={styles.helpIconCircle}>
          <Ionicons name="phone-portrait-outline" size={24} color={colors.blue} />
        </View>
        <View style={styles.infoCol}>
          <Text style={styles.helpTitle}>{t("getPhoneHelp")}</Text>
          <Text style={styles.helpSubtitle}>
            {t("readyToHelp", { name: caregiver })}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.blue} />
      </Pressable>

      {/* Quick Language Switcher Modal (Figma Screen 51: Voice language) */}
      <Modal
        visible={showLanguageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowLanguageModal(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <Ionicons name="globe-outline" size={26} color={colors.blue} />
              </View>
              <Text style={styles.modalTitle}>{t("chooseLanguage")}</Text>
              <Text style={styles.modalSubtitle}>{t("languageChangeAnytime")}</Text>
            </View>

            <View style={styles.langOptionList}>
              {[
                { code: "en" as const, label: "English", sublabel: "English" },
                { code: "hi" as const, label: "हिन्दी", sublabel: "Hindi" },
                { code: "ta" as const, label: "தமிழ்", sublabel: "Tamil" },
              ].map((item) => {
                const isSelected = language === item.code;
                return (
                  <Pressable
                    key={item.code}
                    accessibilityRole="button"
                    onPress={() => {
                      setLanguage(item.code);
                      setShowLanguageModal(false);
                    }}
                    style={[
                      styles.langOptionCard,
                      isSelected && styles.langOptionCardSelected,
                    ]}
                  >
                    <View style={styles.langOptionInfo}>
                      <Text
                        style={[
                          styles.langOptionLabel,
                          isSelected && styles.langOptionLabelSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Text style={styles.langOptionSublabel}>{item.sublabel}</Text>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={24} color={colors.blue} />
                    ) : (
                      <View style={styles.langOptionUnselectedDot} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <ActionButton
                variant="secondary"
                onPress={() => setShowLanguageModal(false)}
              >
                {t("cancel")}
              </ActionButton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  brandLogo: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: colors.blue,
    letterSpacing: -0.5,
  },
  langBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  langText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.muted,
  },
  greetingSection: {
    gap: 4,
    marginTop: 6,
    marginBottom: 8,
  },
  greetingTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    lineHeight: 36,
    color: colors.ink,
  },
  greetingDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
  },
  voiceHeroCard: {
    backgroundColor: colors.blue,
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 92,
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  micCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceTextCol: {
    flex: 1,
    gap: 2,
  },
  voiceHeroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: colors.white,
  },
  voiceHeroSubtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: "rgba(255, 255, 255, 0.85)",
  },
  sosCard: {
    backgroundColor: colors.red,
    borderRadius: radii.control,
    paddingHorizontal: 20,
    paddingVertical: 18,
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  sosText: {
    flex: 1,
    marginLeft: 12,
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    color: colors.white,
  },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  infoCardCelebration: {
    backgroundColor: "#F7FCF9",
    borderColor: "#C5E8D4",
  },
  iconCircleBlue: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleGreen: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCol: {
    flex: 1,
    gap: 3,
  },
  infoTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: colors.ink,
  },
  infoSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.muted,
  },
  actionGridRow: {
    flexDirection: "row",
    gap: 14,
  },
  gridActionCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
  },
  iconCirclePurple: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleTeal: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  gridActionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.ink,
  },
  gridActionSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  helpCard: {
    backgroundColor: colors.pale,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: "#D4E2FC",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  helpIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  helpTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.blue,
  },
  helpSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.ink,
  },
  welcomeCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    gap: 16,
    marginVertical: 24,
  },
  welcomeTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: colors.ink,
  },
  welcomeSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
  },
  pressedState: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(23, 43, 77, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: radii.cardMax,
    padding: 24,
    gap: 18,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    alignItems: "center",
    gap: 6,
  },
  modalIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
    textAlign: "center",
  },
  modalSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
  langOptionList: {
    gap: 10,
  },
  langOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: radii.cardMin,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  langOptionCardSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.pale,
  },
  langOptionInfo: {
    gap: 2,
  },
  langOptionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: colors.ink,
  },
  langOptionLabelSelected: {
    color: colors.blue,
  },
  langOptionSublabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  langOptionUnselectedDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  modalActions: {
    marginTop: 4,
  },
});
