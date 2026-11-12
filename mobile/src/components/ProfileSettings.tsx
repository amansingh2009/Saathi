import { useEffect, useState } from "react";
import { Alert, Image, StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { supabase } from "@/services/supabase";
import { useActiveFamily } from "@/store/activeFamily";
import type { Language } from "@/store/preferences";
import { useI18n } from "@/hooks/useI18n";
import { resolveAvatarUrl } from "@/services/avatarStorage";
import { colors, radii } from "@/theme/tokens";

export function ProfileSettings() {
  const router = useRouter();
  const family = useFamilyContext();
  const setFamily = useActiveFamily((s) => s.setFamilyId);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const { t, language, setLanguage } = useI18n();

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
    });
    void api<{ preferred_language?: Language; full_name?: string; avatar_url?: string }>("/profiles/me")
      .then((profile) => {
        if (profile.preferred_language) setLanguage(profile.preferred_language);
        if (profile.full_name) setFullName(profile.full_name);
        if (profile.avatar_url) void resolveAvatarUrl(profile.avatar_url).then(setAvatarUri);
      })
      .catch(() => undefined);
  }, [setLanguage]);

  async function updateLanguage(next: Language) {
    setLanguage(next);
    try {
      await api("/profiles/me", {
        method: "PATCH",
        body: JSON.stringify({ preferred_language: next }),
      });
    } catch {
      Alert.alert(t("languageNotSaved"), t("languageSavedLocalDesc"));
    }
  }

  function selectFamily(familyId: string, role: "elderly" | "caregiver") {
    setFamily(familyId);
    router.replace(role === "elderly" ? "/(elderly)/(tabs)" : "/(caregiver)/(tabs)");
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/(auth)/welcome");
  }

  const role = family.data?.membership.role;
  const isElderly = role === "elderly";

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("yourProfile")}</Text>
        <Text style={styles.subtitle}>{t("manageAccountPrefs")}</Text>
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatarCircle}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <Ionicons
              name={isElderly ? "person" : "shield-checkmark"}
              size={36}
              color={colors.blue}
            />
          )}
        </View>
        <View style={styles.profileTextCol}>
          <Text style={styles.displayName}>{fullName || (isElderly ? t("seniorMember") : t("familyCaregiver"))}</Text>
          <Text style={styles.emailText}>{email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {isElderly ? t("elderly") : t("caregiver")} • {family.data?.family.name || t("appNameDisplay")}
            </Text>
          </View>
        </View>
      </View>

      {/* Language Section (Figma Frame 25 / 51–56) */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="globe-outline" size={20} color={colors.blue} />
          <Text style={styles.sectionTitle}>{t("preferredLanguage")}</Text>
        </View>
        <View style={styles.languagePillsRow}>
          {(
            [
              { id: "en", label: "English" },
              { id: "hi", label: "हिन्दी" },
              { id: "ta", label: "தமிழ்" },
            ] as { id: Language; label: string }[]
          ).map((item) => {
            const isSelected = language === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => void updateLanguage(item.id)}
                style={[
                  styles.languageChip,
                  isSelected ? styles.languageChipActive : styles.languageChipInactive,
                ]}
              >
                <Text
                  style={[
                    styles.languageChipText,
                    isSelected ? styles.languageChipTextActive : styles.languageChipTextInactive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Connected Families */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="people-outline" size={20} color={colors.blue} />
          <Text style={styles.sectionTitle}>{t("connectedFamilies")}</Text>
        </View>
        <View style={styles.familyList}>
          {family.data?.memberships.map((item) => {
            const isCurrent = item.family.id === family.data?.family.id;
            return (
              <Pressable
                key={item.family.id}
                accessibilityRole="button"
                onPress={() => selectFamily(item.family.id, item.membership.role)}
                style={[
                  styles.familyItemCard,
                  isCurrent && styles.familyItemCardActive,
                ]}
              >
                <View style={styles.familyTextCol}>
                  <Text style={styles.familyName}>{item.family.name}</Text>
                  <Text style={styles.familyRole}>
                    {item.membership.role === "elderly" ? t("elderly") : t("caregiver")}
                  </Text>
                </View>
                {isCurrent ? (
                  <View style={styles.activeCheck}>
                    <Ionicons name="checkmark" size={16} color={colors.white} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Senior Connect Quick Access (for calling & networking) */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(elderly)/connect")}
        style={styles.connectCard}
      >
        <Ionicons name="videocam" size={24} color={colors.blue} />
        <View style={styles.connectTextCol}>
          <Text style={styles.connectTitle}>{t("seniorConnectSettings")}</Text>
          <Text style={styles.connectSub}>{t("seniorConnectSub")}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>

      {/* Privacy Notice */}
      <View style={styles.privacyBox}>
        <Ionicons name="shield-outline" size={18} color={colors.muted} />
        <Text style={styles.privacyText}>{t("screenGuidanceConsentNote")}</Text>
      </View>

      {/* Sign Out CTA */}
      <View style={styles.signOutSection}>
        <ActionButton variant="secondary" onPress={() => void signOut()}>
          {t("signOut")}
        </ActionButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    color: colors.muted,
  },
  profileCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  profileTextCol: {
    flex: 1,
    gap: 4,
  },
  displayName: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
  },
  emailText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.muted,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.pale,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 2,
  },
  roleBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: colors.blue,
  },
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    gap: 14,
    marginVertical: 6,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: colors.ink,
  },
  languagePillsRow: {
    flexDirection: "row",
    gap: 10,
  },
  languageChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  languageChipActive: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  languageChipInactive: {
    backgroundColor: colors.white,
    borderColor: colors.line,
  },
  languageChipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  languageChipTextActive: {
    color: colors.white,
  },
  languageChipTextInactive: {
    color: colors.ink,
  },
  familyList: {
    gap: 8,
  },
  familyItemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  familyItemCardActive: {
    backgroundColor: colors.pale,
    borderColor: "#D4E2FC",
  },
  familyTextCol: {
    gap: 2,
  },
  familyName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.ink,
  },
  familyRole: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  activeCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  connectCard: {
    backgroundColor: colors.pale,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: "#D4E2FC",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginVertical: 6,
  },
  connectTextCol: {
    flex: 1,
    gap: 2,
  },
  connectTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.blue,
  },
  connectSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  privacyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    marginVertical: 8,
  },
  privacyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    flex: 1,
  },
  signOutSection: {
    marginTop: 10,
    marginBottom: 20,
  },
});
