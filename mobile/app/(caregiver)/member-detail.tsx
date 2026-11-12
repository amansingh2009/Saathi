import { useEffect, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Panel } from "@/components/Panel";
import { Screen } from "@/components/Screen";
import { useI18n } from "@/hooks/useI18n";
import { resolveAvatarUrl } from "@/services/avatarStorage";
import { colors, radii } from "@/theme/tokens";

export default function MemberDetail() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{
    memberId?: string;
    userId?: string;
    name?: string;
    role?: string;
    phone?: string;
    avatarUrl?: string;
  }>();

  const name = params.name || "Family Member";
  const role = params.role || "elderly";
  const isElderly = role === "elderly";
  const phone = params.phone;
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    if (params.avatarUrl) {
      resolveAvatarUrl(params.avatarUrl).then(setAvatarUri);
    }
  }, [params.avatarUrl]);

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("back")}
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={24} color={colors.ink} />
        <Text style={styles.backText}>{t("back")}</Text>
      </Pressable>

      <View style={styles.profileHeader}>
        <View style={[styles.avatarContainer, isElderly ? styles.avatarBlue : styles.avatarGreen]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <Ionicons
              name={isElderly ? "person" : "people"}
              size={56}
              color={isElderly ? colors.blue : colors.green}
            />
          )}
        </View>

        <Text style={styles.nameText}>{name}</Text>
        <View style={[styles.roleBadge, isElderly ? styles.roleBadgeBlue : styles.roleBadgeGreen]}>
          <Text style={[styles.roleBadgeText, isElderly ? styles.roleTextBlue : styles.roleTextGreen]}>
            {isElderly ? t("elderly") : t("caregiver")}
          </Text>
        </View>
      </View>

      {/* Contact Information */}
      <Panel>
        <Text style={styles.sectionTitle}>Contact Details</Text>

        <View style={styles.infoRow}>
          <Ionicons name="call-outline" size={20} color={colors.muted} />
          <Text style={styles.infoLabel}>Phone:</Text>
          <Text style={styles.infoValue}>{phone || "Not provided"}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.muted} />
          <Text style={styles.infoLabel}>Status:</Text>
          <Text style={[styles.infoValue, { color: colors.green }]}>Active Member</Text>
        </View>
      </Panel>

      {/* Actions */}
      <View style={styles.actionSection}>
        {phone ? (
          <ActionButton
            onPress={() => {
              void Linking.openURL(`tel:${phone}`);
            }}
          >
            {`Call ${phone}`}
          </ActionButton>
        ) : null}

        {phone ? (
          <ActionButton
            variant="secondary"
            onPress={() => {
              void Linking.openURL(`sms:${phone}`);
            }}
          >
            {"Send SMS"}
          </ActionButton>
        ) : null}

        {isElderly ? (
          <ActionButton
            variant="secondary"
            onPress={() => {
              router.push("/(elderly)/connect");
            }}
          >
            {t("seniorConnectCallsBanner")}
          </ActionButton>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 8,
  },
  backText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: colors.ink,
  },
  profileHeader: {
    alignItems: "center",
    marginVertical: 20,
    gap: 8,
  },
  avatarContainer: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.line,
    overflow: "hidden",
  },
  avatarBlue: {
    backgroundColor: colors.pale,
  },
  avatarGreen: {
    backgroundColor: colors.mint,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  nameText: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: colors.ink,
  },
  roleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.control,
  },
  roleBadgeBlue: {
    backgroundColor: colors.pale,
  },
  roleBadgeGreen: {
    backgroundColor: colors.mint,
  },
  roleBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  roleTextBlue: {
    color: colors.blue,
  },
  roleTextGreen: {
    color: colors.green,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: colors.ink,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  infoLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.muted,
  },
  infoValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.ink,
    flex: 1,
  },
  actionSection: {
    gap: 12,
    marginTop: 8,
  },
});
