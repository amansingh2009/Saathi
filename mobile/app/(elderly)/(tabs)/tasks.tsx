import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, StyleSheet, Text, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { LoadingState } from "@/components/LoadingState";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { useFamilyRealtime } from "@/hooks/useFamilyRealtime";
import { useI18n } from "@/hooks/useI18n";

type Task = {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "completed" | "cancelled";
  due_at?: string;
};

export default function Tasks() {
  const { t } = useI18n();
  const family = useFamilyContext();
  const client = useQueryClient();
  const familyId = family.data?.family.id;

  useFamilyRealtime(familyId);

  const query = useQuery({
    queryKey: ["tasks", familyId],
    enabled: !!familyId,
    queryFn: () => api<Task[]>(`/tasks?family_id=${familyId}`),
  });

  async function complete(id: string) {
    try {
      await api(`/tasks/${id}/complete`, { method: "POST" });
      await client.invalidateQueries({ queryKey: ["tasks", familyId] });
    } catch {
      Alert.alert("Task not updated", "Check your connection and try again.");
    }
  }

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
          message="Tasks couldn’t be loaded."
          retry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const allTasks = query.data ?? [];
  const pending = allTasks.filter((task) => task.status === "pending");
  const completed = allTasks.filter((task) => task.status === "completed");
  const total = allTasks.length;

  return (
    <Screen>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>{t("dailyTasks")}</Text>
        <Text style={styles.pageSubtitle}>{t("taskSubtitle")}</Text>
      </View>

      {/* Progress Card */}
      {total > 0 ? (
        <View style={styles.progressCard}>
          <View style={styles.progressHeaderRow}>
            <Text style={styles.progressLabel}>{t("todaysProgress")}</Text>
            <Text style={styles.progressStat}>
              {t("tasksCompletedCount", { completed: completed.length, total })}
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${total ? (completed.length / total) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>
      ) : null}

      {/* Pending Tasks Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("toDo", { count: pending.length })}</Text>
      </View>

      {pending.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="sparkles-outline" size={32} color={colors.green} />
          <Text style={styles.emptyTitle}>{t("allDoneToday")}</Text>
          <Text style={styles.emptySubtitle}>
            {t("enjoyRest")}
          </Text>
        </View>
      ) : (
        pending.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.taskHeaderRow}>
              <View style={styles.checkboxCircle}>
                <Ionicons name="ellipse-outline" size={26} color={colors.muted} />
              </View>
              <View style={styles.taskInfoCol}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                {task.description ? (
                  <Text style={styles.taskDescription}>{task.description}</Text>
                ) : null}
                {task.due_at ? (
                  <View style={styles.dueRow}>
                    <Ionicons name="time-outline" size={14} color={colors.muted} />
                    <Text style={styles.dueText}>
                      {new Date(task.due_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <ActionButton onPress={() => void complete(task.id)}>
              {t("markDone")}
            </ActionButton>
          </View>
        ))
      )}

      {/* Completed Tasks Section */}
      {completed.length > 0 ? (
        <View style={styles.completedSection}>
          <Text style={styles.sectionTitle}>{t("completedSection", { count: completed.length })}</Text>
          {completed.map((task) => (
            <View key={task.id} style={styles.completedCard}>
              <View style={styles.checkDoneCircle}>
                <Ionicons name="checkmark" size={18} color={colors.white} />
              </View>
              <View style={styles.taskInfoCol}>
                <Text style={styles.completedTaskTitle}>{task.title}</Text>
                <Text style={styles.completedSub}>{t("completedLabel")}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pageTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: colors.ink,
  },
  pageSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    color: colors.muted,
  },
  progressCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    gap: 12,
    marginVertical: 4,
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.ink,
  },
  progressStat: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: colors.blue,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 8,
    backgroundColor: colors.blue,
    borderRadius: 4,
  },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    color: colors.ink,
  },
  taskCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 16,
    marginBottom: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  taskHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  checkboxCircle: {
    paddingTop: 2,
  },
  taskInfoCol: {
    flex: 1,
    gap: 4,
  },
  taskTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    lineHeight: 28,
    color: colors.ink,
  },
  taskDescription: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
  },
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  dueText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.muted,
  },
  emptyCard: {
    backgroundColor: colors.mint,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: "#C6E9D5",
    padding: 24,
    alignItems: "center",
    gap: 10,
    marginVertical: 8,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#286A46",
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: "#3C7E5A",
    textAlign: "center",
  },
  completedSection: {
    gap: 10,
    marginTop: 14,
  },
  completedCard: {
    backgroundColor: colors.mint,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: "#C6E9D5",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  checkDoneCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  completedTaskTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: "#286A46",
    textDecorationLine: "line-through",
  },
  completedSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#3C7E5A",
  },
});
