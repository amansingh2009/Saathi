import type { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors } from "@/theme/tokens";

type Variant = "primary" | "secondary" | "danger" | "quiet";
export function ActionButton({ children, onPress, variant = "primary", disabled, loading }: PropsWithChildren<{
  onPress?: () => void; variant?: Variant; disabled?: boolean; loading?: boolean;
}>) {
  const backgroundColor = variant === "primary" ? colors.blue : variant === "danger" ? colors.red : variant === "secondary" ? colors.pale : colors.white;
  const color = variant === "primary" || variant === "danger" ? colors.white : colors.blue;
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading}
    style={({ pressed }) => [styles.button, { backgroundColor, opacity: disabled ? 0.55 : 1 }, pressed && styles.pressed]}>
    {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.label, { color }]}>{children}</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 64, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 20, lineHeight: 28, textAlign: "center" },
  pressed: { transform: [{ scale: 0.99 }] },
});
