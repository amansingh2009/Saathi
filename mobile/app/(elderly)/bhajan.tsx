import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Panel } from "@/components/Panel";
import { Screen } from "@/components/Screen";
import { colors } from "@/theme/tokens";

const audioUrl = process.env.EXPO_PUBLIC_BHAJAN_URL?.trim();
const trackTitle = process.env.EXPO_PUBLIC_BHAJAN_TITLE?.trim() || "Morning Bhajan";
const artist = process.env.EXPO_PUBLIC_BHAJAN_ARTIST?.trim();
const licensedSource = audioUrl && /^https:\/\//i.test(audioUrl) ? audioUrl : null;
function time(seconds: number) { const whole = Math.floor(seconds || 0); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`; }

export default function Bhajan() {
  const player = useAudioPlayer(licensedSource);
  const status = useAudioPlayerStatus(player);
  useEffect(() => () => player.pause(), [player]);
  return <Screen>
    <Heading title="Bhajan" subtitle="A peaceful moment for you." />
    {licensedSource ? <Panel>
      <View style={styles.art}><Text style={styles.music}>♪</Text></View>
      <Text style={styles.title}>{trackTitle}</Text>
      {artist ? <Text style={styles.body}>{artist}</Text> : null}
      <View accessibilityRole="progressbar" accessibilityLabel="Bhajan playback progress" accessibilityValue={{ min: 0, max: status.duration || 0, now: status.currentTime || 0 }} style={styles.track}><View style={[styles.progress, { width: `${status.duration ? Math.min(100, status.currentTime / status.duration * 100) : 0}%` }]} /></View>
      <Text style={styles.time}>{time(status.currentTime)} / {time(status.duration)}</Text>
      <ActionButton loading={status.isBuffering} onPress={() => status.playing ? player.pause() : player.play()}>{status.playing ? "Pause bhajan" : "Play bhajan"}</ActionButton>
      <Text style={styles.note}>Audio is provided by your configured licensed source.</Text>
    </Panel> : <Panel>
      <Text style={styles.title}>Your devotional music</Text>
      <Text style={styles.body}>A licensed music source hasn’t been added yet. Once your family configures a track, you can play or pause it here.</Text>
      <Text style={styles.note}>Saathi does not include unlicensed recordings.</Text>
    </Panel>}
  </Screen>;
}

const styles = StyleSheet.create({ art: { height: 180, borderRadius: 20, backgroundColor: colors.pale, alignItems: "center", justifyContent: "center" }, music: { fontSize: 80, color: colors.blue }, title: { fontFamily: "Inter_600SemiBold", fontSize: 24, lineHeight: 32, color: colors.ink, textAlign: "center" }, body: { fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 27, color: colors.muted }, note: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: "center" }, track: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden" }, progress: { height: 8, backgroundColor: colors.blue }, time: { fontFamily: "Inter_500Medium", fontSize: 16, color: colors.muted, textAlign: "center" } });
