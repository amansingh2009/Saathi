import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, StyleSheet, Text } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { LoadingState } from "@/components/LoadingState";
import { Panel } from "@/components/Panel";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";
import { useFamilyRealtime } from "@/hooks/useFamilyRealtime";

type Task = { id: string; title: string; description?: string; status: "pending" | "completed" | "cancelled"; due_at?: string };

export default function Tasks() {
  const family = useFamilyContext();
  const client = useQueryClient();
  const familyId = family.data?.family.id;
  useFamilyRealtime(familyId);
  const query = useQuery({ queryKey: ["tasks", familyId], enabled: !!familyId, queryFn: () => api<Task[]>(`/tasks?family_id=${familyId}`) });
  async function complete(id: string) {
    try { await api(`/tasks/${id}/complete`, { method: "POST" }); await client.invalidateQueries({ queryKey: ["tasks", familyId] }); }
    catch { Alert.alert("Task not updated", "Check your connection and try again."); }
  }
  if (family.isLoading || query.isLoading) return <Screen><LoadingState /></Screen>;
  if (family.error || query.error) return <Screen><ProblemState message="Tasks couldn’t be loaded." retry={() => void query.refetch()} /></Screen>;
  const pending = query.data?.filter((task) => task.status === "pending") ?? [];
  const completed = query.data?.filter((task) => task.status === "completed") ?? [];
  return <Screen><Heading title="Today’s tasks" subtitle="One step at a time." />
    {pending.length === 0 ? <Panel><Text style={styles.body}>No tasks for today. You can enjoy a little rest.</Text></Panel> : pending.map((task) => <Panel key={task.id}><Text style={styles.title}>{task.title}</Text>{task.description ? <Text style={styles.body}>{task.description}</Text> : null}{task.due_at ? <Text style={styles.body}>{new Date(task.due_at).toLocaleString()}</Text> : null}<ActionButton onPress={() => void complete(task.id)}>Mark complete</ActionButton></Panel>)}
    {completed.map((task) => <Panel key={task.id}><Text style={styles.body}>✓  {task.title} · Completed</Text></Panel>)}
  </Screen>;
}
const styles = StyleSheet.create({ title: { fontFamily: "Inter_600SemiBold", fontSize: 21, lineHeight: 29, color: colors.ink }, body: { fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 26, color: colors.muted } });
