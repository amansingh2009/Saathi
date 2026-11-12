import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View, Pressable } from "react-native";
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

type Task = {
  id: string;
  title: string;
  status: string;
  due_at?: string;
  assigned_to?: string;
};

export default function Tasks() {
  const router = useRouter();
  const family = useFamilyContext();
  const id = family.data?.family.id;
  const { t, language } = useI18n();

  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  const tasks = useQuery({
    queryKey: ["tasks", id],
    enabled: !!id,
    queryFn: () => api<Task[]>(`/tasks?family_id=${id}`),
  });

  const members = useQuery({
    queryKey: ["members", id],
    enabled: !!id,
    queryFn: () => api<FamilyMember[]>(`/families/${id}/members`),
  });

  useFamilyRealtime(id);

  if (family.isLoading || tasks.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (family.error || tasks.error) {
    return (
      <Screen>
        <ProblemState
          message={t("taskNotSaved")}
          retry={() => void tasks.refetch()}
        />
      </Screen>
    );
  }

  const allTasks = tasks.data ?? [];
  const pendingCount = allTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;
  const completedCount = allTasks.filter((t) => t.status === "completed").length;

  const filtered = allTasks.filter((task) => {
    if (filter === "pending") return task.status !== "completed" && task.status !== "cancelled";
    if (filter === "completed") return task.status === "completed";
    return true;
  });

  const locale = language === "hi" ? "hi-IN" : language === "ta" ? "ta-IN" : "en-US";

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.pageTitle}>{t("familyTasks")}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {pendingCount} {t("tasks").toLowerCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.pageSubtitle}>{t("familyTasksSub")}</Text>
      </View>

      {/* Add Task Quick Button */}
      <View style={styles.actionWrap}>
        <ActionButton onPress={() => router.push("/(caregiver)/add-task")}>
          <Ionicons name="add" size={20} color={colors.white} /> {t("addTask")}
        </ActionButton>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setFilter("all")}
          style={[styles.filterChip, filter === "all" && styles.filterChipActive]}
        >
          <Text style={[styles.filterText, filter === "all" && styles.filterTextActive]}>
            All ({allTasks.length})
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setFilter("pending")}
          style={[styles.filterChip, filter === "pending" && styles.filterChipActive]}
        >
          <Text style={[styles.filterText, filter === "pending" && styles.filterTextActive]}>
            Pending ({pendingCount})
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setFilter("completed")}
          style={[styles.filterChip, filter === "completed" && styles.filterChipActive]}
        >
          <Text style={[styles.filterText, filter === "completed" && styles.filterTextActive]}>
            Completed ({completedCount})
          </Text>
        </Pressable>
      </View>

      {/* Task List */}
      {filtered.length ? (
        <View style={styles.list}>
          {filtered.map((task) => {
            const isCompleted = task.status === "completed";
            const isCancelled = task.status === "cancelled";
            const assignee = members.data?.find((m) => m.user_id === task.assigned_to);
            const assigneeName = assignee?.profile?.full_name;

            return (
              <View
                key={task.id}
                style={[
                  styles.card,
                  isCompleted && styles.cardCompleted,
                ]}
              >
                <View
                  style={[
                    styles.iconCircle,
                    isCompleted ? styles.iconCircleGreen : styles.iconCircleBlue,
                  ]}
                >
                  <Ionicons
                    name={isCompleted ? "checkmark" : "time-outline"}
                    size={22}
                    color={isCompleted ? colors.green : colors.blue}
                  />
                </View>

                <View style={styles.infoCol}>
                  <Text
                    style={[
                      styles.taskTitle,
                      isCompleted && styles.taskTitleCompleted,
                    ]}
                  >
                    {task.title}
                  </Text>

                  <View style={styles.metaRow}>
                    {task.due_at ? (
                      <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={14} color={colors.muted} />
                        <Text style={styles.metaText}>
                          {new Date(task.due_at).toLocaleTimeString(locale, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                    ) : null}

                    {assigneeName ? (
                      <View style={styles.metaItem}>
                        <Ionicons name="person-outline" size={14} color={colors.muted} />
                        <Text style={styles.metaText}>{assigneeName}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    isCompleted
                      ? styles.statusPillGreen
                      : isCancelled
                      ? styles.statusPillMuted
                      : styles.statusPillBlue,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      isCompleted
                        ? styles.statusPillTextGreen
                        : isCancelled
                        ? styles.statusPillTextMuted
                        : styles.statusPillTextBlue,
                    ]}
                  >
                    {isCompleted ? t("completedLabel") : isCancelled ? t("cancelled") : t("waitingCompletion")}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        /* Empty State */
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="checkbox-outline" size={44} color={colors.blue} />
          </View>
          <Text style={styles.emptyTitle}>
            {filter === "completed" ? "No completed tasks yet" : t("noTasksToday")}
          </Text>
          <Text style={styles.emptySubtitle}>
            {filter === "pending"
              ? "All caught up! No tasks are currently waiting for completion."
              : "Keep daily routines organized by adding simple tasks for your family."}
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
  countBadge: {
    backgroundColor: colors.pale,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: colors.blue,
  },
  pageSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
    lineHeight: 22,
  },
  actionWrap: {
    marginBottom: 16,
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
    gap: 12,
    paddingBottom: 24,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  cardCompleted: {
    backgroundColor: "#FBFDFB",
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleBlue: {
    backgroundColor: colors.pale,
  },
  iconCircleGreen: {
    backgroundColor: colors.mint,
  },
  infoCol: {
    flex: 1,
    gap: 4,
  },
  taskTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.ink,
  },
  taskTitleCompleted: {
    textDecorationLine: "line-through",
    color: colors.muted,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillGreen: {
    backgroundColor: colors.mint,
  },
  statusPillBlue: {
    backgroundColor: colors.pale,
  },
  statusPillMuted: {
    backgroundColor: "#F0F2F6",
  },
  statusPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  statusPillTextGreen: {
    color: colors.green,
  },
  statusPillTextBlue: {
    color: colors.blue,
  },
  statusPillTextMuted: {
    color: colors.muted,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 16,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
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
