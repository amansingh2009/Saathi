import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/tokens";
import { t } from "@/constants/strings";
import { usePreferences } from "@/store/preferences";

export default function ElderlyTabs() {
  const language = usePreferences((state) => state.language);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          minHeight: 72,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: colors.white,
          borderTopColor: colors.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 13, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t(language, "home"),
          tabBarLabel: t(language, "home"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: t(language, "tasks"),
          tabBarLabel: t(language, "tasks"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "checkbox" : "checkbox-outline"} size={24} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="medicines"
        options={{
          title: t(language, "medicines"),
          tabBarLabel: t(language, "medicines"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "medkit" : "medkit-outline"} size={24} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="family"
        options={{
          title: t(language, "family"),
          tabBarLabel: t(language, "family"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={24} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t(language, "profile"),
          tabBarLabel: t(language, "profile"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}
