import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/services/supabase";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";
import { useActiveFamily } from "@/store/activeFamily";
import { usePreferences, type Language } from "@/store/preferences";

type Family = { id: string };
type Membership = { family_id: string; user_id: string; role: "elderly" | "caregiver"; status: string };

export default function Index() {
  const router = useRouter();
  const selectedFamilyId = useActiveFamily((state) => state.familyId);
  const setLanguage = usePreferences((state) => state.setLanguage);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const session = data.session;
      if (!session) return router.replace("/(auth)/welcome");
      try {
        const profile = await api<{ preferred_language?: Language }>("/profiles/me");
        if (profile.preferred_language) setLanguage(profile.preferred_language);
        const families = await api<Family[]>("/families");
        const memberships = [];
        for (const family of families) {
          const members = await api<Membership[]>(`/families/${family.id}/members`);
          const own = members.find((member) => member.user_id === session.user.id && member.status === "active");
          if (own) memberships.push(own.family_id === selectedFamilyId ? { ...own, selected: true } : own);
        }
        const own = memberships.find((membership) => "selected" in membership && membership.selected) ?? memberships[0];
        if (own?.role === "elderly") return router.replace("/(elderly)/(tabs)");
        if (own) return router.replace("/(caregiver)/(tabs)");
        router.replace("/(auth)/choose-role");
      } catch {
        router.replace("/(auth)/connection-error");
      }
    })();
    return () => { active = false; };
  }, [router, selectedFamilyId, setLanguage]);
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color={colors.blue} size="large" /></View>;
}
