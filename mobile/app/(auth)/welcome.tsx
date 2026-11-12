import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Panel } from "@/components/Panel";
import { Screen } from "@/components/Screen";
import { t } from "@/constants/strings";
import { colors } from "@/theme/tokens";
import { usePreferences, type Language } from "@/store/preferences";

export default function Welcome() {
  const router = useRouter();
  const language = usePreferences((state) => state.language);
  const setLanguage = usePreferences((state) => state.setLanguage);
  const languages: { id: Language; label: string }[] = [{ id: "en", label: "English" }, { id: "hi", label: "हिन्दी" }, { id: "ta", label: "தமிழ்" }];
  return <Screen>
    <View style={styles.top}><Text style={styles.brand}>{t(language, "appName")}</Text><Text style={styles.tagline}>A little help. A lot of independence.</Text></View>
    <Heading title={t(language, "welcome")} subtitle={t(language, "subtitle")} />
    <Text style={styles.section}>{t(language, "chooseLanguage")}</Text>
    <Panel>{languages.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: language === item.id }} onPress={() => setLanguage(item.id)} style={[styles.language, language === item.id && styles.languageSelected]}><Text style={[styles.languageText, language === item.id && styles.languageTextSelected]}>{item.label}</Text></Pressable>)}</Panel>
    <ActionButton onPress={() => router.push("/(auth)/choose-role")}>{t(language, "continue")}</ActionButton>
  </Screen>;
}

const styles = StyleSheet.create({
  top: { gap: 4, paddingTop: 24 }, brand: { fontFamily: "Inter_700Bold", fontSize: 34, color: colors.blue },
  tagline: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: colors.ink },
  section: { fontFamily: "Inter_600SemiBold", fontSize: 22, color: colors.ink },
  language: { minHeight: 56, borderRadius: 12, padding: 14, justifyContent: "center", backgroundColor: colors.white },
  languageSelected: { backgroundColor: colors.pale }, languageText: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: colors.ink },
  languageTextSelected: { color: colors.blue },
});
