import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View, Alert, Share, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FamilyList, type FamilyMember } from "@/components/FamilyList";
import { ActionButton } from "@/components/ActionButton";
import { LoadingState } from "@/components/LoadingState";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";

export default function Family() {
  const family = useFamilyContext();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState<{ token: string; role: "elderly" | "caregiver" } | null>(null);
  const id = family.data?.family.id;
  const members = useQuery({
    queryKey: ["members", id],
    enabled: !!id,
    queryFn: () => api<FamilyMember[]>(`/families/${id}/members`),
  });

  async function invite(role: "elderly" | "caregiver") {
    if (!family.data) return;
    setInviting(true);
    try {
      const result = await api<{ invite_token: string; expires_at: string }>(
        `/families/${family.data.family.id}/invite`,
        {
          method: "POST",
          body: JSON.stringify({ role, email: email.trim() || null, expires_in_hours: 72 }),
        }
      );
      setLastInvite({ token: result.invite_token, role });
      setEmail("");
      await Share.share({
        message: `Join my family on Saathi. Your invitation code is:\n\n${result.invite_token}\n\nIt expires in 72 hours. Sign in to Saathi and choose Join family.`,
      });
    } catch {
      Alert.alert("Invitation not created", "Check your connection and try again.");
    } finally {
      setInviting(false);
    }
  }

  if (family.isLoading || members.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (family.error || members.error) {
    return (
      <Screen>
        <ProblemState
          message="Family contacts couldn’t be loaded."
          retry={() => void members.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("yourFamily")}</Text>
        <Text style={styles.subtitle}>
          {family.data?.family.name ? `${family.data.family.name} • ` : ""}
          Manage family members and generate invite codes.
        </Text>
      </View>

      {/* Invite Member Card */}
      <View style={styles.inviteCard}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="person-add" size={22} color={colors.blue} />
          <Text style={styles.cardHeaderTitle}>Invite a Member</Text>
        </View>

        <TextInput
          accessibilityLabel="Invitation email (optional)"
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="Email address (optional)"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />

        <View style={styles.inviteButtons}>
          <ActionButton
            loading={inviting}
            onPress={() => void invite("elderly")}
          >
            {t("inviteFamilyMember")}
          </ActionButton>
          <ActionButton
            variant="secondary"
            loading={inviting}
            onPress={() => void invite("caregiver")}
          >
            {t("inviteCaregiver")}
          </ActionButton>
        </View>
      </View>

      {/* Generated Invite Code Panel */}
      {lastInvite ? (
        <View style={styles.codePanel}>
          <View style={styles.codePanelHeader}>
            <Ionicons name="checkmark-circle" size={24} color={colors.green} />
            <Text style={styles.inviteTitle}>{t("inviteCodeGenerated")}</Text>
          </View>
          <Text style={styles.inviteSubtitle}>
            {t("inviteShareDesc", {
              role: lastInvite.role === "elderly" ? t("elderly") : t("caregiver"),
            })}
          </Text>
          <View style={styles.codeContainer}>
            <Text selectable style={styles.codeText}>
              {lastInvite.token}
            </Text>
          </View>
          <ActionButton
            variant="secondary"
            onPress={() =>
              void Share.share({
                message: `Join my family on Saathi. Your invitation code is:\n\n${lastInvite.token}\n\nIt expires in 72 hours. Sign in to Saathi and choose Join family.`,
              })
            }
          >
            {t("shareInviteCode")}
          </ActionButton>
        </View>
      ) : null}

      {/* Connected Members */}
      <View style={styles.membersSection}>
        <Text style={styles.membersSectionTitle}>Connected Members</Text>
        {members.data?.length ? (
          <FamilyList members={members.data} />
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyTitle}>No members connected yet</Text>
            <Text style={styles.emptySubtitle}>
              Send an invite code above to connect family members.
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
    lineHeight: 22,
  },
  inviteCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    gap: 12,
    marginBottom: 20,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardHeaderTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: colors.ink,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    paddingHorizontal: 16,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.background,
  },
  inviteButtons: {
    gap: 10,
    marginTop: 4,
  },
  codePanel: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.green,
    padding: 18,
    gap: 10,
    marginBottom: 20,
  },
  codePanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inviteTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: colors.ink,
  },
  inviteSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
  },
  codeContainer: {
    backgroundColor: colors.pale,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  codeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: colors.blue,
    letterSpacing: 1,
    textAlign: "center",
  },
  membersSection: {
    gap: 12,
    marginBottom: 24,
  },
  membersSectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    color: colors.ink,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.ink,
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
});
