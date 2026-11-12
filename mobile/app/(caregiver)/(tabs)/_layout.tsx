import { Tabs } from "expo-router";
import { colors } from "@/theme/tokens";
import { t } from "@/constants/strings";
import { usePreferences } from "@/store/preferences";

export default function CaregiverTabs() {
  const language = usePreferences((state) => state.language);
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.blue, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { minHeight: 76, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.white, borderTopColor: colors.line },
    tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 12 }, }}>
    <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarLabel: "Dashboard" }} />
    <Tabs.Screen name="family" options={{ title: t(language, "family"), tabBarLabel: t(language, "family") }} />
    <Tabs.Screen name="tasks" options={{ title: t(language, "tasks"), tabBarLabel: t(language, "tasks") }} />
    <Tabs.Screen name="medicines" options={{ title: t(language, "medicines"), tabBarLabel: t(language, "medicines") }} />
    <Tabs.Screen name="alerts" options={{ title: "Alerts", tabBarLabel: "Alerts" }} />
    <Tabs.Screen name="profile" options={{ title: t(language, "profile"), tabBarLabel: t(language, "profile") }} />
  </Tabs>;
}
