import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/tokens";

export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.wrap}><Text accessibilityRole="header" style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
}
const styles = StyleSheet.create({
  wrap: { gap: 6 }, title: { color: colors.ink, fontFamily: "Inter_700Bold", fontSize: 28, lineHeight: 38 },
  subtitle: { color: colors.muted, fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 26 },
});
