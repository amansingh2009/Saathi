import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Heading } from "@/components/Heading";
import { Panel } from "@/components/Panel";
import { ActionButton } from "@/components/ActionButton";
import { LoadingState } from "@/components/LoadingState";
import { colors, radii, touchTargets } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";
import {
  discoverSeniors,
  listConnections,
  sendConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  blockUser,
  reportUser,
  updateSeniorProfile,
  initiateCall,
  joinInstantRoom,
  SeniorProfile,
  SeniorConnection,
} from "@/services/calls";
import { api } from "@/services/api";
import { canInitiateCall } from "@/utils/callPresentation";

const PRESET_INTERESTS = [
  "Bhajan & Music",
  "Gardening",
  "Walking & Yoga",
  "Cooking",
  "Reading & Stories",
  "Current Affairs",
  "Spiritual Talks",
  "Board Games",
];

export default function SeniorConnectScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"friends" | "requests" | "discover" | "profile">("friends");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [friends, setFriends] = useState<SeniorConnection[]>([]);
  const [pendingReceived, setPendingReceived] = useState<SeniorConnection[]>([]);
  const [pendingSent, setPendingSent] = useState<SeniorConnection[]>([]);
  const [discoverList, setDiscoverList] = useState<SeniorProfile[]>([]);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [callingPeerId, setCallingPeerId] = useState<string | null>(null);

  // Instant room conference state
  const [instantRoomInput, setInstantRoomInput] = useState("");
  const [joiningInstant, setJoiningInstant] = useState(false);

  // Profile edit state
  const [myBio, setMyBio] = useState("");
  const [myInterests, setMyInterests] = useState<string[]>([]);
  const [isDiscoverable, setIsDiscoverable] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [connectionsData, discoveredData, myProfile] = await Promise.all([
        listConnections().catch(() => ({ connected: [], pending_sent: [], pending_received: [] })),
        discoverSeniors(searchQuery || undefined).catch(() => []),
        api<any>("/profiles/me").catch(() => null),
      ]);

      setFriends(connectionsData.connected || []);
      setPendingReceived(connectionsData.pending_received || []);
      setPendingSent(connectionsData.pending_sent || []);
      setDiscoverList(discoveredData || []);

      if (myProfile) {
        setMyBio(myProfile.bio || "");
        setMyInterests(Array.isArray(myProfile.interests) ? myProfile.interests : []);
        setIsDiscoverable(myProfile.is_discoverable ?? true);
      }
    } catch (err) {
      console.warn("Failed to load Senior Connect data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Call Initiation Handler
  const handleStartCall = async (peer: { id: string; name: string }, callType: "audio" | "video") => {
    setCallingPeerId(peer.id);
    try {
      const response = await initiateCall(peer.id, callType);
      setCallingPeerId(null);

      router.push({
        pathname: "/(elderly)/call",
        params: {
          callId: response.call.id,
          roomName: response.room_name,
          token: response.token,
          livekitUrl: response.livekit_url,
          callType,
          peerName: peer.name,
          role: "caller",
        },
      });
    } catch (err: any) {
      setCallingPeerId(null);
      Alert.alert(
        "Call Notice",
        err.message || "Could not initiate call. Please make sure you are mutually connected."
      );
    }
  };

  const handleJoinInstantRoom = async (callType: "audio" | "video" = "video") => {
    setJoiningInstant(true);
    try {
      const room = instantRoomInput.trim() || undefined;
      const res = await joinInstantRoom(room, callType);
      setJoiningInstant(false);
      router.push({
        pathname: "/(elderly)/call",
        params: {
          callId: "instant",
          roomName: res.room_name,
          token: res.token,
          livekitUrl: res.livekit_url,
          callType,
          peerName: room ? `Room: ${res.room_name}` : "Instant Conference",
          role: "caller",
        },
      });
    } catch (err: any) {
      setJoiningInstant(false);
      Alert.alert("Error", err.message || "Failed to start instant conference.");
    }
  };

  // Connection Request Handlers
  const handleSendRequest = async (targetId: string) => {
    try {
      await sendConnectionRequest(targetId);
      Alert.alert("Request Sent", "Your connection request has been sent!");
      loadData();
    } catch (err: any) {
      Alert.alert("Notice", err.message || "Failed to send connection request.");
    }
  };

  const handleAcceptRequest = async (connId: string) => {
    try {
      await acceptConnectionRequest(connId);
      Alert.alert("Connected!", "You are now connected and can call each other.");
      loadData();
    } catch (err: any) {
      Alert.alert("Notice", err.message || "Failed to accept request.");
    }
  };

  const handleRejectRequest = async (connId: string) => {
    try {
      await rejectConnectionRequest(connId);
      loadData();
    } catch (err: any) {
      Alert.alert("Notice", err.message || "Failed to decline request.");
    }
  };

  const handleBlock = (targetId: string, name: string) => {
    Alert.alert(
      "Block Senior",
      `Are you sure you want to block ${name}? They will no longer be able to find or call you.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await blockUser(targetId);
              Alert.alert("Blocked", `${name} has been blocked.`);
              loadData();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Could not block user.");
            }
          },
        },
      ]
    );
  };

  const handleReport = (targetId: string, name: string) => {
    Alert.prompt
      ? Alert.prompt(
          "Report User",
          `Please provide a reason for reporting ${name}:`,
          async (reason) => {
            if (reason?.trim()) {
              try {
                await reportUser(targetId, reason);
                Alert.alert("Report Submitted", `${name} has been reported and blocked.`);
                loadData();
              } catch (err: any) {
                Alert.alert("Error", err.message || "Could not submit report.");
              }
            }
          }
        )
      : Alert.alert(
          "Report User",
          `Would you like to report and block ${name} for inappropriate behavior?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Report & Block",
              style: "destructive",
              onPress: async () => {
                try {
                  await reportUser(targetId, "Inappropriate behavior reported by user");
                  Alert.alert("Report Submitted", `${name} has been reported and blocked.`);
                  loadData();
                } catch (err: any) {
                  Alert.alert("Error", err.message || "Could not submit report.");
                }
              },
            },
          ]
        );
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateSeniorProfile({
        bio: myBio.trim(),
        interests: myInterests,
        is_discoverable: isDiscoverable,
      });
      Alert.alert("Saved", "Your profile preferences have been updated.");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Could not save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleInterest = (interest: string) => {
    if (myInterests.includes(interest)) {
      setMyInterests(myInterests.filter((i) => i !== interest));
    } else {
      setMyInterests([...myInterests, interest]);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState label="Loading Senior Connect..." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
          <Text style={styles.backButtonText}>{t("back")}</Text>
        </Pressable>
      </View>

      <Heading
        title={t("seniorConnect")}
        subtitle="Connect and call with fellow older adults safely."
      />

      {/* Quick Instant Conference Call Card */}
      <Panel>
        <Text style={styles.sectionTitle}>🎥 {t("instantCallConference")}</Text>
        <Text style={styles.helperText}>
          {t("instantCallSub")}
        </Text>
        <View style={styles.instantRow}>
          <TextInput
            style={[styles.searchInput, styles.instantInput]}
            placeholder={t("roomNamePlaceholder")}
            placeholderTextColor={colors.muted}
            value={instantRoomInput}
            onChangeText={setInstantRoomInput}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.callButtonsRow}>
          <Pressable
            accessibilityRole="button"
            style={[styles.callBtn, styles.audioCallBtn]}
            onPress={() => handleJoinInstantRoom("audio")}
            disabled={joiningInstant}
          >
            {joiningInstant ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.callBtnText}>📞 {t("audioCall")}</Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            style={[styles.callBtn, styles.videoCallBtn]}
            onPress={() => handleJoinInstantRoom("video")}
            disabled={joiningInstant}
          >
            {joiningInstant ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.callBtnText}>📹 {t("videoCall")}</Text>
            )}
          </Pressable>
        </View>
      </Panel>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "friends" }}
          accessibilityLabel={t("friendsTab", { count: friends.length })}
          style={[styles.tabButton, activeTab === "friends" && styles.activeTabButton]}
          onPress={() => setActiveTab("friends")}
        >
          <Text style={[styles.tabText, activeTab === "friends" && styles.activeTabText]}>
            {t("friendsTab", { count: friends.length })}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "requests" }}
          accessibilityLabel={t("requestsTab", { count: pendingReceived.length })}
          style={[styles.tabButton, activeTab === "requests" && styles.activeTabButton]}
          onPress={() => setActiveTab("requests")}
        >
          <Text style={[styles.tabText, activeTab === "requests" && styles.activeTabText]}>
            {t("requestsTab", { count: pendingReceived.length })}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "discover" }}
          accessibilityLabel={t("discoverTab")}
          style={[styles.tabButton, activeTab === "discover" && styles.activeTabButton]}
          onPress={() => setActiveTab("discover")}
        >
          <Text style={[styles.tabText, activeTab === "discover" && styles.activeTabText]}>
            {t("discoverTab")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "profile" }}
          accessibilityLabel={t("myProfileTab")}
          style={[styles.tabButton, activeTab === "profile" && styles.activeTabButton]}
          onPress={() => setActiveTab("profile")}
        >
          <Text style={[styles.tabText, activeTab === "profile" && styles.activeTabText]}>
            {t("myProfileTab")}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.contentScroll} showsVerticalScrollIndicator={false}>
        {/* ================= TAB 1: FRIENDS ================= */}
        {activeTab === "friends" && (
          <View style={styles.section}>
            {friends.length === 0 ? (
              <Panel>
                <Text style={styles.emptyTitle}>No Friends Added Yet</Text>
                <Text style={styles.emptyBody}>
                  Find friendly seniors in the "Find Friends" tab to connect and talk!
                </Text>
                <ActionButton onPress={() => setActiveTab("discover")}>
                  Discover Seniors
                </ActionButton>
              </Panel>
            ) : (
              friends.map((item) => (
                <Panel key={item.id}>
                  <View style={styles.friendHeader}>
                    <View style={styles.avatarMini}>
                      <Text style={styles.avatarMiniText}>
                        {item.peer_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{item.peer_name}</Text>
                      {item.peer_bio ? (
                        <Text style={styles.friendBio} numberOfLines={2}>
                          {item.peer_bio}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {item.peer_interests?.length > 0 && (
                    <View style={styles.tagsContainer}>
                      {item.peer_interests.map((tag, idx) => (
                        <View key={idx} style={styles.tagPill}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Calling Actions */}
                  <View style={styles.callButtonsRow}>
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.callBtn, styles.audioCallBtn]}
                      onPress={() =>
                        handleStartCall({ id: item.peer_id, name: item.peer_name }, "audio")
                      }
                      disabled={callingPeerId === item.peer_id}
                    >
                      {callingPeerId === item.peer_id ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.callBtnText}>📞 Audio Call</Text>
                      )}
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      style={[styles.callBtn, styles.videoCallBtn]}
                      onPress={() =>
                        handleStartCall({ id: item.peer_id, name: item.peer_name }, "video")
                      }
                      disabled={callingPeerId === item.peer_id}
                    >
                      {callingPeerId === item.peer_id ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.callBtnText}>📹 Video Call</Text>
                      )}
                    </Pressable>
                  </View>

                  {/* Safety Options */}
                  <View style={styles.safetyRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Block ${item.peer_name}`}
                      onPress={() => handleBlock(item.peer_id, item.peer_name)}
                      style={styles.safetyLink}
                    >
                      <Text style={styles.safetyText}>Block</Text>
                    </Pressable>
                    <Text style={styles.safetyDivider}>•</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Report ${item.peer_name}`}
                      onPress={() => handleReport(item.peer_id, item.peer_name)}
                      style={styles.safetyLink}
                    >
                      <Text style={[styles.safetyText, { color: colors.red }]}>Report</Text>
                    </Pressable>
                  </View>
                </Panel>
              ))
            )}
          </View>
        )}

        {/* ================= TAB 2: REQUESTS ================= */}
        {activeTab === "requests" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Incoming Requests</Text>
            {pendingReceived.length === 0 ? (
              <Panel>
                <Text style={styles.emptyBody}>No incoming connection requests right now.</Text>
              </Panel>
            ) : (
              pendingReceived.map((req) => (
                <Panel key={req.id}>
                  <View style={styles.friendHeader}>
                    <View style={styles.avatarMini}>
                      <Text style={styles.avatarMiniText}>
                        {req.peer_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{req.peer_name}</Text>
                      <Text style={styles.friendBio}>Wants to connect with you.</Text>
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Accept request from ${req.peer_name}`}
                      style={[styles.actionBtn, { backgroundColor: colors.green }]}
                      onPress={() => handleAcceptRequest(req.id)}
                    >
                      <Text style={styles.actionBtnText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Decline request from ${req.peer_name}`}
                      style={[styles.actionBtn, { backgroundColor: colors.muted }]}
                      onPress={() => handleRejectRequest(req.id)}
                    >
                      <Text style={styles.actionBtnText}>Decline</Text>
                    </Pressable>
                  </View>
                </Panel>
              ))
            )}

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Sent Requests</Text>
            {pendingSent.length === 0 ? (
              <Panel>
                <Text style={styles.emptyBody}>No pending requests sent.</Text>
              </Panel>
            ) : (
              pendingSent.map((req) => (
                <Panel key={req.id}>
                  <Text style={styles.friendName}>{req.peer_name}</Text>
                  <Text style={styles.friendBio}>Waiting for them to accept.</Text>
                </Panel>
              ))
            )}
          </View>
        )}

        {/* ================= TAB 3: DISCOVER ================= */}
        {activeTab === "discover" && (
          <View style={styles.section}>
            <View style={styles.searchBox}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name or interest (e.g. Yoga, Bhajan)..."
                placeholderTextColor={colors.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {discoverList.length === 0 ? (
              <Panel>
                <Text style={styles.emptyTitle}>No Seniors Found</Text>
                <Text style={styles.emptyBody}>
                  Try clearing your search query or check back later!
                </Text>
              </Panel>
            ) : (
              discoverList.map((senior) => (
                <Panel key={senior.id}>
                  <View style={styles.friendHeader}>
                    <View style={styles.avatarMini}>
                      <Text style={styles.avatarMiniText}>
                        {senior.full_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{senior.full_name}</Text>
                      {senior.bio ? (
                        <Text style={styles.friendBio}>{senior.bio}</Text>
                      ) : null}
                    </View>
                  </View>

                  {senior.interests?.length > 0 && (
                    <View style={styles.tagsContainer}>
                      {senior.interests.map((tag, idx) => (
                        <View key={idx} style={styles.tagPill}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={{ marginTop: 16 }}>
                    {canInitiateCall(senior.connection_status) ? (
                      <Text style={styles.statusBadge}>✓ Connected Friend</Text>
                    ) : senior.connection_status === "pending_sent" ? (
                      <Text style={styles.statusBadge}>⏳ Request Sent</Text>
                    ) : senior.connection_status === "pending_received" ? (
                      <Pressable
                        style={[styles.actionBtn, { backgroundColor: colors.green }]}
                        onPress={() => senior.connection_id && handleAcceptRequest(senior.connection_id)}
                      >
                        <Text style={styles.actionBtnText}>Accept Request</Text>
                      </Pressable>
                    ) : (
                      <ActionButton onPress={() => handleSendRequest(senior.id)}>
                        Send Connect Request
                      </ActionButton>
                    )}
                  </View>
                </Panel>
              ))
            )}
          </View>
        )}

        {/* ================= TAB 4: MY PROFILE ================= */}
        {activeTab === "profile" && (
          <View style={styles.section}>
            <Panel>
              <Text style={styles.sectionTitle}>Senior Profile & Discovery</Text>
              <Text style={styles.helperText}>
                Let other friendly seniors discover your hobbies and interests.
              </Text>

              {/* Discoverability toggle */}
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: isDiscoverable }}
                accessibilityLabel="Allow others to discover me"
                style={styles.toggleRow}
                onPress={() => setIsDiscoverable(!isDiscoverable)}
              >
                <Text style={styles.toggleLabel}>Allow others to discover me</Text>
                <View
                  style={[
                    styles.toggleSwitch,
                    { backgroundColor: isDiscoverable ? colors.green : colors.line },
                  ]}
                >
                  <Text style={styles.toggleSwitchText}>{isDiscoverable ? "YES" : "NO"}</Text>
                </View>
              </Pressable>

              {/* Bio */}
              <Text style={[styles.inputLabel, { marginTop: 16 }]}>Short Bio / About Me</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="A few words about you, your daily routine, or what you enjoy talking about..."
                placeholderTextColor={colors.muted}
                value={myBio}
                onChangeText={setMyBio}
              />

              {/* Interests checklist */}
              <Text style={[styles.inputLabel, { marginTop: 20 }]}>Select Your Interests</Text>
              <View style={styles.interestGrid}>
                {PRESET_INTERESTS.map((item) => {
                  const selected = myInterests.includes(item);
                  return (
                    <Pressable
                      key={item}
                      style={[
                        styles.interestChip,
                        selected && styles.interestChipSelected,
                      ]}
                      onPress={() => toggleInterest(item)}
                    >
                      <Text
                        style={[
                          styles.interestChipText,
                          selected && styles.interestChipTextSelected,
                        ]}
                      >
                        {selected ? `✓ ${item}` : `+ ${item}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ marginTop: 24 }}>
                <ActionButton loading={savingProfile} onPress={handleSaveProfile}>
                  Save Profile Settings
                </ActionButton>
              </View>
            </Panel>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    marginBottom: 12,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignSelf: "flex-start",
  },
  backButtonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.ink,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: colors.white,
    borderRadius: radii.control,
    padding: 4,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  activeTabButton: {
    backgroundColor: colors.pale,
  },
  tabText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: colors.muted,
  },
  activeTabText: {
    color: colors.blue,
  },
  contentScroll: {
    paddingBottom: 40,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
    marginBottom: 8,
  },
  helperText: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
    textAlign: "center",
    marginBottom: 8,
  },
  emptyBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 17,
    lineHeight: 24,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 16,
  },
  friendHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
  },
  avatarMini: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.pale,
    borderWidth: 2,
    borderColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMiniText: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: colors.blue,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
  },
  friendBio: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 2,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 10,
  },
  tagPill: {
    backgroundColor: colors.mint,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.ink,
  },
  callButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  callBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  audioCallBtn: {
    backgroundColor: colors.green,
  },
  videoCallBtn: {
    backgroundColor: colors.blue,
  },
  callBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.white,
  },
  safetyRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  safetyLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  safetyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.muted,
  },
  safetyDivider: {
    color: colors.muted,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    minHeight: touchTargets.primaryHeight,
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: colors.white,
  },
  searchBox: {
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.ink,
  },
  statusBadge: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.green,
    textAlign: "center",
    paddingVertical: 10,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  toggleLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.ink,
  },
  toggleSwitch: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  toggleSwitchText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: colors.white,
  },
  inputLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.ink,
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.control,
    padding: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.ink,
    minHeight: 80,
    textAlignVertical: "top",
  },
  instantRow: {
    marginBottom: 8,
  },
  instantInput: {
    marginBottom: 0,
  },
  interestGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  interestChip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  interestChipSelected: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  interestChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: colors.ink,
  },
  interestChipTextSelected: {
    color: colors.white,
  },
});

