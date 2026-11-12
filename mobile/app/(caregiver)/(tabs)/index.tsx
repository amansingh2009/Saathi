import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
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
import { useEffect } from "react";
import { registerDeviceForFamily } from "@/services/pushRegistration";
import { supabase } from "@/services/supabase";
import type { FamilyMember } from "@/components/FamilyList";

type Task = { id: string; title: string; status: string };
type Medicine = { id: string; name: string };
type Emergency = { id: string; status: "open" | "acknowledged" | "resolved"; created_at: string; elderly_user_id: string };

export default function Dashboard() {
  const router = useRouter();
  const client = useQueryClient();
  const family = useFamilyContext();
  const id = family.data?.family.id;
  useFamilyRealtime(id);
  useEffect(() => { if (id) void registerDeviceForFamily(id).catch(() => undefined); }, [id]);
  const members = useQuery({ queryKey: ["members", id], enabled: !!id, queryFn: () => api<FamilyMember[]>(`/families/${id}/members`) });
  const tasks = useQuery({ queryKey: ["tasks", id], enabled: !!id, queryFn: () => api<Task[]>(`/tasks?family_id=${id}`) });
  const meds = useQuery({ queryKey: ["medicines", id], enabled: !!id, queryFn: () => api<Medicine[]>(`/medicines?family_id=${id}`) });
  const alerts = useQuery({ queryKey: ["emergency", id], enabled: !!id, queryFn: () => api<Emergency[]>(`/emergency?family_id=${id}`) });
  async function acknowledge(eventId: string) { await api(`/emergency/${eventId}/acknowledge`, { method: "POST" }); await client.invalidateQueries({ queryKey: ["emergency", id] }); }
  async function resolve(eventId: string) { await api(`/emergency/${eventId}/resolve`, { method: "POST" }); await client.invalidateQueries({ queryKey: ["emergency", id] }); }
  if (family.isLoading) return <Screen><LoadingState /></Screen>;
  if (family.error) return <Screen>
    <ProblemState message="Dashboard couldn’t load." retry={() => void family.refetch()} />
    <ActionButton variant="secondary" onPress={async () => { await supabase.auth.signOut(); router.replace("/(auth)/welcome"); }}>Sign in again</ActionButton>
  </Screen>;
  const activeAlerts = alerts.data?.filter((event) => event.status !== "resolved") ?? [];
  const hasElderly = members.data?.some((m) => m.role === "elderly");
  return <Screen>
    <Heading title="Care, without the worry." subtitle={family.data?.family.name} />
    <Panel><Text style={styles.title}>Today’s care</Text><Text style={styles.body}>{tasks.data?.filter((task) => task.status === "completed").length ?? 0} of {tasks.data?.length ?? 0} tasks completed</Text><Text style={styles.body}>{meds.data?.length ?? 0} medicines in the family schedule</Text></Panel>
    {!hasElderly ? (
      <Panel>
        <Text style={styles.title}>Connect your family</Text>
        <Text style={styles.body}>Invite an elderly member to start assigning tasks and medicines.</Text>
        <ActionButton onPress={() => router.push("/(caregiver)/(tabs)/family")}>Get invitation code</ActionButton>
      </Panel>
    ) : null}
    {tasks.isLoading || meds.isLoading ? <LoadingState /> : null}
    {tasks.error || meds.error ? <ProblemState message="Some activity details are temporarily unavailable." retry={() => { void tasks.refetch(); void meds.refetch(); }} /> : null}
    <ActionButton onPress={() => router.push("/(caregiver)/(tabs)/family")}>Invite family member</ActionButton>
    <ActionButton variant="secondary" onPress={() => router.push("/(caregiver)/add-task")}>Add task</ActionButton>
    <ActionButton variant="secondary" onPress={() => router.push("/(caregiver)/activity")}>View shared activity</ActionButton>
    <ActionButton variant="secondary" onPress={() => router.push("/(caregiver)/add-medicine")}>Add medicine</ActionButton>
    <ActionButton variant="secondary" onPress={() => router.push("/(caregiver)/guidance")}>Request phone guidance</ActionButton>
    <ActionButton variant="secondary" onPress={() => router.push("/(caregiver)/guidance-monitor")}>Open guidance viewer</ActionButton>
    {activeAlerts.map((event) => <Panel key={event.id}><Text style={styles.title}>Emergency alert</Text><Text style={styles.body}>{event.status === "open" ? "Waiting for a caregiver to acknowledge." : "Acknowledged · waiting to be resolved."}</Text><Text style={styles.body}>{new Date(event.created_at).toLocaleString()}</Text>{event.status === "open" ? <ActionButton variant="danger" onPress={() => void acknowledge(event.id)}>Acknowledge alert</ActionButton> : <ActionButton variant="secondary" onPress={() => void resolve(event.id)}>Resolve alert</ActionButton>}</Panel>)}
  </Screen>;
}
const styles = StyleSheet.create({ title: { fontFamily: "Inter_700Bold", fontSize: 22, lineHeight: 30, color: colors.ink }, body: { fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 26, color: colors.muted } });
