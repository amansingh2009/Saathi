import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewStyle, type StyleProp } from "react-native";
import { colors, radii } from "@/theme/tokens";

export function Panel({
  children,
  style,
  variant,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  variant?: "default" | "mint" | "pale" | "rose" | "bordered";
}>) {
  const variantStyle =
    variant === "mint"
      ? styles.mint
      : variant === "pale"
      ? styles.pale
      : variant === "rose"
      ? styles.rose
      : variant === "bordered"
      ? styles.bordered
      : null;

  return <View style={[styles.panel, variantStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  panel: {
    padding: 20,
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
  },
  mint: {
    backgroundColor: colors.mint,
    borderColor: "#C6E9D5",
  },
  pale: {
    backgroundColor: colors.pale,
    borderColor: "#D4E2FC",
  },
  rose: {
    backgroundColor: colors.rose,
    borderColor: "#FAD1D7",
  },
  bordered: {
    backgroundColor: colors.white,
    borderColor: colors.line,
  },
});
