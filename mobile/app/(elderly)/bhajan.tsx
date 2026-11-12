import { useEffect, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { ActionButton } from "@/components/ActionButton";
import { Screen } from "@/components/Screen";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";

const audioUrl = process.env.EXPO_PUBLIC_BHAJAN_URL?.trim();
const defaultTrackTitle = process.env.EXPO_PUBLIC_BHAJAN_TITLE?.trim() || "Gayatri Mantra";
const defaultArtist = process.env.EXPO_PUBLIC_BHAJAN_ARTIST?.trim() || "Peaceful Morning Chants";
const licensedSource = audioUrl && /^https:\/\//i.test(audioUrl) ? audioUrl : null;

const BHAJAN_PLAYLIST = [
  { id: "1", title: "Gayatri Mantra", duration: "15 mins", type: "Sacred Chant" },
  { id: "2", title: "Om Jai Jagdish Hare", duration: "8 mins", type: "Morning Aarti" },
  { id: "3", title: "Hanuman Chalisa", duration: "12 mins", type: "Devotional" },
  { id: "4", title: "Achutam Keshavam", duration: "6 mins", type: "Krishna Bhajan" },
];

function formatTime(seconds: number) {
  const whole = Math.floor(seconds || 0);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export default function Bhajan() {
  const router = useRouter();
  const { t } = useI18n();
  const player = useAudioPlayer(licensedSource);
  const status = useAudioPlayerStatus(player);

  const [selectedTrack, setSelectedTrack] = useState(defaultTrackTitle);

  useEffect(() => () => player.pause(), [player]);

  return (
    <Screen>
      {/* Top Bar with Back Button */}
      <View style={styles.topNav}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backRow}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
          <Text style={styles.backLabel}>{t("home")}</Text>
        </Pressable>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("devotionalMusic")}</Text>
        <Text style={styles.subtitle}>{t("bhajanSubtitle")}</Text>
      </View>

      {/* Main Devotional Player Card */}
      <View style={styles.playerCard}>
        <View style={styles.artBox}>
          <Ionicons name="musical-notes" size={64} color={colors.blue} />
        </View>

        <Text style={styles.trackTitle}>{selectedTrack}</Text>
        <Text style={styles.trackArtist}>{defaultArtist}</Text>

        {licensedSource ? (
          <>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Bhajan playback progress"
              accessibilityValue={{
                min: 0,
                max: status.duration || 0,
                now: status.currentTime || 0,
              }}
              style={styles.track}
            >
              <View
                style={[
                  styles.progress,
                  {
                    width: `${
                      status.duration
                        ? Math.min(100, (status.currentTime / status.duration) * 100)
                        : 0
                    }%`,
                  },
                ]}
              />
            </View>

            <Text style={styles.timeText}>
              {formatTime(status.currentTime)} / {formatTime(status.duration)}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => (status.playing ? player.pause() : player.play())}
              style={({ pressed }) => [
                styles.bigPlayButton,
                pressed && styles.pressedState,
              ]}
            >
              <Ionicons
                name={status.playing ? "pause" : "play"}
                size={34}
                color={colors.white}
              />
            </Pressable>
          </>
        ) : (
          <View style={styles.demoPlayerBox}>
            <Pressable
              accessibilityRole="button"
              onPress={() => alert("Ready to play. Connect your licensed audio feed in settings.")}
              style={styles.bigPlayButton}
            >
              <Ionicons name="play" size={34} color={colors.white} />
            </Pressable>
            <Text style={styles.demoNote}>
              {t("pressPlayListen")}
            </Text>
          </View>
        )}
      </View>

      {/* Bhajan Library List (Figma Frame 13) */}
      <View style={styles.playlistSection}>
        <Text style={styles.playlistHeader}>{t("bhajanLibrary")}</Text>
        <View style={styles.playlistItems}>
          {BHAJAN_PLAYLIST.map((item) => {
            const isCurrent = selectedTrack === item.title;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => setSelectedTrack(item.title)}
                style={[
                  styles.playlistCard,
                  isCurrent && styles.playlistCardSelected,
                ]}
              >
                <View style={styles.playlistIconCircle}>
                  <Ionicons
                    name={isCurrent ? "volume-medium" : "musical-note"}
                    size={20}
                    color={isCurrent ? colors.blue : colors.muted}
                  />
                </View>
                <View style={styles.playlistInfoCol}>
                  <Text
                    style={[
                      styles.playlistItemTitle,
                      isCurrent && styles.playlistItemTitleActive,
                    ]}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.playlistItemMeta}>
                    {item.type} • {item.duration}
                  </Text>
                </View>
                <Ionicons
                  name={isCurrent ? "play-circle" : "chevron-forward"}
                  size={24}
                  color={isCurrent ? colors.blue : colors.muted}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topNav: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  backLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: colors.ink,
  },
  header: {
    gap: 4,
    marginVertical: 10,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    color: colors.muted,
  },
  playerCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: "center",
    gap: 12,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  artBox: {
    width: 140,
    height: 140,
    borderRadius: 24,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  trackTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: colors.ink,
    textAlign: "center",
  },
  trackArtist: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
  },
  track: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.line,
    overflow: "hidden",
    marginTop: 8,
  },
  progress: {
    height: 8,
    backgroundColor: colors.blue,
  },
  timeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.muted,
  },
  bigPlayButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  demoPlayerBox: {
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  demoNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
  playlistSection: {
    gap: 12,
    marginTop: 14,
    marginBottom: 20,
  },
  playlistHeader: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    color: colors.ink,
  },
  playlistItems: {
    gap: 10,
  },
  playlistCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  playlistCardSelected: {
    backgroundColor: colors.pale,
    borderColor: "#D4E2FC",
  },
  playlistIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistInfoCol: {
    flex: 1,
    gap: 2,
  },
  playlistItemTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: colors.ink,
  },
  playlistItemTitleActive: {
    color: colors.blue,
  },
  playlistItemMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.muted,
  },
  pressedState: {
    transform: [{ scale: 0.96 }],
  },
});
