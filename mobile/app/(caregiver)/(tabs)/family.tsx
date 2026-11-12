import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { FamilyList, type FamilyMember } from "@/components/FamilyList";
import { Heading } from "@/components/Heading";
import { LoadingState } from "@/components/LoadingState";
import { Panel } from "@/components/Panel";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";
import { useState } from "react";
import { Alert, Share, TextInput } from "react-native";
import { ActionButton } from "@/components/ActionButton";

export default function Family() {
  const family = useFamilyContext();
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState<{ token: string; role: "elderly" | "caregiver" } | null>(null);
  const id = family.data?.family.id;
  const members = useQuery({ queryKey: ["members", id], enabled: !!id, queryFn: () => api<FamilyMember[]>(`/families/${id}/members`) });

  if (family.isLoading || members.isLoading) return <Screen><LoadingState /></Screen>;
  if (family.error || members.error) return <Screen><ProblemState message="Family contacts couldn’t be loaded." retry={() => void members.refetch()} /></Screen>;

  return <Screen><Heading title="Your family" subtitle={family.data?.family.name} />
    <TextInput accessibilityLabel="Invitation email (optional)" keyboardType="email-address" autoCapitalize="none" placeholder="Email (optional)" value={email} onChangeText={setEmail} style={styles.input} />
    <ActionButton loading={inviting} onPress={()=>void invite("elderly")}>Invite a family member</ActionButton>
    <ActionButton variant="secondary" loading={inviting} onPress={()=>void invite("caregiver")}>Invite another caregiver</ActionButton>

    {lastInvite ? (
      <Panel>
        <Text style={styles.inviteTitle}>Invitation Code Generated</Text>
        <Text style={styles.inviteSubtitle}>
          Share this code with your {lastInvite.role === "elderly" ? "family member" : "caregiver"}. They can enter it under "Join family" in the app.
        </Text>
        <View style={styles.codeContainer}>
          <Text selectable style={styles.codeText}>{lastInvite.token}</Text>
        </View>
        <ActionButton variant="secondary" onPress={() => void Share.share({ message: `Join my family on Saathi. Your invitation code is:\n\n${lastInvite.token}\n\nIt expires in 72 hours. Sign in to Saathi and choose Join family.` })}>
          Share invitation code
        </ActionButton>
      </Panel>
    ) : null}

    {members.data?.length ? <FamilyList members={members.data} /> : <Text style={styles.empty}>Invite a family member to connect with Saathi.</Text>}
  </Screen>;

  async function invite(role:"elderly"|"caregiver") {
    if(!family.data) return;
    setInviting(true);
    try {
      const result = await api<{invite_token:string;expires_at:string}>(`/families/${family.data.family.id}/invite`,{
        method:"POST",
        body:JSON.stringify({role,email:email.trim()||null,expires_in_hours:72})
      });
      setLastInvite({ token: result.invite_token, role });
      setEmail("");
      await Share.share({
        message:`Join my family on Saathi. Your invitation code is:\n\n${result.invite_token}\n\nIt expires in 72 hours. Sign in to Saathi and choose Join family.`
      });
    }
    catch {
      Alert.alert("Invitation not created","Check your connection and try again.");
    } finally {
      setInviting(false);
    }
  }
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 26 },
  input: { minHeight: 56, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, fontFamily: "Inter_400Regular", fontSize: 18, color: colors.ink },
  inviteTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: colors.ink, marginBottom: 4 },
  inviteSubtitle: { fontFamily: "Inter_400Regular", fontSize: 16, color: colors.muted, lineHeight: 22, marginBottom: 12 },
  codeContainer: { backgroundColor: colors.pale, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.line, marginBottom: 12 },
  codeText: { fontFamily: "Inter_700Bold", fontSize: 16, color: colors.blue, letterSpacing: 0.5, textAlign: "center" }
});
