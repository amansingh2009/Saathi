import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { LoadingState } from "@/components/LoadingState";
import { Panel } from "@/components/Panel";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { useFamilyRealtime } from "@/hooks/useFamilyRealtime";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";

type Task = { id: string; title: string; status: string; due_at?: string };
export default function Tasks() {
  const router = useRouter(); const family = useFamilyContext(); const id = family.data?.family.id;
  const { t } = useI18n();
  const tasks = useQuery({ queryKey: ["tasks", id], enabled: !!id, queryFn: () => api<Task[]>(`/tasks?family_id=${id}`) });
  useFamilyRealtime(id);
  if (family.isLoading || tasks.isLoading) return <Screen><LoadingState /></Screen>;
  if (family.error || tasks.error) return <Screen><ProblemState message={t("taskNotSaved")} retry={() => void tasks.refetch()} /></Screen>;
  return <Screen><Heading title={t("familyTasks")} subtitle={t("familyTasksSub")} />
    <ActionButton onPress={() => router.push("/(caregiver)/add-task")}>{t("addTask")}</ActionButton>
    {tasks.data?.length ? tasks.data.map((task) => <Panel key={task.id}><Text style={styles.title}>{task.title}</Text><Text style={styles.body}>{task.status === "completed" ? t("completedLabel") : task.status === "cancelled" ? t("cancelled") : t("waitingCompletion")}</Text>{task.due_at ? <Text style={styles.body}>{new Date(task.due_at).toLocaleString()}</Text> : null}</Panel>) : <Panel><Text style={styles.body}>{t("noTasksToday")}</Text></Panel>}
  </Screen>;
}
const styles = StyleSheet.create({ title: { fontFamily: "Inter_600SemiBold", fontSize: 21, color: colors.ink }, body: { fontFamily: "Inter_400Regular", fontSize: 17, lineHeight: 25, color: colors.muted } });
