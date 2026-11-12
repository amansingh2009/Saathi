import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, TextInput } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Screen } from "@/components/Screen";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";

export default function FamilySetup() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const caregiver = role !== "elderly";
  async function createFamily() {
    if (!name.trim()) { setMessage("Enter a name for your family."); return; }
    setBusy(true); setMessage("");
    try {
      await api("/families", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      router.replace("/(caregiver)/(tabs)");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create the family."); }
    finally { setBusy(false); }
  }
  return <Screen><Heading title={caregiver ? "Set up your family" : "Join your family"} subtitle={caregiver ? "You can invite family members after creating your family." : "Ask a trusted family member for an invitation code."} />
    {caregiver ? <><Text style={styles.label}>Family name</Text><TextInput value={name} onChangeText={setName} style={styles.input} maxLength={120} /><ActionButton onPress={() => void createFamily()} loading={busy}>Create family</ActionButton></> : <ActionButton onPress={() => router.push("/(auth)/join-family")}>Enter invitation code</ActionButton>}
    {message ? <Text style={styles.message}>{message}</Text> : null}
  </Screen>;
}
const styles = StyleSheet.create({ label: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: colors.muted }, input: { minHeight: 60, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 16, fontFamily: "Inter_400Regular", fontSize: 20, color: colors.ink }, message: { color: colors.red, fontFamily: "Inter_500Medium", fontSize: 16 } });
