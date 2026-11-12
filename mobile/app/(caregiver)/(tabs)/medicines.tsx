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

type Medicine = { id: string; name: string; dosage?: string; elderly_user_id: string; is_active: boolean };
type Log = { id:string; medication_id:string; status:"confirmed_taken"|"skipped"|"not_confirmed"; created_at:string };
export default function Medicines() {
  const router = useRouter(); const family = useFamilyContext(); const id = family.data?.family.id;
  const { t } = useI18n();
  const medicines = useQuery({ queryKey: ["medicines", id], enabled: !!id, queryFn: () => api<Medicine[]>(`/medicines?family_id=${id}`) });
  const history = useQuery({ queryKey: ["medicine-history", id], enabled: !!id, queryFn: () => api<Log[]>(`/medicines/history?family_id=${id}`) });
  useFamilyRealtime(id);
  if (family.isLoading || medicines.isLoading) return <Screen><LoadingState /></Screen>;
  if (family.error || medicines.error) return <Screen><ProblemState message={t("medNotSaved")} retry={() => void medicines.refetch()} /></Screen>;
  return <Screen><Heading title={t("medicineCare")} subtitle={t("medicineCareSub")} />
    <ActionButton onPress={() => router.push("/(caregiver)/add-medicine")}>{t("addMedicine")}</ActionButton>
    {medicines.data?.length ? medicines.data.map((medicine) => <Panel key={medicine.id}><Text style={styles.title}>{medicine.name}</Text>{medicine.dosage ? <Text style={styles.body}>{medicine.dosage}</Text> : null}<Text style={styles.body}>{medicine.is_active ? t("activeSchedule") : t("paused")}</Text></Panel>) : <Panel><Text style={styles.body}>{t("noMedicinesListed")}</Text></Panel>}
    <Heading title={t("recentConfirmations")} />
    {history.error ? <ProblemState message={t("medNotSaved")} retry={() => void history.refetch()} /> : history.isLoading ? <LoadingState /> : history.data?.length ? history.data.slice(0,10).map((log)=><Panel key={log.id}><Text style={styles.title}>{medicines.data?.find(m=>m.id===log.medication_id)?.name||t("medicines")}</Text><Text style={styles.body}>{log.status === "confirmed_taken" ? t("reportedTaken") : log.status === "skipped" ? t("markedSkipped") : t("notConfirmed")} · {new Date(log.created_at).toLocaleString()}</Text></Panel>) : <Text style={styles.body}>{t("noMedResponses")}</Text>}
  </Screen>;
}
const styles = StyleSheet.create({ title: { fontFamily: "Inter_600SemiBold", fontSize: 21, color: colors.ink }, body: { fontFamily: "Inter_400Regular", fontSize: 17, lineHeight: 25, color: colors.muted } });
