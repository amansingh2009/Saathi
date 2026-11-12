import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View, Pressable, Modal, TextInput, ScrollView, Platform } from "react-native";
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

const TIME_PRESETS = [
  { label: "Morning (08:00)", time: "08:00", icon: "sunny-outline" as const },
  { label: "Afternoon (13:00)", time: "13:00", icon: "time-outline" as const },
  { label: "Night (20:00)", time: "20:00", icon: "moon-outline" as const },
];

export default function Medicines() {
  const { t } = useI18n();
  const family = useFamilyContext();
  const client = useQueryClient();
  const familyId = family.data?.family.id;
  const userId = family.data?.membership.user_id;

  useFamilyRealtime(familyId);

  const [recentlyResponded, setRecentlyResponded] = useState<
    Record<string, { status: "confirmed_taken" | "skipped"; time: string }>
  >({});

  // Modal and CRUD state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [formName, setFormName] = useState("");
  const [formDosage, setFormDosage] = useState("");
  const [formInstructions, setFormInstructions] = useState("");
  const [formTime, setFormTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  function openAddModal() {
    setModalMode("add");
    setEditingMedicine(null);
    setFormName("");
    setFormDosage("");
    setFormInstructions("");
    setFormTime("09:00");
    setModalVisible(true);
  }

  function openEditModal(medicine: Medicine, initialTime?: string) {
    setModalMode("edit");
    setEditingMedicine(medicine);
    setFormName(medicine.name);
    setFormDosage(medicine.dosage || "");
    setFormInstructions(medicine.instructions || "");
    setFormTime(initialTime || "09:00");
    setModalVisible(true);
  }

  async function handleSave() {
    if (!familyId || !formName.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(formTime)) {
      return Alert.alert(t("checkDetails"), "Please provide a medicine name and a valid time (HH:MM).");
    }

    setSaving(true);
    try {
      if (modalMode === "add") {
        const medicine = await api<{ id: string }>("/medicines", {
          method: "POST",
          body: JSON.stringify({
            family_id: familyId,
            elderly_user_id: userId,
            name: formName.trim(),
            dosage: formDosage.trim() || null,
            instructions: formInstructions.trim() || null,
          }),
        });

        await api(`/medicines/${medicine.id}/schedules`, {
          method: "POST",
          body: JSON.stringify({
            scheduled_time: formTime,
            days_of_week: [0, 1, 2, 3, 4, 5, 6],
            timezone: "Asia/Kolkata",
          }),
        });
      } else if (modalMode === "edit" && editingMedicine) {
        await api(`/medicines/${editingMedicine.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: formName.trim(),
            dosage: formDosage.trim() || null,
            instructions: formInstructions.trim() || null,
          }),
        });

        // Add or update schedule time
        await api(`/medicines/${editingMedicine.id}/schedules`, {
          method: "POST",
          body: JSON.stringify({
            scheduled_time: formTime,
            days_of_week: [0, 1, 2, 3, 4, 5, 6],
            timezone: "Asia/Kolkata",
          }),
        });
      }

      await client.invalidateQueries({ queryKey: ["medicines", familyId] });
      setModalVisible(false);
      Alert.alert(
        modalMode === "add" ? t("addMedicine") : t("editMedicine"),
        t("medicineSavedSuccess")
      );
    } catch {
      Alert.alert("Unable to save", "Could not save the medicine. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(medicine: Medicine) {
    Alert.alert(
      t("deleteMedicine"),
      t("confirmDeleteMedicine"),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: t("deleteMedicine"),
          style: "destructive",
          onPress: async () => {
            setDeletingId(medicine.id);
            try {
              await api(`/medicines/${medicine.id}`, { method: "DELETE" });
              await client.invalidateQueries({ queryKey: ["medicines", familyId] });
              Alert.alert(t("deleteMedicine"), t("medicineDeletedSuccess"));
            } catch {
              Alert.alert("Error", "Could not delete this medicine. Please try again.");
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  }

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
      {/* Header with Title and Add Medicine Button */}
      <View style={styles.headerRow}>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{t("medicines")}</Text>
          <Text style={styles.subtitle}>
            {t("medicineSubtitle")}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("addMedicine")}
          style={styles.headerAddBtn}
          onPress={openAddModal}
        >
          <Ionicons name="add" size={24} color={colors.white} />
          <Text style={styles.headerAddBtnText}>{t("addMedicine")}</Text>
        </Pressable>
      </View>

      {mine.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="medkit-outline" size={40} color={colors.blue} />
          <Text style={styles.emptyTitle}>{t("noMedicinesListed")}</Text>
          <Text style={styles.emptySubtitle}>
            {t("noMedicinesSchedule")}
          </Text>
          <View style={{ marginTop: 16, width: "100%" }}>
            <ActionButton onPress={openAddModal}>
              {t("addMedicine")}
            </ActionButton>
          </View>
        </View>
      ) : (
        mine.map((medicine, index) => {
          const schedules = scheduleQueries[index]?.data ?? [];
          const recent = recentlyResponded[medicine.id];
          const firstScheduleTime = schedules[0]?.scheduled_time?.slice(0, 5) ?? "09:00";

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

                {/* Edit and Delete Action Icons */}
                <View style={styles.cardActionIcons}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("editMedicine")}
                    hitSlop={8}
                    style={styles.iconBtn}
                    onPress={() => openEditModal(medicine, firstScheduleTime)}
                  >
                    <Ionicons name="pencil" size={20} color={colors.blue} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("deleteMedicine")}
                    hitSlop={8}
                    style={styles.iconBtn}
                    disabled={deletingId === medicine.id}
                    onPress={() => confirmDelete(medicine)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={deletingId === medicine.id ? colors.muted : colors.red}
                    />
                  </Pressable>
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

      {/* Add / Edit Medicine Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalMode === "add" ? t("addMedicine") : t("editMedicine")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={26} color={colors.ink} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalScrollBody}>
              <Text style={styles.inputLabel}>{t("medicineNamePlaceholder")} *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Paracetamol"
                placeholderTextColor={colors.muted}
                value={formName}
                onChangeText={setFormName}
                maxLength={160}
              />

              <Text style={styles.inputLabel}>{t("dosagePlaceholder")}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 500mg, 1 tablet"
                placeholderTextColor={colors.muted}
                value={formDosage}
                onChangeText={setFormDosage}
                maxLength={160}
              />

              <Text style={styles.inputLabel}>{t("instructionsPlaceholder")}</Text>
              <TextInput
                style={[styles.modalInput, styles.multilineInput]}
                placeholder="e.g. Take after breakfast with water"
                placeholderTextColor={colors.muted}
                value={formInstructions}
                onChangeText={setFormInstructions}
                multiline
                numberOfLines={2}
                maxLength={500}
              />

              <Text style={styles.inputLabel}>{t("scheduledTime")} (HH:MM) *</Text>
              <View style={styles.presetRow}>
                {TIME_PRESETS.map((p) => (
                  <Pressable
                    key={p.time}
                    style={[
                      styles.presetChip,
                      formTime === p.time && styles.presetChipActive,
                    ]}
                    onPress={() => setFormTime(p.time)}
                  >
                    <Ionicons
                      name={p.icon}
                      size={16}
                      color={formTime === p.time ? colors.white : colors.ink}
                    />
                    <Text
                      style={[
                        styles.presetChipText,
                        formTime === p.time && styles.presetChipTextActive,
                      ]}
                    >
                      {p.time}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={[styles.modalInput, { marginTop: 8 }]}
                placeholder="09:00"
                placeholderTextColor={colors.muted}
                value={formTime}
                onChangeText={setFormTime}
                maxLength={5}
                keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
              />

              <View style={styles.modalActions}>
                <ActionButton loading={saving} onPress={handleSave}>
                  {modalMode === "add" ? t("saveMedicine") : t("updateMedicine")}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  disabled={saving}
                  onPress={() => setModalVisible(false)}
                >
                  Cancel
                </ActionButton>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 8,
    gap: 12,
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  headerAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.blue,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radii.control,
    gap: 6,
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  headerAddBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.white,
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
  cardActionIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
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
    gap: 4,
    backgroundColor: colors.pale,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.control,
  },
  timeBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.ink,
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
  },
  statusBadgeSkipped: {
    backgroundColor: "#FEE2E2",
  },
  statusBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  statusBadgeTextTaken: {
    color: colors.green,
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
    padding: 32,
    alignItems: "center",
    gap: 12,
    marginVertical: 12,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.cardMin,
    borderTopRightRadius: radii.cardMin,
    maxHeight: "90%",
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: colors.ink,
  },
  modalScrollBody: {
    gap: 12,
    paddingBottom: 24,
  },
  inputLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: colors.ink,
    marginTop: 4,
  },
  modalInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    padding: 14,
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    color: colors.ink,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  presetChipActive: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  presetChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.ink,
  },
  presetChipTextActive: {
    color: colors.white,
    fontFamily: "Inter_600SemiBold",
  },
  modalActions: {
    marginTop: 20,
    gap: 12,
  },
});
