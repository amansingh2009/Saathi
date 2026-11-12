import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { LoadingState } from "@/components/LoadingState";
import { Panel } from "@/components/Panel";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { t } from "@/constants/strings";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { supabase } from "@/services/supabase";
import { usePreferences } from "@/store/preferences";
import { colors } from "@/theme/tokens";

type Task = { id: string; title: string; status: string };

export default function ElderlyHome() {
  const router = useRouter();
  const language = usePreferences((state) => state.language);
  const family = useFamilyContext();
  const familyId = family.data?.family.id;
  const tasks = useQuery({ queryKey: ["tasks", familyId], enabled: !!familyId, queryFn: () => api<Task[]>(`/tasks?family_id=${familyId}`) });
  if (family.isLoading) return <Screen><LoadingState /></Screen>;
  if (family.error) return <Screen>
    <ProblemState message="We couldn’t load your family details." retry={() => void family.refetch()} />
    <ActionButton variant="secondary" onPress={async () => { await supabase.auth.signOut(); router.replace("/(auth)/welcome"); }}>Sign in again</ActionButton>
  </Screen>;
  if (!family.data) return <Screen><Heading title="Connect with your family" subtitle="Join using an invitation from a trusted family member." /><ActionButton onPress={() => router.push("/(auth)/join-family")}>Join family</ActionButton></Screen>;
  return <Screen>
    <Heading title={`${t(language, "hello")}`} subtitle={family.data.family.name} />
    <Panel><Text style={styles.hero}>{t(language, "talk")}</Text><Text style={styles.body}>{t(language, "ask")}</Text><ActionButton onPress={() => router.push("/(elderly)/assistant")}>Talk to Saathi</ActionButton></Panel>
    <Panel><Text style={styles.section}>{t(language, "tasks")}</Text>{tasks.isLoading ? <LoadingState label={t(language, "loading")} /> : tasks.error ? <Text style={styles.body}>Your tasks are temporarily unavailable.</Text> : <Text style={styles.body}>{tasks.data?.filter((task) => task.status === "pending").length ?? 0} to do</Text>}<ActionButton variant="secondary" onPress={() => router.push("/(elderly)/(tabs)/tasks")}>View tasks</ActionButton></Panel>
    <ActionButton variant="secondary" onPress={() => router.push("/(elderly)/(tabs)/medicines")}>{t(language, "medicines")}</ActionButton>
    <ActionButton variant="secondary" onPress={() => router.push("/(elderly)/bhajan")}>Listen to a bhajan</ActionButton>
    <ActionButton variant="secondary" onPress={() => router.push("/(elderly)/help")}>Help with my phone</ActionButton>
    <ActionButton variant="danger" onPress={() => router.push("/(elderly)/sos")}>{t(language, "sos")}</ActionButton>
  </Screen>;
}

const styles = StyleSheet.create({ hero: { color: colors.ink, fontFamily: "Inter_700Bold", fontSize: 24, lineHeight: 32 }, section: { color: colors.ink, fontFamily: "Inter_600SemiBold", fontSize: 22 }, body: { color: colors.muted, fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 26 } });
