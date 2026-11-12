import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "@/theme/tokens";

export function LoadingState({
  label = "Loading…",
  subtitle = "Getting your family updates ready…",
}: {
  label?: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.spinnerCircle}>
        <ActivityIndicator color={colors.blue} size="large" />
      </View>
      <Text style={styles.label}>{label}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  spinnerCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  label: {
    color: colors.ink,
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    textAlign: "center",
  },
  subtitle: {
    color: colors.muted,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
