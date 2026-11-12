import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { Panel } from "@/components/Panel";
import { colors } from "@/theme/tokens";

export type FamilyMember = { id: string; user_id: string; role: "elderly" | "caregiver"; status: string; profile?: { full_name?: string | null; phone?: string | null } | null };

export function FamilyList({ members, currentUserId }: { members: FamilyMember[]; currentUserId?: string }) {
  return <>{members.map((member) => <Panel key={member.id}>
    <Text style={styles.name}>{member.user_id === currentUserId ? "You" : member.profile?.full_name || "Family member"}</Text>
    <Text style={styles.role}>{member.role === "elderly" ? "Family member" : "Caregiver"}</Text>
    {member.profile?.phone ? <Pressable accessibilityRole="link" accessibilityLabel={`Call ${member.profile.full_name || "family member"}`} onPress={() => void Linking.openURL(`tel:${member.profile?.phone?.replace(/[^+\d]/g, "")}`)} style={styles.call}><Text style={styles.phone}>{member.profile.phone}</Text></Pressable> : null}
  </Panel>)}</>;
}
const styles = StyleSheet.create({ name: { fontFamily: "Inter_600SemiBold", color: colors.ink, fontSize: 20 }, role: { fontFamily: "Inter_400Regular", color: colors.muted, fontSize: 16 }, call:{minHeight:44,justifyContent:"center"},phone: { fontFamily: "Inter_500Medium", color: colors.blue, fontSize: 18 } });
