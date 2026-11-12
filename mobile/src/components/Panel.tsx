import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { colors, radii } from "@/theme/tokens";

export function Panel({ children }: PropsWithChildren) {
  return <View style={styles.panel}>{children}</View>;
}
const styles = StyleSheet.create({ panel: { padding: 20, gap: 12, backgroundColor: colors.white, borderRadius: radii.cardMax } });
