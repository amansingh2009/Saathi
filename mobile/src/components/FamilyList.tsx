import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "@/theme/tokens";

export type FamilyMember = {
  id: string;
  user_id: string;
  role: "elderly" | "caregiver";
  status: string;
  profile?: {
    full_name?: string | null;
    phone?: string | null;
  } | null;
};

export function FamilyList({
  members,
  currentUserId,
}: {
  members: FamilyMember[];
  currentUserId?: string;
}) {
  return (
    <View style={styles.list}>
      {members.map((member) => {
        const isSelf = member.user_id === currentUserId;
        const isElderly = member.role === "elderly";
        const name = isSelf
          ? "You"
          : member.profile?.full_name || (isElderly ? "Family Member" : "Caregiver");
        const phone = member.profile?.phone;

        return (
          <View key={member.id} style={styles.memberCard}>
            <View
              style={[
                styles.avatarCircle,
                isElderly ? styles.avatarCircleBlue : styles.avatarCircleGreen,
              ]}
            >
              <Ionicons
                name={isElderly ? "person" : "people"}
                size={24}
                color={isElderly ? colors.blue : colors.green}
              />
            </View>

            <View style={styles.memberInfoCol}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{name}</Text>
                {isSelf ? (
                  <View style={styles.selfBadge}>
                    <Text style={styles.selfBadgeText}>You</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.role}>
                {isElderly ? "Elderly User" : "Family Caregiver"}
              </Text>
              {phone ? <Text style={styles.phoneText}>{phone}</Text> : null}
            </View>

            {phone && !isSelf ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Call ${name}`}
                onPress={() =>
                  void Linking.openURL(`tel:${phone.replace(/[^+\d]/g, "")}`)
                }
                style={styles.callCircleBtn}
              >
                <Ionicons name="call" size={20} color={colors.white} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
    marginVertical: 6,
  },
  memberCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCircleBlue: {
    backgroundColor: colors.pale,
  },
  avatarCircleGreen: {
    backgroundColor: colors.mint,
  },
  memberInfoCol: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontFamily: "Inter_700Bold",
    color: colors.ink,
    fontSize: 18,
  },
  selfBadge: {
    backgroundColor: colors.pale,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  selfBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: colors.blue,
  },
  role: {
    fontFamily: "Inter_500Medium",
    color: colors.muted,
    fontSize: 14,
  },
  phoneText: {
    fontFamily: "Inter_400Regular",
    color: colors.muted,
    fontSize: 13,
  },
  callCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
});
