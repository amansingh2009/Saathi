import { useRouter } from "expo-router";
import { StyleSheet, Text, View, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";

export default function ConnectionError() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <Screen>
      <View style={styles.container}>
        {/* Offline Illustration */}
        <View style={styles.iconCircle}>
          <Ionicons name="cloud-offline" size={56} color={colors.red} />
        </View>

        {/* Content */}
        <View style={styles.textCol}>
          <Text style={styles.title}>We couldn’t connect</Text>
          <Text style={styles.subtitle}>
            Please check your Wi-Fi or mobile data connection and try again. Your account information and schedules are safe.
          </Text>
        </View>

        {/* Primary Retry Button */}
        <View style={styles.buttonWrap}>
          <ActionButton onPress={() => router.replace("/")}>
            {t("retry")}
          </ActionButton>
        </View>

        {/* Emergency Assistance Offline Fallback Card */}
        <View style={styles.emergencyCard}>
          <View style={styles.emergencyHeader}>
            <Ionicons name="call" size={20} color={colors.red} />
            <Text style={styles.emergencyTitle}>Need urgent assistance?</Text>
          </View>
          <Text style={styles.emergencySubtitle}>
            Emergency phone calls work without internet connectivity.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => Linking.openURL("tel:112")}
            style={styles.callButton}
          >
            <Ionicons name="call" size={18} color={colors.white} />
            <Text style={styles.callButtonText}>Call 112 National Emergency</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 20,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.rose,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  textCol: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: colors.ink,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 24,
  },
  buttonWrap: {
    width: "100%",
    marginTop: 8,
  },
  emergencyCard: {
    width: "100%",
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 10,
    marginTop: 16,
  },
  emergencyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emergencyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.ink,
  },
  emergencySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.red,
    paddingVertical: 14,
    borderRadius: radii.control,
    marginTop: 6,
  },
  callButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.white,
  },
});
