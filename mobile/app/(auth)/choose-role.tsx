import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { Heading } from "@/components/Heading";
import { Panel } from "@/components/Panel";
import { Screen } from "@/components/Screen";
import { ActionButton } from "@/components/ActionButton";
import { t } from "@/constants/strings";
import { colors } from "@/theme/tokens";
import { usePreferences } from "@/store/preferences";

export default function ChooseRole() {
  const router = useRouter();
  const language = usePreferences((state) => state.language);
  return <Screen>
    <Heading title="Who is Saathi for?" subtitle="Choose how you will use Saathi. You can belong to more than one family." />
    <Pressable onPress={() => router.push({ pathname: "/(auth)/sign-in", params: { role: "elderly" } })} accessibilityRole="button">
      <Panel><Text style={styles.optionTitle}>{t(language, "elderly")}</Text><Text style={styles.optionBody}>Simple daily help, reminders, family contact and emergency support.</Text></Panel>
    </Pressable>
    <Pressable onPress={() => router.push({ pathname: "/(auth)/sign-in", params: { role: "caregiver" } })} accessibilityRole="button">
      <Panel><Text style={styles.optionTitle}>{t(language, "caregiver")}</Text><Text style={styles.optionBody}>Stay connected, manage care, and offer guidance when invited.</Text></Panel>
    </Pressable>
    <ActionButton variant="secondary" onPress={() => router.push("/(auth)/sign-in")}>{t(language, "signIn")}</ActionButton>
  </Screen>;
}

const styles = StyleSheet.create({ optionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 22, lineHeight: 30, color: colors.ink }, optionBody: { fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 26, color: colors.muted } });
