import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { colors } from "@/theme/tokens";

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return <ScrollView contentContainerStyle={styles.content} style={styles.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 16 },
});
