import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/tokens";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <View style={styles.wrap}><ActivityIndicator color={colors.blue} size="large" /><Text style={styles.label}>{label}</Text></View>;
}
const styles = StyleSheet.create({ wrap: { padding: 24, gap: 16, alignItems: "center" }, label: { color: colors.muted, fontFamily: "Inter_500Medium", fontSize: 18 } });
