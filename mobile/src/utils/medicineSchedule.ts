export type WeeklyReminderTrigger = { weekday: number; hour: number; minute: number };

/** Convert PostgreSQL day-of-week values (Sunday=0) to Expo's weekly trigger values (Sunday=1). */
export function weeklyReminderTriggers(time: string, daysOfWeek: number[]): WeeklyReminderTrigger[] {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(time);
  if (!match) return [];
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return [];
  return [...new Set(daysOfWeek)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .map((day) => ({ weekday: day + 1, hour, minute }));
}
