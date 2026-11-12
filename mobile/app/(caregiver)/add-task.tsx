import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FamilyMember } from "@/components/FamilyList";
import { useI18n } from "@/hooks/useI18n";

export default function AddTask() {
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

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const elderly = members.data?.filter((m) => m.role === "elderly") ?? [];

  // Auto-select if single elderly user
  useState(() => {
    if (elderly.length === 1 && !assignedTo) {
      setAssignedTo(elderly[0].user_id);
    }
  });

  async function save() {
    const targetUserId = assignedTo || elderly[0]?.user_id;
    if (!id || !title.trim() || !targetUserId) {
      return Alert.alert(t("addTaskTitle"), t("enterTaskAndMember"));
    }
    setSaving(true);
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({
          family_id: id,
          title: title.trim(),
          description: description.trim() || null,
          assigned_to: targetUserId,
        }),
      });
      await client.invalidateQueries({ queryKey: ["tasks", id] });
      setSaved(true);
    } catch {
      Alert.alert(t("taskNotSaved"), t("checkConnectionTryAgain"));
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <Screen>
        <View style={styles.successContainer}>
          <View style={styles.successIconCircle}>
            <Ionicons name="checkmark-circle" size={72} color={colors.green} />
          </View>
          <Text style={styles.successTitle}>Task Saved!</Text>
          <Text style={styles.successSubtitle}>
            "{title}" has been saved and assigned to your family member.
          </Text>

          <View style={styles.successActions}>
            <ActionButton onPress={() => router.back()}>{t("done")}</ActionButton>
            <ActionButton
              variant="secondary"
              onPress={() => {
                setTitle("");
                setDescription("");
                setSaved(false);
              }}
            >
              Add Another Task
            </ActionButton>
          </View>
        </View>
      </Screen>
    );
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
        <Text style={styles.title}>{t("addTaskTitle")}</Text>
        <Text style={styles.subtitle}>{t("addTaskSubtitle")}</Text>
      </View>

      <View style={styles.formCard}>
        {/* Task Title Input */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("taskTitleLabel")}</Text>
          <TextInput
            accessibilityLabel="Task title"
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            maxLength={160}
            placeholder={t("taskTitlePlaceholder")}
            placeholderTextColor={colors.muted}
          />
        </View>

        {/* Task Description Input */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("taskDetailsLabel")}</Text>
          <TextInput
            accessibilityLabel="Task details"
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={2000}
            placeholder={t("taskDetailsPlaceholder")}
            placeholderTextColor={colors.muted}
          />
        </View>

        {/* Assign To */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t("assignToLabel")}</Text>
          {elderly.length ? (
            <View style={styles.assignRow}>
              {elderly.map((member) => {
                const isSelected = assignedTo === member.user_id;
                return (
                  <Pressable
                    key={member.id}
                    accessibilityRole="button"
                    onPress={() => setAssignedTo(member.user_id)}
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
            disabled={!title.trim() || (!assignedTo && !elderly.length)}
            loading={saving}
            onPress={() => void save()}
          >
            {t("saveTaskBtn")}
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
  multiline: {
    minHeight: 100,
    textAlignVertical: "top",
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
  successContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 20,
    gap: 16,
  },
  successIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: colors.ink,
    textAlign: "center",
  },
  successSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 16,
  },
  successActions: {
    width: "100%",
    gap: 12,
  },
});
