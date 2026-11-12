import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, StyleSheet, Text, View, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { LoadingState } from "@/components/LoadingState";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { useFamilyRealtime } from "@/hooks/useFamilyRealtime";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";
import type { FamilyMember } from "@/components/FamilyList";

type Emergency = {
  id: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: string;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  resolved_at?: string | null;
};

type Notification = {
  emergency_event_id: string | null;
  status: "sent" | "failed" | "not_configured" | "no_registered_devices";
  created_at: string;
};

export default function Alerts() {
  const family = useFamilyContext();
  const client = useQueryClient();
  const id = family.data?.family.id;
  const { t, language } = useI18n();

  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const [actingId, setActingId] = useState<string | null>(null);

  const alerts = useQuery({
    queryKey: ["emergency", id],
    enabled: !!id,
    queryFn: () => api<Emergency[]>(`/emergency?family_id=${id}`),
  });

  const notifications = useQuery({
    queryKey: ["notification-history", id],
    enabled: !!id,
    queryFn: () => api<Notification[]>("/notifications/history"),
  });

  const members = useQuery({
    queryKey: ["members", id],
    enabled: !!id,
    queryFn: () => api<FamilyMember[]>(`/families/${id}/members`),
  });

  useFamilyRealtime(id);

  async function change(alert: Emergency, action: "acknowledge" | "resolve") {
    setActingId(alert.id);
    try {
      await api(`/emergency/${alert.id}/${action}`, { method: "POST" });
      await client.invalidateQueries({ queryKey: ["emergency", id] });
    } catch {
      Alert.alert("Couldn’t update alert", t("checkConnectionTryAgain"));
    } finally {
      setActingId(null);
    }
  }

  async function retryNotify(alertId: string) {
    try {
      await api(`/emergency/${alertId}/notify`, { method: "POST" });
      await client.invalidateQueries({ queryKey: ["notification-history", id] });
      Alert.alert("Notification Sent", "Emergency push notification was resent to all caregivers.");
    } catch {
      Alert.alert("Couldn’t retry notification", t("checkConnectionTryAgain"));
    }
  }

  if (family.isLoading || alerts.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (family.error || alerts.error) {
    return (
      <Screen>
        <ProblemState
          message={t("emergencyAlerts")}
          retry={() => void alerts.refetch()}
        />
      </Screen>
    );
  }

  const allAlerts = alerts.data ?? [];
  const senior = members.data?.find((m) => m.role === "elderly");
  const seniorName = senior?.profile?.full_name || "Senior Member";
  const seniorPhone = senior?.profile?.phone;

  const filtered = allAlerts.filter((a) => {
    if (filter === "active") return a.status === "open" || a.status === "acknowledged";
    if (filter === "resolved") return a.status === "resolved";
    return true;
  });

  const activeCount = allAlerts.filter((a) => a.status === "open" || a.status === "acknowledged").length;
  const locale = language === "hi" ? "hi-IN" : language === "ta" ? "ta-IN" : "en-US";

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.pageTitle}>{t("emergencyAlerts")}</Text>
          {activeCount > 0 ? (
            <View style={styles.activePill}>
              <Text style={styles.activePillText}>{activeCount} Active</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.pageSubtitle}>
          Real-time safety events and push notification delivery tracking.
        </Text>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setFilter("all")}
          style={[styles.filterChip, filter === "all" && styles.filterChipActive]}
        >
          <Text style={[styles.filterText, filter === "all" && styles.filterTextActive]}>
            All ({allAlerts.length})
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setFilter("active")}
          style={[styles.filterChip, filter === "active" && styles.filterChipActive]}
        >
          <Text style={[styles.filterText, filter === "active" && styles.filterTextActive]}>
            Active ({activeCount})
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setFilter("resolved")}
          style={[styles.filterChip, filter === "resolved" && styles.filterChipActive]}
        >
          <Text style={[styles.filterText, filter === "resolved" && styles.filterTextActive]}>
            Resolved ({allAlerts.filter((a) => a.status === "resolved").length})
          </Text>
        </Pressable>
      </View>

      {/* Alert List or Empty State */}
      {filtered.length ? (
        <View style={styles.list}>
          {filtered.map((alert) => {
            const delivery = notifications.data?.find((n) => n.emergency_event_id === alert.id);
            const isOpen = alert.status === "open";
            const isAck = alert.status === "acknowledged";
            const isResolved = alert.status === "resolved";
            const isActing = actingId === alert.id;

            return (
              <View
                key={alert.id}
                style={[
                  styles.card,
                  isOpen ? styles.cardOpen : isAck ? styles.cardAck : styles.cardResolved,
                ]}
              >
                {/* Status Bar */}
                <View style={styles.cardHeader}>
                  <View style={styles.statusBadgeRow}>
                    <Ionicons
                      name={isOpen ? "warning" : isAck ? "checkmark-circle" : "shield-checkmark"}
                      size={20}
                      color={isOpen ? colors.red : isAck ? colors.green : colors.muted}
                    />
                    <Text
                      style={[
                        styles.badgeText,
                        isOpen ? styles.badgeTextRed : isAck ? styles.badgeTextGreen : styles.badgeTextMuted,
                      ]}
                    >
                      {isOpen ? t("needsAck") : isAck ? t("ackFollowUp") : t("resolved")}
                    </Text>
                  </View>
                  <Text style={styles.timeText}>
                    {new Date(alert.created_at).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                {/* Sender Details */}
                <View style={styles.callerRow}>
                  <View style={styles.avatarMini}>
                    <Ionicons name="person" size={20} color={colors.ink} />
                  </View>
                  <View style={styles.callerInfo}>
                    <Text style={styles.callerName}>{seniorName}</Text>
                    <Text style={styles.callerDate}>
                      {new Date(alert.created_at).toLocaleDateString(locale, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </View>
                  {seniorPhone ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Call senior"
                      onPress={() => Linking.openURL(`tel:${seniorPhone}`)}
                      style={styles.quickCallBtn}
                    >
                      <Ionicons name="call" size={18} color={colors.white} />
                    </Pressable>
                  ) : null}
                </View>

                {/* Delivery details */}
                {delivery ? (
                  <View style={styles.deliveryRow}>
                    <Ionicons
                      name={delivery.status === "sent" ? "paper-plane-outline" : "alert-circle-outline"}
                      size={15}
                      color={colors.muted}
                    />
                    <Text style={styles.deliveryText}>
                      Notification · {delivery.status.replaceAll("_", " ")}
                    </Text>
                  </View>
                ) : null}

                {/* Actions */}
                <View style={styles.cardActions}>
                  {isOpen ? (
                    <>
                      <ActionButton
                        variant="danger"
                        loading={isActing}
                        onPress={() => void change(alert, "acknowledge")}
                      >
                        {t("acknowledgeAlert")}
                      </ActionButton>
                      <ActionButton
                        variant="secondary"
                        onPress={() => void retryNotify(alert.id)}
                      >
                        {t("retryCaregiverNotification")}
                      </ActionButton>
                    </>
                  ) : isAck ? (
                    <ActionButton
                      variant="secondary"
                      loading={isActing}
                      onPress={() => void change(alert, "resolve")}
                    >
                      {t("markResolved")}
                    </ActionButton>
                  ) : (
                    <View style={styles.resolvedPill}>
                      <Ionicons name="checkmark-done" size={16} color={colors.green} />
                      <Text style={styles.resolvedPillText}>Safety Confirmed</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        /* Empty State (Figma Frame 40: Alerts · Empty) */
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="shield-checkmark" size={48} color={colors.green} />
          </View>
          <Text style={styles.emptyTitle}>All is well</Text>
          <Text style={styles.emptySubtitle}>
            {filter === "active"
              ? "No active alerts. Your family members are safe and comfortable."
              : t("noEmergencyAlerts")}
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 6,
    marginBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: colors.ink,
  },
  activePill: {
    backgroundColor: colors.rose,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activePillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: colors.red,
  },
  pageSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
    lineHeight: 22,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  filterText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.muted,
  },
  filterTextActive: {
    color: colors.white,
  },
  list: {
    gap: 14,
    paddingBottom: 24,
  },
  card: {
    borderRadius: radii.cardMin,
    padding: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 14,
  },
  cardOpen: {
    borderColor: colors.red,
    backgroundColor: "#FFF9F9",
  },
  cardAck: {
    borderColor: colors.green,
    backgroundColor: "#F7FCF9",
  },
  cardResolved: {
    opacity: 0.88,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  badgeTextRed: {
    color: colors.red,
  },
  badgeTextGreen: {
    color: colors.green,
  },
  badgeTextMuted: {
    color: colors.muted,
  },
  timeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: colors.muted,
  },
  callerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarMini: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  callerInfo: {
    flex: 1,
    gap: 2,
  },
  callerName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.ink,
  },
  callerDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  quickCallBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
  },
  deliveryText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  cardActions: {
    gap: 10,
    marginTop: 4,
  },
  resolvedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
  },
  resolvedPillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.green,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 20,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
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
