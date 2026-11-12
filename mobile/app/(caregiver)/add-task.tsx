import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Panel } from "@/components/Panel";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FamilyMember } from "@/components/FamilyList";

export default function AddTask() {
  const router = useRouter(); const family = useFamilyContext(); const client = useQueryClient(); const id = family.data?.family.id;
  const members = useQuery({ queryKey: ["members", id], enabled: !!id, queryFn: () => api<FamilyMember[]>(`/families/${id}/members`) });
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [assignedTo, setAssignedTo] = useState(""); const [saving, setSaving] = useState(false);
  const elderly = members.data?.filter((m) => m.role === "elderly") ?? [];
  async function save() {
    if (!id || !title.trim() || !assignedTo) return Alert.alert("Add a task", "Enter a task and choose a family member.");
    setSaving(true);
    try { await api("/tasks", { method: "POST", body: JSON.stringify({ family_id: id, title: title.trim(), description: description.trim() || null, assigned_to: assignedTo }) }); await client.invalidateQueries({ queryKey: ["tasks", id] }); router.back(); }
    catch { Alert.alert("Task not saved", "Check your connection and try again."); }
    finally { setSaving(false); }
  }
  return <Screen><Heading title="Add a task" subtitle="A clear, kind reminder for a family member." /><Panel>
    <Text style={styles.label}>Task</Text><TextInput accessibilityLabel="Task title" style={styles.input} value={title} onChangeText={setTitle} maxLength={160} placeholder="For example, water the plants" />
    <Text style={styles.label}>A little more detail (optional)</Text><TextInput accessibilityLabel="Task details" style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline maxLength={2000} />
    <Text style={styles.label}>Assign to</Text>
    {elderly.length ? (
      elderly.map((member) => (
        <ActionButton key={member.id} variant={assignedTo === member.user_id ? "primary" : "secondary"} onPress={() => setAssignedTo(member.user_id)}>
          {member.profile?.full_name || "Family member"}
        </ActionButton>
      ))
    ) : (
      <View style={{ marginTop: 8 }}>
        <Text style={styles.note}>No elderly family members in your family yet.</Text>
        <ActionButton variant="secondary" onPress={() => router.push("/(caregiver)/(tabs)/family")}>
          Invite a family member
        </ActionButton>
      </View>
    )}
    <View style={styles.gap}><ActionButton disabled={!elderly.length} loading={saving} onPress={() => void save()}>Save task</ActionButton></View>
  </Panel></Screen>;
}
const styles = StyleSheet.create({ label: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.ink, marginTop: 12 }, input: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, fontSize: 18, color: colors.ink, minHeight: 54 }, multiline: { minHeight: 96, textAlignVertical: "top" }, note: { fontFamily: "Inter_400Regular", fontSize: 16, color: colors.muted }, gap: { marginTop: 20 } });
