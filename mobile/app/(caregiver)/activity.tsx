import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LoadingState } from "@/components/LoadingState";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";

type ActivityEvent = {
  id: string;
  kind: "task" | "medicine";
  title: string;
  detail: string;
  user_id: string;
  created_at: string;
};

export default function SharedActivity() {
  const router = useRouter();
  const family = useFamilyContext();
  const id = family.data?.family.id;
  const { t, language } = useI18n();

  const query = useQuery({
    queryKey: ["activity", id],
    enabled: !!id,
    queryFn: () => api<ActivityEvent[]>(`/activity?family_id=${id}`),
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
          message={t("sharedActivityCouldnLoad")}
          retry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const events = query.data ?? [];
  const locale = language === "hi" ? "hi-IN" : language === "ta" ? "ta-IN" : "en-US";

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
          <Text style={styles.backLabel}>{t("dashboard")}</Text>
        </Pressable>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("sharedActivity")}</Text>
        <Text style={styles.subtitle}>{t("sharedActivitySubtitle")}</Text>
      </View>

      {/* Timeline List */}
      {events.length ? (
        <View style={styles.timelineList}>
          {events.map((event) => {
            const isTask = event.kind === "task";
            return (
              <View key={`${event.kind}:${event.id}`} style={styles.eventCard}>
                <View
                  style={[
                    styles.iconCircle,
                    isTask ? styles.iconCircleGreen : styles.iconCircleBlue,
                  ]}
                >
                  <Ionicons
                    name={isTask ? "checkmark-circle" : "medkit"}
                    size={22}
                    color={isTask ? colors.green : colors.blue}
                  />
                </View>

                <View style={styles.eventInfoCol}>
                  <View style={styles.eventHeaderRow}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <View
                      style={[
                        styles.badge,
                        isTask ? styles.badgeGreen : styles.badgeBlue,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          isTask ? styles.badgeTextGreen : styles.badgeTextBlue,
                        ]}
                      >
                        {isTask ? t("tasks").toUpperCase() : t("medicines").toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.eventDetail}>{event.detail}</Text>
                  <Text style={styles.eventTime}>
                    {new Date(event.created_at).toLocaleString(locale, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Ionicons name="time-outline" size={36} color={colors.muted} />
          <Text style={styles.emptyTitle}>{t("noSharedUpdates")}</Text>
          <Text style={styles.emptySubtitle}>{t("sharedActivitySub")}</Text>
        </View>
      )}
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
    gap: 4,
    marginVertical: 10,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    lineHeight: 26,
    color: colors.muted,
  },
  timelineList: {
    gap: 12,
    marginVertical: 6,
  },
  eventCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    flexDirection: "row",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleGreen: {
    backgroundColor: colors.mint,
  },
  iconCircleBlue: {
    backgroundColor: colors.pale,
  },
  eventInfoCol: {
    flex: 1,
    gap: 4,
  },
  eventHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  eventTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.ink,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeGreen: {
    backgroundColor: colors.mint,
  },
  badgeBlue: {
    backgroundColor: colors.pale,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  badgeTextGreen: {
    color: "#286A46",
  },
  badgeTextBlue: {
    color: colors.blue,
  },
  eventDetail: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.muted,
  },
  eventTime: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: "center",
    gap: 10,
    marginVertical: 12,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    color: colors.ink,
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: "center",
  },
});
