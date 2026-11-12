import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Panel } from "@/components/Panel";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";
import type { FamilyMember } from "@/components/FamilyList";

export default function Guidance() {
  const router=useRouter(); const family=useFamilyContext(); const id=family.data?.family.id;
  const members=useQuery({queryKey:["members",id],enabled:!!id,queryFn:()=>api<FamilyMember[]>(`/families/${id}/members`)});
  const [reason,setReason]=useState(""); const [saving,setSaving]=useState(false);
  async function request(userId:string) {
    if(!id) return; setSaving(true);
    try { await api("/guidance/sessions",{method:"POST",body:JSON.stringify({family_id:id,elderly_user_id:userId,reason:reason.trim()||null})}); Alert.alert("Request sent","Screen sharing will begin only if your family member approves it on their phone."); router.back(); }
    catch { Alert.alert("Request not sent","Check your connection and try again."); }
    finally { setSaving(false); }
  }
  const elderly = members.data?.filter((m) => m.role === "elderly") ?? [];
  return <Screen><Heading title="Request phone guidance" subtitle="Your family member must approve screen sharing on their device." /><Panel><TextInput accessibilityLabel="Reason for request" placeholder="What would you like to help with?" value={reason} onChangeText={setReason} style={styles.input} maxLength={500} />
    {elderly.length ? (
      elderly.map((member) => (
        <ActionButton key={member.id} loading={saving} onPress={() => void request(member.user_id)}>
          Request for {member.profile?.full_name || "family member"}
        </ActionButton>
      ))
    ) : (
      <View style={{ marginTop: 12 }}>
        <Text style={styles.note}>No elderly family members in your family yet.</Text>
        <ActionButton variant="secondary" onPress={() => router.push("/(caregiver)/(tabs)/family")}>
          Invite a family member
        </ActionButton>
      </View>
    )}
  </Panel></Screen>;
}
const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, minHeight: 84, fontFamily: "Inter_400Regular", fontSize: 18, textAlignVertical: "top" },
  note: { fontFamily: "Inter_400Regular", fontSize: 16, color: colors.muted, marginBottom: 8 }
});
