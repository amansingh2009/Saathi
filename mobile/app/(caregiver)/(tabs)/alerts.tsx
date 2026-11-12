import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, StyleSheet, Text } from "react-native";
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

type Emergency = { id: string; status: "open" | "acknowledged" | "resolved"; created_at: string };
type Notification = { emergency_event_id:string|null; status:"sent"|"failed"|"not_configured"|"no_registered_devices"; created_at:string };
export default function Alerts() {
  const family = useFamilyContext(); const client = useQueryClient(); const id = family.data?.family.id;
  const alerts = useQuery({ queryKey: ["emergency", id], enabled: !!id, queryFn: () => api<Emergency[]>(`/emergency?family_id=${id}`) });
  const notifications = useQuery({ queryKey: ["notification-history", id], enabled: !!id, queryFn: () => api<Notification[]>("/notifications/history") });
  useFamilyRealtime(id);
  async function change(alert: Emergency, action: "acknowledge" | "resolve") {
    try { await api(`/emergency/${alert.id}/${action}`, { method: "POST" }); await client.invalidateQueries({ queryKey: ["emergency", id] }); }
    catch { Alert.alert("Couldn’t update alert", "Check your connection and try again."); }
  }
  if (family.isLoading || alerts.isLoading) return <Screen><LoadingState /></Screen>;
  if (family.error || alerts.error) return <Screen><ProblemState message="Alerts couldn’t be loaded." retry={() => void alerts.refetch()} /></Screen>;
  return <Screen><Heading title="Emergency alerts" subtitle="A sent notification does not mean someone has acknowledged the alert." />
    {alerts.data?.length ? alerts.data.map((alert) => { const delivery=notifications.data?.find((n)=>n.emergency_event_id===alert.id); return <Panel key={alert.id}><Text style={styles.title}>{alert.status === "open" ? "Needs acknowledgement" : alert.status === "acknowledged" ? "Acknowledged · follow up" : "Resolved"}</Text><Text style={styles.body}>{new Date(alert.created_at).toLocaleString()}</Text>{delivery?<Text style={styles.body}>Notification · {delivery.status.replaceAll("_"," ")}</Text>:null}{alert.status === "open" ? <><ActionButton variant="danger" onPress={() => void change(alert, "acknowledge")}>Acknowledge</ActionButton><ActionButton variant="secondary" onPress={()=>void api(`/emergency/${alert.id}/notify`,{method:"POST"}).then(()=>client.invalidateQueries({queryKey:["notification-history",id]})).catch(()=>Alert.alert("Couldn’t retry notification","Check your connection and try again."))}>Retry caregiver notification</ActionButton></> : alert.status === "acknowledged" ? <ActionButton variant="secondary" onPress={() => void change(alert, "resolve")}>Mark resolved</ActionButton> : null}</Panel>; }) : <Panel><Text style={styles.body}>No emergency alerts.</Text></Panel>}
  </Screen>;
}
const styles = StyleSheet.create({ title: { fontFamily: "Inter_700Bold", fontSize: 21, color: colors.ink }, body: { fontFamily: "Inter_400Regular", fontSize: 17, lineHeight: 25, color: colors.muted } });
