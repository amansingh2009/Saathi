import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";
import type { Language } from "@/store/preferences";

export default function Welcome() {
  const router = useRouter();
  const { t, language, setLanguage } = useI18n();

  const languages: { id: Language; label: string; subLabel: string }[] = [
    { id: "en", label: "English", subLabel: "EN" },
    { id: "hi", label: "हिन्दी", subLabel: "HI" },
    { id: "ta", label: "தமிழ்", subLabel: "TA" },
  ];

  return (
    <Screen>
      {/* Top Header Row with Logo and Language Pill */}
      <View style={styles.headerRow}>
        <Text style={styles.brandLogo}>{t("appName")}</Text>
        <View style={styles.langPill}>
          <Ionicons name="globe-outline" size={16} color={colors.muted} />
          <Text style={styles.langPillText}>
            {languages.find((l) => l.id === language)?.label || "English"}
          </Text>
        </View>
      </View>

      {/* Senior Avatar Hero Portrait */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarOuterCircle}>
          <View style={styles.avatarInnerCircle}>
            <Ionicons name="person" size={72} color={colors.blue} />
          </View>
          <View style={styles.smileBadge}>
            <Ionicons name="heart" size={18} color={colors.white} />
          </View>
        </View>
      </View>

      {/* Title and Tagline */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>{t("welcome")}</Text>
        <Text style={styles.subtitle}>{t("subtitle")}</Text>
      </View>

      {/* Language Selector Section */}
      <View style={styles.languageSection}>
        <Text style={styles.languageLabel}>{t("chooseLanguage")}</Text>
        <View style={styles.languagePillsRow}>
          {languages.map((item) => {
            const isSelected = language === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setLanguage(item.id)}
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

      {/* Primary CTA */}
      <View style={styles.actionSection}>
        <ActionButton onPress={() => router.push("/(auth)/choose-role")}>
          {t("getStarted")}
        </ActionButton>
        <Text style={styles.disclaimerText}>
          {t("languageChangeAnytime")}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  brandLogo: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: colors.blue,
    letterSpacing: -0.5,
  },
  langPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  langPillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.muted,
  },
  avatarSection: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 18,
  },
  avatarOuterCircle: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: colors.pale,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarInnerCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "#DCE7FD",
    alignItems: "center",
    justifyContent: "center",
  },
  smileBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: colors.green,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  titleSection: {
    gap: 10,
    marginBottom: 20,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    lineHeight: 38,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    lineHeight: 26,
    color: colors.muted,
  },
  languageSection: {
    gap: 12,
    marginBottom: 24,
  },
  languageLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: colors.ink,
  },
  languagePillsRow: {
    flexDirection: "row",
    gap: 10,
  },
  languageChip: {
    flex: 1,
    minHeight: 52,
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
    fontSize: 17,
  },
  languageChipTextActive: {
    color: colors.white,
  },
  languageChipTextInactive: {
    color: colors.ink,
  },
  actionSection: {
    gap: 12,
    marginTop: "auto",
    paddingTop: 12,
    paddingBottom: 16,
  },
  disclaimerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
});
