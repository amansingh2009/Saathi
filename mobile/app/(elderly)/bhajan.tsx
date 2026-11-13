import { useEffect, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Screen } from "@/components/Screen";
import { colors, radii } from "@/theme/tokens";
import { useI18n } from "@/hooks/useI18n";

export type BhajanTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  type: string;
  url: string;
};

const customUrl = process.env.EXPO_PUBLIC_BHAJAN_URL?.trim();
const customTitle = process.env.EXPO_PUBLIC_BHAJAN_TITLE?.trim();
const customArtist = process.env.EXPO_PUBLIC_BHAJAN_ARTIST?.trim();

export const BHAJAN_PLAYLIST: BhajanTrack[] = [
  {
    id: "1",
    title: customTitle || "Gayatri Mantra",
    artist: customArtist || "Peaceful Morning Chants",
    duration: "15 mins",
    type: "Sacred Chant",
    url: customUrl && /^https:\/\//i.test(customUrl)
      ? customUrl
      : "https://ia800201.us.archive.org/21/items/GayatriMantra_201602/Gayatri%20Mantra.mp3",
  },
  {
    id: "2",
    title: "Hanuman Chalisa",
    artist: "Hari Om Sharan",
    duration: "12 mins",
    type: "Devotional Prayer",
    url: "https://ia800300.us.archive.org/34/items/ShreeHanumanChalisa_886/01ShreeHanumanChalisa.mp3",
  },
  {
    id: "3",
    title: "Maha Mrityunjaya Mantra",
    artist: "Sacred Chants of Shiva",
    duration: "20 mins",
    type: "Healing Chant",
    url: "https://ia800303.us.archive.org/16/items/MahaMrityunjayaMantra108Times/Maha%20Mrityunjaya%20Mantra%20108%20times.mp3",
  },
  {
    id: "4",
    title: "Om Chanting & Meditation",
    artist: "Divine Resonance",
    duration: "10 mins",
    type: "Morning Meditation",
    url: "https://ia800205.us.archive.org/18/items/OmChantingMeditation_201607/Om%20Chanting.mp3",
  },
];

function formatTime(seconds: number) {
  const whole = Math.floor(seconds || 0);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export default function Bhajan() {
  const router = useRouter();
  const { t } = useI18n();
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  const currentTrack = BHAJAN_PLAYLIST[currentTrackIndex] || BHAJAN_PLAYLIST[0];
  const player = useAudioPlayer(currentTrack.url);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        /* ignore */
      }
    };
  }, [player]);

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

      {/* Main Devotional Player Card (Figma Frames 14 & 15: Playing / Paused) */}
      <View style={styles.playerCard}>
        <View style={styles.artBox}>
          <Ionicons
            name={status.playing ? "musical-notes" : "musical-note"}
            size={56}
            color={colors.blue}
          />
        </View>

        <Text style={styles.trackTitle}>{currentTrack.title}</Text>
        <Text style={styles.trackArtist}>{currentTrack.artist}</Text>

        {/* Progress bar */}
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

        {/* Playback Controls with Prev / Play-Pause / Next */}
        <View style={styles.controlsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous track"
            disabled={currentTrackIndex === 0}
            onPress={() => {
              if (currentTrackIndex > 0) {
                setCurrentTrackIndex(currentTrackIndex - 1);
              }
            }}
            style={[
              styles.skipButton,
              currentTrackIndex === 0 && styles.skipButtonDisabled,
            ]}
          >
            <Ionicons
              name="play-skip-back"
              size={26}
              color={currentTrackIndex === 0 ? colors.line : colors.ink}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={status.playing ? "Pause bhajan" : "Play bhajan"}
            onPress={() => (status.playing ? player.pause() : player.play())}
            style={({ pressed }) => [
              styles.bigPlayButton,
              pressed && styles.pressedState,
            ]}
          >
            <Ionicons
              name={status.playing ? "pause" : "play"}
              size={36}
              color={colors.white}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next track"
            disabled={currentTrackIndex === BHAJAN_PLAYLIST.length - 1}
            onPress={() => {
              if (currentTrackIndex < BHAJAN_PLAYLIST.length - 1) {
                setCurrentTrackIndex(currentTrackIndex + 1);
              }
            }}
            style={[
              styles.skipButton,
              currentTrackIndex === BHAJAN_PLAYLIST.length - 1 && styles.skipButtonDisabled,
            ]}
          >
            <Ionicons
              name="play-skip-forward"
              size={26}
              color={
                currentTrackIndex === BHAJAN_PLAYLIST.length - 1
                  ? colors.line
                  : colors.ink
              }
            />
          </Pressable>
        </View>
      </View>

      {/* Bhajan Library List (Figma Frame 13) */}
      <View style={styles.playlistSection}>
        <Text style={styles.playlistHeader}>{t("bhajanLibrary")}</Text>
        <View style={styles.playlistItems}>
          {BHAJAN_PLAYLIST.map((item, index) => {
            const isCurrent = currentTrackIndex === index;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Play ${item.title}`}
                onPress={() => {
                  setCurrentTrackIndex(index);
                }}
                style={[
                  styles.playlistCard,
                  isCurrent && styles.playlistCardSelected,
                ]}
              >
                <View
                  style={[
                    styles.playlistIconCircle,
                    isCurrent && styles.playlistIconCircleActive,
                  ]}
                >
                  <Ionicons
                    name={isCurrent && status.playing ? "volume-high" : "musical-note"}
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
                  name={isCurrent ? "radio-button-on" : "chevron-forward"}
                  size={22}
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
    marginVertical: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
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
  },
  artBox: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
    backgroundColor: colors.pale,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 8,
  },
  progress: {
    height: "100%",
    backgroundColor: colors.blue,
  },
  timeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.muted,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    marginTop: 8,
  },
  skipButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  skipButtonDisabled: {
    opacity: 0.4,
  },
  bigPlayButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  playlistSection: {
    marginTop: 16,
    marginBottom: 24,
    gap: 12,
  },
  playlistHeader: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
  },
  playlistItems: {
    gap: 10,
  },
  playlistCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 14,
  },
  playlistCardSelected: {
    borderColor: colors.blue,
    backgroundColor: "#F4F7FE",
  },
  playlistIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistIconCircleActive: {
    backgroundColor: colors.pale,
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
    fontSize: 14,
    color: colors.muted,
  },
  pressedState: {
    transform: [{ scale: 0.95 }],
  },
});
