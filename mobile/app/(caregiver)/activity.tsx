import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text } from "react-native";
import { Heading } from "@/components/Heading";
import { LoadingState } from "@/components/LoadingState";
import { Panel } from "@/components/Panel";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";

type ActivityEvent = { id: string; kind: "task" | "medicine"; title: string; detail: string; user_id: string; created_at: string };
export default function SharedActivity() {
  const family = useFamilyContext();
  const id = family.data?.family.id;
  const query = useQuery({ queryKey: ["activity", id], enabled: !!id, queryFn: () => api<ActivityEvent[]>(`/activity?family_id=${id}`) });
  if (family.isLoading || query.isLoading) return <Screen><LoadingState /></Screen>;
  if (family.error || query.error) return <Screen><ProblemState message="Shared activity couldn’t load." retry={() => void query.refetch()} /></Screen>;
  return <Screen><Heading title="Shared activity" subtitle="Recent updates from your connected family." />
    {query.data?.length ? query.data.map((event) => <Panel key={`${event.kind}:${event.id}`}><Text style={styles.kind}>{event.kind === "task" ? "TASK" : "MEDICINE"}</Text><Text style={styles.title}>{event.title}</Text><Text style={styles.body}>{event.detail} · {new Date(event.created_at).toLocaleString()}</Text></Panel>) : <Panel><Text style={styles.body}>No shared updates yet. Completed tasks and medicine responses will appear here.</Text></Panel>}
  </Screen>;
}
const styles = StyleSheet.create({ kind: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.blue }, title: { fontFamily: "Inter_600SemiBold", fontSize: 21, lineHeight: 28, color: colors.ink }, body: { fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 26, color: colors.muted } });
