import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { FamilyList, type FamilyMember } from "@/components/FamilyList";
import { Heading } from "@/components/Heading";
import { LoadingState } from "@/components/LoadingState";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { supabase } from "@/services/supabase";
import { colors } from "@/theme/tokens";

export default function Family() {
  const family = useFamilyContext();
  const familyId = family.data?.family.id;
  const [userId, setUserId] = useState<string | undefined>();
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => { if (active) setUserId(data.user?.id); });
    return () => { active = false; };
  }, []);
  const query = useQuery({ queryKey: ["members", familyId], enabled: !!familyId, queryFn: () => api<FamilyMember[]>(`/families/${familyId}/members`) });
  if (family.isLoading || query.isLoading) return <Screen><LoadingState /></Screen>;
  if (family.error || query.error) return <Screen><ProblemState message="Family contacts couldn’t be loaded." retry={() => void query.refetch()} /></Screen>;
  return <Screen><Heading title="Your family" subtitle={family.data?.family.name} />
    {query.data?.length ? <FamilyList members={query.data} currentUserId={userId} /> : <Text style={styles.empty}>No family members are connected yet.</Text>}
  </Screen>;
}
const styles = StyleSheet.create({ empty: { color: colors.muted, fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 26 } });
