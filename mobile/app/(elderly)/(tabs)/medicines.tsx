import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { LoadingState } from "@/components/LoadingState";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useFamilyRealtime } from "@/hooks/useFamilyRealtime";
import { syncMedicineReminders, type Reminder } from "@/services/medicineReminders";
import { useI18n } from "@/hooks/useI18n";

type Medicine = {
  id: string;
  name: string;
  dosage?: string;
  instructions?: string;
  elderly_user_id: string;
};
type Schedule = {
  id: string;
  scheduled_time: string;
  days_of_week: number[];
  is_active: boolean;
};

export default function Medicines() {
  const { t } = useI18n();
  const family = useFamilyContext();
  const client = useQueryClient();
  const familyId = family.data?.family.id;

  useFamilyRealtime(familyId);

  const [recentlyResponded, setRecentlyResponded] = useState<
    Record<string, { status: "confirmed_taken" | "skipped"; time: string }>
  >({});

  const query = useQuery({
    queryKey: ["medicines", familyId],
    enabled: !!familyId,
    queryFn: () => api<Medicine[]>(`/medicines?family_id=${familyId}`),
  });

  const scheduleQueries = useQueries({
    queries: (query.data ?? []).map((medicine) => ({
      queryKey: ["medication-schedules", medicine.id],
      queryFn: () => api<Schedule[]>(`/medicines/${medicine.id}/schedules`),
    })),
  });

  useEffect(() => {
    const reminders: Reminder[] = (query.data ?? []).flatMap((medicine, index) =>
      (scheduleQueries[index]?.data ?? []).map((schedule) => ({
        ...schedule,
        name: medicine.name,
        ...{ id: medicine.id },
      }))
    );
    if (
      query.data &&
      !scheduleQueries.some((item) => item.isLoading || item.isError)
    ) {
      void syncMedicineReminders(reminders).catch(() => undefined);
    }
  }, [query.data, scheduleQueries.map((item) => item.dataUpdatedAt).join(",")]);

  async function respond(medicineId: string, status: "confirmed_taken" | "skipped") {
    try {
      await api(`/medicines/${medicineId}/logs`, {
        method: "POST",
        body: JSON.stringify({
          status,
          scheduled_for: new Date().toISOString(),
        }),
      });
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setRecentlyResponded((prev) => ({
        ...prev,
        [medicineId]: {
          status,
          time: timeStr,
        },
      }));
      await client.invalidateQueries({ queryKey: ["medicines", familyId] });
      Alert.alert(
        status === "confirmed_taken" ? t("doseRecorded") : t("markedForLater"),
        status === "confirmed_taken"
          ? t("doseRecordedBody")
          : t("markedForLaterBody")
      );
    } catch {
      Alert.alert("Response not saved", "Check your connection and try again.");
    }
  }

  if (family.isLoading || query.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (family.error || query.error) {
    return (
      <Screen>
        <ProblemState
          message="Medicine reminders couldn’t be loaded."
          retry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const mine =
    query.data?.filter(
      (medicine) => medicine.elderly_user_id === family.data?.membership.user_id
    ) ?? [];

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("medicines")}</Text>
        <Text style={styles.subtitle}>
          {t("medicineSubtitle")}
        </Text>
      </View>

      {mine.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="medkit-outline" size={32} color={colors.blue} />
          <Text style={styles.emptyTitle}>{t("noMedicinesListed")}</Text>
          <Text style={styles.emptySubtitle}>
            {t("noMedicinesSchedule")}
          </Text>
        </View>
      ) : (
        mine.map((medicine, index) => {
          const schedules = scheduleQueries[index]?.data ?? [];
          const recent = recentlyResponded[medicine.id];

          return (
            <View key={medicine.id} style={styles.medicineCard}>
              {/* Card Header Row */}
              <View style={styles.cardHeaderRow}>
                <View style={styles.pillIconCircle}>
                  <Ionicons name="medkit" size={24} color={colors.green} />
                </View>
                <View style={styles.cardHeaderInfo}>
                  <Text style={styles.medicineName}>{medicine.name}</Text>
                  {medicine.dosage ? (
                    <Text style={styles.dosageText}>{medicine.dosage}</Text>
                  ) : null}
                </View>
              </View>

              {/* Instructions */}
              {medicine.instructions ? (
                <View style={styles.instructionsBox}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.muted} />
                  <Text style={styles.instructionsText}>{medicine.instructions}</Text>
                </View>
              ) : null}

              {/* Schedule Timing Chips */}
              <View style={styles.scheduleRow}>
                {schedules.map((schedule) => (
                  <View key={schedule.id} style={styles.timeBadge}>
                    <Ionicons name="time-outline" size={14} color={colors.blue} />
                    <Text style={styles.timeBadgeText}>
                      {schedule.scheduled_time.slice(0, 5)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Status Badge (if responded) */}
              {recent ? (
                <View
                  style={[
                    styles.statusBadgeBox,
                    recent.status === "confirmed_taken"
                      ? styles.statusBadgeTaken
                      : styles.statusBadgeSkipped,
                  ]}
                >
                  <Ionicons
                    name={
                      recent.status === "confirmed_taken"
                        ? "checkmark-circle"
                        : "time"
                    }
                    size={20}
                    color={
                      recent.status === "confirmed_taken"
                        ? colors.green
                        : colors.red
                    }
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      recent.status === "confirmed_taken"
                        ? styles.statusBadgeTextTaken
                        : styles.statusBadgeTextSkipped,
                    ]}
                  >
                    {recent.status === "confirmed_taken"
                      ? t("takenAt", { time: recent.time })
                      : t("markedLaterAt", { time: recent.time })}
                  </Text>
                </View>
              ) : null}

              {/* Action Buttons Row (64px) */}
              <View style={styles.buttonsRow}>
                <View style={styles.buttonCol}>
                  <ActionButton
                    onPress={() => void respond(medicine.id, "confirmed_taken")}
                  >
                    {t("iTookThis")}
                  </ActionButton>
                </View>
                <View style={styles.buttonCol}>
                  <ActionButton
                    variant="secondary"
                    onPress={() => void respond(medicine.id, "skipped")}
                  >
                    {t("later")}
                  </ActionButton>
                </View>
              </View>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    lineHeight: 26,
    color: colors.muted,
  },
  medicineCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 14,
    marginVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  pillIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  medicineName: {
    fontFamily: "Inter_700Bold",
    fontSize: 21,
    color: colors.ink,
  },
  dosageText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.muted,
  },
  instructionsBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 12,
  },
  instructionsText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.ink,
    flex: 1,
  },
  scheduleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.pale,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  timeBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.blue,
  },
  statusBadgeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  statusBadgeTaken: {
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: "#C6E9D5",
  },
  statusBadgeSkipped: {
    backgroundColor: colors.rose,
    borderWidth: 1,
    borderColor: "#FAD1D7",
  },
  statusBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  statusBadgeTextTaken: {
    color: "#286A46",
  },
  statusBadgeTextSkipped: {
    color: colors.red,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  buttonCol: {
    flex: 1,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: "center",
    gap: 10,
    marginVertical: 12,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
    textAlign: "center",
  },
});
