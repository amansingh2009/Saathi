import { useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TextInput } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Screen } from "@/components/Screen";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";

export default function JoinFamily() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function join() {
    if (token.trim().length < 6) { setMessage("Enter the full invitation code from your family member."); return; }
    setBusy(true); setMessage("");
    try {
      const membership = await api<{ role: "elderly" | "caregiver" }>("/invitations/accept", { method: "POST", body: JSON.stringify({ token: token.trim() }) });
      router.replace(membership.role === "elderly" ? "/(elderly)/(tabs)" : "/(caregiver)/(tabs)");
    } catch (error) { setMessage(error instanceof Error ? error.message : "This invitation could not be accepted."); }
    finally { setBusy(false); }
  }
  return <Screen><Heading title="Join your family" subtitle="Use the invitation code shared by your trusted family member." />
    <TextInput accessibilityLabel="Invitation code" autoCapitalize="none" value={token} onChangeText={setToken} style={styles.input} />
    <ActionButton onPress={() => void join()} loading={busy}>Join family</ActionButton>
    {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
  </Screen>;
}
const styles = StyleSheet.create({ input: { minHeight: 64, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 16, fontFamily: "Inter_400Regular", fontSize: 20, color: colors.ink }, message: { color: colors.red, fontFamily: "Inter_500Medium", fontSize: 16 } });
