import * as Notifications from "expo-notifications";
import { weeklyReminderTriggers } from "@/utils/medicineSchedule";

export type Reminder = { id: string; name: string; scheduled_time: string; days_of_week: number[]; is_active: boolean };

export async function syncMedicineReminders(reminders: Reminder[]) {
  const permission = await Notifications.getPermissionsAsync();
  const response = permission.granted ? permission : await Notifications.requestPermissionsAsync();
  if (!response.granted) return;
  await Notifications.setNotificationChannelAsync("medicine-reminders", {
    name: "Medicine reminders", importance: Notifications.AndroidImportance.DEFAULT,
  });
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(existing.filter((n) => n.content.data?.saathiMedicationReminder === true)
    .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  for (const reminder of reminders.filter((r) => r.is_active)) {
    for (const trigger of weeklyReminderTriggers(reminder.scheduled_time, reminder.days_of_week)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Saathi medicine reminder",
          body: `It’s time to check your ${reminder.name} schedule. Confirm only after taking it.`,
          data: { saathiMedicationReminder: true, medicationId: reminder.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, ...trigger, channelId: "medicine-reminders" },
      });
    }
  }
}
