import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { LoadingState } from "@/components/LoadingState";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { useFamilyRealtime } from "@/hooks/useFamilyRealtime";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";
import type { FamilyMember } from "@/components/FamilyList";

type Medicine = {
  id: string;
  name: string;
  dosage?: string;
  elderly_user_id: string;
  is_active: boolean;
};

type Log = {
  id: string;
  medication_id: string;
  status: "confirmed_taken" | "skipped" | "not_confirmed";
  created_at: string;
};

export default function Medicines() {
  const router = useRouter();
  const family = useFamilyContext();
  const id = family.data?.family.id;
  const { t, language } = useI18n();

  const medicines = useQuery({
    queryKey: ["medicines", id],
    enabled: !!id,
    queryFn: () => api<Medicine[]>(`/medicines?family_id=${id}`),
  });

  const history = useQuery({
    queryKey: ["medicine-history", id],
    enabled: !!id,
    queryFn: () => api<Log[]>(`/medicines/history?family_id=${id}`),
  });

  const members = useQuery({
    queryKey: ["members", id],
    enabled: !!id,
    queryFn: () => api<FamilyMember[]>(`/families/${id}/members`),
  });

  useFamilyRealtime(id);

  if (family.isLoading || medicines.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (family.error || medicines.error) {
    return (
      <Screen>
        <ProblemState
          message={t("medNotSaved")}
          retry={() => void medicines.refetch()}
        />
      </Screen>
    );
  }

  const allMeds = medicines.data ?? [];
  const logs = history.data ?? [];
  const locale = language === "hi" ? "hi-IN" : language === "ta" ? "ta-IN" : "en-US";

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>{t("medicineCare")}</Text>
        <Text style={styles.pageSubtitle}>{t("medicineCareSub")}</Text>
      </View>

      {/* Add Medicine Action */}
      <View style={styles.actionWrap}>
        <ActionButton onPress={() => router.push("/(caregiver)/add-medicine")}>
          <Ionicons name="add" size={20} color={colors.white} /> {t("addMedicine")}
        </ActionButton>
      </View>

      {/* Active Schedules Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Prescriptions & Schedules</Text>
        {allMeds.length ? (
          <View style={styles.list}>
            {allMeds.map((med) => {
              const senior = members.data?.find((m) => m.user_id === med.elderly_user_id);
              const seniorName = senior?.profile?.full_name;

              return (
                <View key={med.id} style={styles.medCard}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="medkit" size={22} color={colors.green} />
                  </View>

                  <View style={styles.medInfo}>
                    <View style={styles.medTitleRow}>
                      <Text style={styles.medName}>{med.name}</Text>
                      {med.dosage ? (
                        <View style={styles.dosagePill}>
                          <Text style={styles.dosageText}>{med.dosage}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.medMetaRow}>
                      {seniorName ? (
                        <View style={styles.metaItem}>
                          <Ionicons name="person-outline" size={13} color={colors.muted} />
                          <Text style={styles.metaText}>{seniorName}</Text>
                        </View>
                      ) : null}
                      <View style={styles.metaItem}>
                        <Ionicons name="alarm-outline" size={13} color={colors.muted} />
                        <Text style={styles.metaText}>Daily Reminders</Text>
                      </View>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      med.is_active ? styles.statusPillGreen : styles.statusPillMuted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        med.is_active ? styles.statusPillTextGreen : styles.statusPillTextMuted,
                      ]}
                    >
                      {med.is_active ? t("activeSchedule") : t("paused")}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="medkit-outline" size={40} color={colors.green} />
            </View>
            <Text style={styles.emptyTitle}>{t("noMedicinesListed")}</Text>
            <Text style={styles.emptySubtitle}>
              Add prescriptions with daily times to keep a clear record of doses.
            </Text>
          </View>
        )}
      </View>

      {/* Recent Confirmations Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("recentConfirmations")}</Text>
        {history.error ? (
          <ProblemState
            message={t("medNotSaved")}
            retry={() => void history.refetch()}
          />
        ) : history.isLoading ? (
          <LoadingState />
        ) : logs.length ? (
          <View style={styles.list}>
            {logs.slice(0, 10).map((log) => {
              const med = allMeds.find((m) => m.id === log.medication_id);
              const isTaken = log.status === "confirmed_taken";
              const isSkipped = log.status === "skipped";

              return (
                <View key={log.id} style={styles.logCard}>
                  <View
                    style={[
                      styles.logDot,
                      isTaken ? styles.logDotGreen : isSkipped ? styles.logDotRed : styles.logDotBlue,
                    ]}
                  >
                    <Ionicons
                      name={isTaken ? "checkmark" : isSkipped ? "close" : "time"}
                      size={14}
                      color={isTaken ? colors.green : isSkipped ? colors.red : colors.blue}
                    />
                  </View>

                  <View style={styles.logInfo}>
                    <Text style={styles.logTitle}>{med?.name || t("medicines")}</Text>
                    <Text style={styles.logTime}>
                      {new Date(log.created_at).toLocaleString(locale, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      isTaken ? styles.statusPillGreen : isSkipped ? styles.statusPillRed : styles.statusPillBlue,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        isTaken ? styles.statusPillTextGreen : isSkipped ? styles.statusPillTextRed : styles.statusPillTextBlue,
                      ]}
                    >
                      {isTaken
                        ? t("reportedTaken")
                        : isSkipped
                        ? t("markedSkipped")
                        : t("notConfirmed")}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyLogsCard}>
            <Ionicons name="time-outline" size={24} color={colors.muted} />
            <Text style={styles.emptyLogsText}>{t("noMedResponses")}</Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 6,
    marginBottom: 16,
  },
  pageTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: colors.ink,
  },
  pageSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
    lineHeight: 22,
  },
  actionWrap: {
    marginBottom: 20,
  },
  section: {
    gap: 12,
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    color: colors.ink,
  },
  list: {
    gap: 12,
  },
  medCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  medInfo: {
    flex: 1,
    gap: 4,
  },
  medTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  medName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.ink,
  },
  dosagePill: {
    backgroundColor: colors.pale,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dosageText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: colors.blue,
  },
  medMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillGreen: {
    backgroundColor: colors.mint,
  },
  statusPillRed: {
    backgroundColor: colors.rose,
  },
  statusPillBlue: {
    backgroundColor: colors.pale,
  },
  statusPillMuted: {
    backgroundColor: "#F0F2F6",
  },
  statusPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  statusPillTextGreen: {
    color: colors.green,
  },
  statusPillTextRed: {
    color: colors.red,
  },
  statusPillTextBlue: {
    color: colors.blue,
  },
  statusPillTextMuted: {
    color: colors.muted,
  },
  logCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  logDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  logDotGreen: {
    backgroundColor: colors.mint,
  },
  logDotRed: {
    backgroundColor: colors.rose,
  },
  logDotBlue: {
    backgroundColor: colors.pale,
  },
  logInfo: {
    flex: 1,
    gap: 2,
  },
  logTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.ink,
  },
  logTime: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  emptyLogsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyLogsText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.muted,
  },
});
