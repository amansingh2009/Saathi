import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Panel } from "@/components/Panel";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import type { FamilyMember } from "@/components/FamilyList";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";

export default function AddMedicine() {
  const router = useRouter(); const family = useFamilyContext(); const client = useQueryClient(); const id = family.data?.family.id;
  const members = useQuery({ queryKey: ["members", id], enabled: !!id, queryFn: () => api<FamilyMember[]>(`/families/${id}/members`) });
  const [name, setName] = useState(""); const [dosage, setDosage] = useState(""); const [instructions, setInstructions] = useState(""); const [time, setTime] = useState("09:00"); const [person, setPerson] = useState(""); const [saving, setSaving] = useState(false);
  const elderly = members.data?.filter((m) => m.role === "elderly") ?? [];
  async function save() {
    if (!id || !name.trim() || !person || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return Alert.alert("Check the details", "Add a medicine name, choose a person, and enter a time like 09:00.");
    setSaving(true);
    try {
      const medicine = await api<{id:string}>("/medicines", { method: "POST", body: JSON.stringify({ family_id:id, elderly_user_id:person, name:name.trim(), dosage:dosage.trim()||null, instructions:instructions.trim()||null }) });
      await api(`/medicines/${medicine.id}/schedules`, { method:"POST", body: JSON.stringify({ scheduled_time:time, days_of_week:[0,1,2,3,4,5,6], timezone:"Asia/Kolkata" }) });
      await client.invalidateQueries({ queryKey:["medicines",id] }); router.back();
    } catch { Alert.alert("Medicine schedule not saved", "Check the connection and try again. Review the medicine schedule with the family member."); }
    finally { setSaving(false); }
  }
  return <Screen><Heading title="Add a medicine" subtitle="Enter the schedule exactly as prescribed by their clinician." /><Panel>
    <Text style={styles.label}>Medicine name</Text><TextInput style={styles.input} accessibilityLabel="Medicine name" value={name} onChangeText={setName} />
    <Text style={styles.label}>Dose (optional)</Text><TextInput style={styles.input} accessibilityLabel="Dose" value={dosage} onChangeText={setDosage} />
    <Text style={styles.label}>Care instructions (optional)</Text><TextInput style={styles.input} accessibilityLabel="Instructions" value={instructions} onChangeText={setInstructions} />
    <Text style={styles.label}>Daily reminder time</Text><TextInput style={styles.input} accessibilityLabel="Reminder time" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
    <Text style={styles.label}>For</Text>
    {elderly.length ? (
      elderly.map((member) => (
        <ActionButton key={member.id} variant={person === member.user_id ? "primary" : "secondary"} onPress={() => setPerson(member.user_id)}>
          {member.profile?.full_name || "Family member"}
        </ActionButton>
      ))
    ) : (
      <View style={{ marginTop: 8 }}>
        <Text style={styles.note}>No elderly family members in your family yet.</Text>
        <ActionButton variant="secondary" onPress={() => router.push("/(caregiver)/(tabs)/family")}>
          Invite a family member
        </ActionButton>
      </View>
    )}
    <View style={styles.gap}><ActionButton disabled={!elderly.length} loading={saving} onPress={()=>void save()}>Save schedule</ActionButton></View>
  </Panel></Screen>;
}
const styles=StyleSheet.create({label:{fontFamily:"Inter_600SemiBold",fontSize:17,color:colors.ink,marginTop:12},input:{borderWidth:1,borderColor:colors.line,borderRadius:14,padding:14,fontSize:18,color:colors.ink,minHeight:54},note:{fontFamily:"Inter_400Regular",fontSize:16,color:colors.muted,marginBottom:8},gap:{marginTop:20}});
