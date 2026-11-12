import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
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
import { syncMedicineReminders, type Reminder } from "@/services/medicineReminders";

type Medicine = { id: string; name: string; dosage?: string; instructions?: string; elderly_user_id: string };
type Schedule = { id:string; scheduled_time:string; days_of_week:number[]; is_active:boolean };

export default function Medicines() {
  const family = useFamilyContext();
  const client = useQueryClient();
  const familyId = family.data?.family.id;
  useFamilyRealtime(familyId);
  const query = useQuery({ queryKey: ["medicines", familyId], enabled: !!familyId, queryFn: () => api<Medicine[]>(`/medicines?family_id=${familyId}`) });
  const scheduleQueries = useQueries({ queries: (query.data ?? []).map((medicine) => ({ queryKey: ["medication-schedules", medicine.id], queryFn: () => api<Schedule[]>(`/medicines/${medicine.id}/schedules`) })) });
  useEffect(() => {
    const reminders: Reminder[] = (query.data ?? []).flatMap((medicine, index) => (scheduleQueries[index]?.data ?? []).map((schedule) => ({ ...schedule, name: medicine.name, ...{ id: medicine.id } })));
    if (query.data && !scheduleQueries.some((item) => item.isLoading || item.isError)) void syncMedicineReminders(reminders).catch(() => undefined);
  }, [query.data, scheduleQueries.map((item) => item.dataUpdatedAt).join(",")]);
  async function respond(medicineId: string, status: "confirmed_taken" | "skipped") {
    try {
      await api(`/medicines/${medicineId}/logs`, { method: "POST", body: JSON.stringify({ status, scheduled_for: new Date().toISOString() }) });
      await client.invalidateQueries({ queryKey: ["medicines", familyId] });
      Alert.alert(status === "confirmed_taken" ? "Recorded" : "Marked skipped", "Your caregiver can see this update.");
    } catch { Alert.alert("Response not saved", "Check your connection and try again."); }
  }
  if (family.isLoading || query.isLoading) return <Screen><LoadingState /></Screen>;
  if (family.error || query.error) return <Screen><ProblemState message="Medicine reminders couldn’t be loaded." retry={() => void query.refetch()} /></Screen>;
  const mine = query.data?.filter((medicine) => medicine.elderly_user_id === family.data?.membership.user_id) ?? [];
  return <Screen><Heading title="Medicines" subtitle="Please confirm only after you have taken a dose." />
    {mine.length === 0 ? <Panel><Text style={styles.body}>No medicines are listed yet. Ask your caregiver to add your schedule.</Text></Panel> : mine.map((medicine) => <Panel key={medicine.id}>
      <Text style={styles.title}>{medicine.name}</Text>{medicine.dosage ? <Text style={styles.body}>{medicine.dosage}</Text> : null}{medicine.instructions ? <Text style={styles.body}>{medicine.instructions}</Text> : null}
      {(scheduleQueries[query.data?.indexOf(medicine) ?? -1]?.data ?? []).map((schedule)=><Text key={schedule.id} style={styles.body}>Reminder · {schedule.scheduled_time.slice(0,5)}</Text>)}
      <View style={styles.row}><View style={styles.flex}><ActionButton onPress={() => void respond(medicine.id, "confirmed_taken")}>I took it</ActionButton></View><View style={styles.flex}><ActionButton variant="secondary" onPress={() => void respond(medicine.id, "skipped")}>Later / skipped</ActionButton></View></View>
    </Panel>)}
  </Screen>;
}
const styles = StyleSheet.create({ title: { fontFamily: "Inter_600SemiBold", fontSize: 22, lineHeight: 30, color: colors.ink }, body: { fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 26, color: colors.muted }, row: { flexDirection: "row", gap: 12 }, flex: { flex: 1 } });
