import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";

export default function ChooseRole() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <Screen>
      {/* Top Bar with Back Button */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
          <Text style={styles.backText}>{t("back")}</Text>
        </Pressable>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("whoWillUseSaathi")}</Text>
        <Text style={styles.subtitle}>{t("chooseExperience")}</Text>
      </View>

      {/* Card 1: Elderly User */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconCircleBlue}>
            <Ionicons name="person" size={28} color={colors.blue} />
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>{t("elderly")}</Text>
            <Text style={styles.cardSubtitle}>{t("elderlySubtitle")}</Text>
          </View>
        </View>

        <ActionButton
          variant="primary"
          onPress={() =>
            router.push({
              pathname: "/(auth)/sign-in",
              params: { role: "elderly" },
            })
          }
        >
          {t("imElderlyUser")}
        </ActionButton>
      </View>

      {/* Card 2: Family Member */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconCircleGreen}>
            <Ionicons name="people" size={28} color={colors.green} />
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>{t("caregiver")}</Text>
            <Text style={styles.cardSubtitle}>{t("caregiverSubtitle")}</Text>
          </View>
        </View>

        <ActionButton
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: "/(auth)/sign-in",
              params: { role: "caregiver" },
            })
          }
        >
          {t("imCaregiver")}
        </ActionButton>
      </View>

      {/* Footer Note */}
      <View style={styles.footer}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.muted} />
        <Text style={styles.privacyNote}>{t("privacyNote")}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
  },
  backText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.ink,
  },
  header: {
    gap: 8,
    marginVertical: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    lineHeight: 36,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    lineHeight: 26,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  iconCircleBlue: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleGreen: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: colors.ink,
  },
  cardSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: "auto",
    paddingVertical: 16,
  },
  privacyNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
});
