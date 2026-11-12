import { StyleSheet, Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { colors } from "@/theme/tokens";

export function ProblemState({ message, retry }: { message: string; retry?: () => void }) {
  return <View style={styles.wrap}><Text accessibilityRole="alert" style={styles.message}>{message}</Text>{retry ? <ActionButton variant="secondary" onPress={retry}>Try again</ActionButton> : null}</View>;
}
const styles = StyleSheet.create({ wrap: { padding: 20, gap: 12 }, message: { color: colors.muted, fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 26 } });
