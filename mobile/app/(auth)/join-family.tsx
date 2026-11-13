import { useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";

export default function JoinFamily() {
  const router = useRouter();
  const { t } = useI18n();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function join() {
    if (token.trim().length < 6) {
      setMessage("Enter the full invitation code from your family member.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const membership = await api<{ role: "elderly" | "caregiver" }>(
        "/invitations/accept",
        {
          method: "POST",
          body: JSON.stringify({ token: token.trim().toUpperCase() }),
        }
      );
      router.replace(membership.role === "elderly" ? "/(elderly)/(tabs)" : "/(caregiver)/(tabs)");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This invitation could not be accepted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {/* Top Nav */}
      <View style={styles.topNav}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backRow}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
          <Text style={styles.backLabel}>{t("back")}</Text>
        </Pressable>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="key-outline" size={32} color={colors.blue} />
        </View>
        <Text style={styles.title}>Join your family</Text>
        <Text style={styles.subtitle}>
          Enter the invitation code shared by your trusted family member to link your accounts.
        </Text>
      </View>

      {/* Code Card */}
      <View style={styles.card}>
        <Text style={styles.inputLabel}>Invitation Code</Text>
        <TextInput
          accessibilityLabel="Invitation code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          placeholder="e.g. AB12CD"
          placeholderTextColor={colors.muted}
          value={token}
          onChangeText={(text) => {
            setToken(text);
            if (message) setMessage("");
          }}
          style={styles.input}
        />

        {message ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.red} />
            <Text accessibilityRole="alert" style={styles.errorText}>
              {message}
            </Text>
          </View>
        ) : null}

        <ActionButton onPress={() => void join()} loading={busy}>
          Join family
        </ActionButton>
      </View>

      {/* Helpful Hint */}
      <View style={styles.hintBox}>
        <Ionicons name="information-circle-outline" size={20} color={colors.muted} />
        <Text style={styles.hintText}>
          Don’t have a code? Ask your family caregiver to generate one from the Family tab in their Saathi app.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topNav: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  backLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.ink,
  },
  header: {
    alignItems: "center",
    gap: 10,
    marginVertical: 18,
    paddingHorizontal: 12,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: colors.ink,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 14,
  },
  inputLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: colors.ink,
  },
  input: {
    minHeight: 64,
    borderRadius: radii.control,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: colors.ink,
    textAlign: "center",
    letterSpacing: 2,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.rose,
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    flex: 1,
    color: colors.red,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  hintBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginTop: 18,
  },
  hintText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
});
