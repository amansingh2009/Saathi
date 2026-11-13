import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, StyleSheet, Text, View, Pressable, Linking, Image, Modal } from "react-native";
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
  front_camera_url?: string | null;
  back_camera_url?: string | null;
  screenshot_url?: string | null;
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
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

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

                {/* Evidence Media Section (Front Camera, Back Camera, Senior Screenshot) */}
                {alert.front_camera_url || alert.back_camera_url || alert.screenshot_url ? (
                  <View style={styles.evidenceContainer}>
                    <View style={styles.evidenceHeaderRow}>
                      <Ionicons name="images-outline" size={16} color={colors.blue} />
                      <Text style={styles.evidenceHeading}>Live Evidence & Multi-Capture</Text>
                    </View>
                    <View style={styles.evidenceGrid}>
                      {alert.front_camera_url ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="View Front Camera Capture"
                          style={styles.evidenceItem}
                          onPress={() => setPreviewImage({ url: alert.front_camera_url!, title: "Senior Front Camera" })}
                        >
                          <Image source={{ uri: alert.front_camera_url }} style={styles.evidenceThumb} />
                          <View style={styles.evidenceBadge}>
                            <Ionicons name="camera" size={11} color={colors.white} />
                            <Text style={styles.evidenceBadgeText}>Front Camera</Text>
                          </View>
                        </Pressable>
                      ) : null}
                      {alert.back_camera_url ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="View Back Camera Capture"
                          style={styles.evidenceItem}
                          onPress={() => setPreviewImage({ url: alert.back_camera_url!, title: "Senior Back Camera" })}
                        >
                          <Image source={{ uri: alert.back_camera_url }} style={styles.evidenceThumb} />
                          <View style={styles.evidenceBadge}>
                            <Ionicons name="camera-reverse" size={11} color={colors.white} />
                            <Text style={styles.evidenceBadgeText}>Back Camera</Text>
                          </View>
                        </Pressable>
                      ) : null}
                      {alert.screenshot_url ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="View Senior Screen Screenshot"
                          style={styles.evidenceItem}
                          onPress={() => setPreviewImage({ url: alert.screenshot_url!, title: "Senior Screen Snapshot" })}
                        >
                          <Image source={{ uri: alert.screenshot_url }} style={styles.evidenceThumb} />
                          <View style={styles.evidenceBadge}>
                            <Ionicons name="phone-portrait" size={11} color={colors.white} />
                            <Text style={styles.evidenceBadgeText}>Screen Snapshot</Text>
                          </View>
                        </Pressable>
                      ) : null}
                    </View>
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

      {/* Evidence Fullscreen Preview Modal */}
      <Modal
        visible={!!previewImage}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{previewImage?.title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close image preview"
                onPress={() => setPreviewImage(null)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            {previewImage?.url ? (
              <Image
                source={{ uri: previewImage.url }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>
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
  evidenceContainer: {
    backgroundColor: colors.pale,
    borderRadius: radii.control,
    padding: 12,
    gap: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  evidenceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  evidenceHeading: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: colors.ink,
  },
  evidenceGrid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  evidenceItem: {
    flex: 1,
    minWidth: 90,
    height: 110,
    borderRadius: radii.control,
    overflow: "hidden",
    position: "relative",
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
  },
  evidenceThumb: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  evidenceBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingVertical: 3,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  evidenceBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: colors.white,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    padding: 16,
    gap: 12,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.ink,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalImage: {
    width: "100%",
    height: 380,
    borderRadius: radii.control,
    backgroundColor: colors.pale,
  },
});
