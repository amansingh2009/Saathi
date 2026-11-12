import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import type { FamilyMember } from "@/components/FamilyList";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";

export default function AddMedicine() {
  const router = useRouter();
  const family = useFamilyContext();
  const client = useQueryClient();
  const id = family.data?.family.id;
  const { t } = useI18n();

  const members = useQuery({
    queryKey: ["members", id],
    enabled: !!id,
    queryFn: () => api<FamilyMember[]>(`/families/${id}/members`),
  });

  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [time, setTime] = useState("09:00");
  const [person, setPerson] = useState("");
  const [saving, setSaving] = useState(false);

  const elderly = members.data?.filter((m) => m.role === "elderly") ?? [];

  // Auto-select if single elderly user
  useState(() => {
    if (elderly.length === 1 && !person) {
      setPerson(elderly[0].user_id);
    }
  });

  async function save() {
    const targetUserId = person || elderly[0]?.user_id;
    if (!id || !name.trim() || !targetUserId || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return Alert.alert(t("checkDetails"), t("checkDetailsDesc"));
    }
    setSaving(true);
    try {
      const medicine = await api<{ id: string }>("/medicines", {
        method: "POST",
        body: JSON.stringify({
          family_id: id,
          elderly_user_id: targetUserId,
          name: name.trim(),
          dosage: dosage.trim() || null,
          instructions: instructions.trim() || null,
        }),
      });
      await api(`/medicines/${medicine.id}/schedules`, {
        method: "POST",
        body: JSON.stringify({
          scheduled_time: time,
          days_of_week: [0, 1, 2, 3, 4, 5, 6],
          timezone: "Asia/Kolkata",
        }),
      });
      await client.invalidateQueries({ queryKey: ["medicines", id] });
      router.back();
    } catch {
      Alert.alert(t("medNotSaved"), t("medNotSavedDesc"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      {/* Top Nav */}
      <View style={styles.topNav}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backRow}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
          <Text style={styles.backLabel}>{t("dashboard")}</Text>
        </Pressable>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("addMedicineTitle")}</Text>
        <Text style={styles.subtitle}>{t("addMedicineSubtitle")}</Text>
      </View>

      <View style={styles.formCard}>
        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("medNameLabel")}</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Medicine name"
            value={name}
            onChangeText={setName}
            placeholder={t("medNamePlaceholder")}
            placeholderTextColor={colors.muted}
          />
        </View>

        {/* Dose */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("dosageLabel")}</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Dose"
            value={dosage}
            onChangeText={setDosage}
            placeholder={t("dosagePlaceholder")}
            placeholderTextColor={colors.muted}
          />
        </View>

        {/* Instructions */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("instructionsLabel")}</Text>
          <TextInput
            style={styles.input}
            accessibilityLabel="Instructions"
            value={instructions}
            onChangeText={setInstructions}
            placeholder={t("instructionsPlaceholder")}
            placeholderTextColor={colors.muted}
          />
        </View>

        {/* Daily Time */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("reminderTimeLabel")}</Text>
          <View style={styles.timeInputRow}>
            <Ionicons name="time-outline" size={20} color={colors.blue} />
            <TextInput
              style={styles.timeInput}
              accessibilityLabel="Reminder time"
              value={time}
              onChangeText={setTime}
              keyboardType="numbers-and-punctuation"
              placeholder="09:00"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        {/* Target Senior */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("forWhom")}</Text>
          {elderly.length ? (
            <View style={styles.assignRow}>
              {elderly.map((member) => {
                const isSelected = person === member.user_id;
                return (
                  <Pressable
                    key={member.id}
                    accessibilityRole="button"
                    onPress={() => setPerson(member.user_id)}
                    style={[
                      styles.assignChip,
                      isSelected ? styles.assignChipSelected : styles.assignChipUnselected,
                    ]}
                  >
                    <Ionicons
                      name="person"
                      size={18}
                      color={isSelected ? colors.white : colors.blue}
                    />
                    <Text
                      style={[
                        styles.assignChipText,
                        isSelected ? styles.assignChipTextSelected : styles.assignChipTextUnselected,
                      ]}
                    >
                      {member.profile?.full_name || t("elderly")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyMemberBox}>
              <Text style={styles.note}>{t("noElderlyInFamily")}</Text>
              <ActionButton
                variant="secondary"
                onPress={() => router.push("/(caregiver)/(tabs)/family")}
              >
                {t("inviteFamilyMember")}
              </ActionButton>
            </View>
          )}
        </View>

        {/* Save CTA */}
        <View style={styles.actionWrap}>
          <ActionButton
            disabled={!name.trim() || (!person && !elderly.length)}
            loading={saving}
            onPress={() => void save()}
          >
            {t("saveMedScheduleBtn")}
          </ActionButton>
        </View>
      </View>
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
    paddingVertical: 4,
  },
  backLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.ink,
  },
  header: {
    gap: 4,
    marginVertical: 10,
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
  formCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 16,
    marginVertical: 6,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.ink,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 17,
    color: colors.ink,
    minHeight: 56,
    backgroundColor: colors.white,
  },
  timeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    minHeight: 56,
  },
  timeInput: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 18,
    color: colors.ink,
    paddingVertical: 14,
  },
  assignRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  assignChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  assignChipSelected: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  assignChipUnselected: {
    backgroundColor: colors.white,
    borderColor: colors.line,
  },
  assignChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  assignChipTextSelected: {
    color: colors.white,
  },
  assignChipTextUnselected: {
    color: colors.ink,
  },
  emptyMemberBox: {
    gap: 10,
    padding: 12,
  },
  note: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.muted,
  },
  actionWrap: {
    marginTop: 8,
  },
});
