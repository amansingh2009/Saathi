import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FamilyList, type FamilyMember } from "@/components/FamilyList";
import { LoadingState } from "@/components/LoadingState";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { supabase } from "@/services/supabase";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";

export default function Family() {
  const { t } = useI18n();
  const family = useFamilyContext();
  const familyId = family.data?.family.id;
  const familyName = family.data?.family.name;
  const [userId, setUserId] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id);
    });
    return () => {
      active = false;
    };
  }, []);

  const query = useQuery({
    queryKey: ["members", familyId],
    enabled: !!familyId,
    queryFn: () => api<FamilyMember[]>(`/families/${familyId}/members`),
  });

  if (family.isLoading || query.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (family.error || query.error) {
    return (
      <Screen>
        <ProblemState
          message="Family contacts couldn’t be loaded."
          retry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const members = query.data ?? [];

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("yourFamily")}</Text>
        <Text style={styles.subtitle}>
          {familyName ? `${familyName} • ` : ""}{t("privacyNote")}
        </Text>
      </View>

      {/* Member List or Empty State */}
      {members.length > 0 ? (
        <FamilyList members={members} currentUserId={userId} />
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="people-outline" size={44} color={colors.blue} />
          </View>
          <Text style={styles.emptyTitle}>No family members yet</Text>
          <Text style={styles.emptySubtitle}>
            When a family member accepts an invitation, they will appear here with direct calling.
          </Text>
        </View>
      )}
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
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 20,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
});
