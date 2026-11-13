import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";

export default function FamilySetup() {
  const router = useRouter();
  const { t } = useI18n();
  const { role } = useLocalSearchParams<{ role?: string }>();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const caregiver = role !== "elderly";

  async function createFamily() {
    if (!name.trim()) {
      setMessage("Enter a name for your family.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api("/families", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), role: role || "caregiver" }),
      });
      if (role === "elderly") {
        router.replace("/(elderly)/(tabs)");
      } else {
        router.replace("/(caregiver)/(tabs)");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the family.");
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
          <Ionicons name="people-outline" size={32} color={colors.blue} />
        </View>
        <Text style={styles.title}>
          {caregiver ? "Set up your family" : "Join your family"}
        </Text>
        <Text style={styles.subtitle}>
          {caregiver
            ? "Create a shared family group to coordinate tasks, medicines, and emergency alerts."
            : "Ask a trusted family member for an invitation code to connect."}
        </Text>
      </View>

      {/* Form Card */}
      <View style={styles.card}>
        {caregiver ? (
          <>
            <Text style={styles.inputLabel}>Family Name</Text>
            <TextInput
              accessibilityLabel="Family name"
              placeholder="e.g. Sharma Family"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (message) setMessage("");
              }}
              style={styles.input}
              maxLength={120}
            />

            {message ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.red} />
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {message}
                </Text>
              </View>
            ) : null}

            <ActionButton onPress={() => void createFamily()} loading={busy}>
              Create family
            </ActionButton>
          </>
        ) : (
          <>
            <Text style={styles.seniorHelpText}>
              Your family caregiver can set up the group and invite you directly with a code.
            </Text>
            <ActionButton onPress={() => router.push("/(auth)/join-family")}>
              Enter invitation code
            </ActionButton>
          </>
        )}
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
    minHeight: 56,
    borderRadius: radii.control,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    fontFamily: "Inter_500Medium",
    fontSize: 18,
    color: colors.ink,
  },
  seniorHelpText: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
    lineHeight: 24,
    textAlign: "center",
    paddingVertical: 8,
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
});
