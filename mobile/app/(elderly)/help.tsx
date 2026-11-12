import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "@/components/ActionButton";
import { LoadingState } from "@/components/LoadingState";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors, radii } from "@/theme/tokens";
import { screenCapture, screenCaptureEvents } from "@/services/screenCapture";
import { supabase } from "@/services/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import * as Notifications from "expo-notifications";
import { useI18n } from "@/hooks/useI18n";

type Session={id:string;status:string;reason?:string|null;created_at:string;caregiver_user_id:string};
export default function PhoneHelp(){
  const router = useRouter();
  const { t } = useI18n();
  const family=useFamilyContext(); const id=family.data?.family.id; const client=useQueryClient(); const [busy,setBusy]=useState<string|null>(null);
  const channel=useRef<RealtimeChannel|null>(null); const capturing=useRef<string|null>(null);
  const frameSub=useRef<{remove():void}|null>(null); const stopSub=useRef<{remove():void}|null>(null);
  const sessions=useQuery({queryKey:["guidance",id],enabled:!!id,queryFn:()=>api<Session[]>(`/guidance/sessions?family_id=${id}`),refetchInterval:5000});
  async function decide(session:Session,action:"consent"|"decline"){
    setBusy(session.id); try { await api(`/guidance/sessions/${session.id}/${action}`,{method:"POST"}); await client.invalidateQueries({queryKey:["guidance",id]}); }
    catch { Alert.alert("Couldn’t update request","Check your connection and try again."); } finally { setBusy(null); }
  }
  async function start(session:Session){
    setBusy(session.id); try {
      const nativeCapture=screenCapture;
      if(!nativeCapture||!screenCaptureEvents) throw new Error("Screen sharing is available in the Android Saathi build only.");
      const permission=await Notifications.getPermissionsAsync();
      const notificationPermission=permission.granted?permission:await Notifications.requestPermissionsAsync();
      if(!notificationPermission.granted) throw new Error("Allow Saathi notifications so Android can show the screen-sharing stop control.");
      await api(`/guidance/sessions/${session.id}/start`,{method:"POST"});
      const room=supabase.channel(`guidance:${session.id}`,{config:{private:true}});
      room.on("postgres_changes",{event:"UPDATE",schema:"public",table:"screen_sessions",filter:`id=eq.${session.id}`},(change)=>{
        if(change.new.status==="ended"||change.new.status==="declined"){
          capturing.current=null;void nativeCapture.stop();frameSub.current?.remove();frameSub.current=null;stopSub.current?.remove();stopSub.current=null;
          void client.invalidateQueries({queryKey:["guidance",id]});
        }
      });
      await new Promise<void>((resolve,reject)=>{room.subscribe((status)=>{if(status==="SUBSCRIBED")resolve();if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")reject(new Error("Private guidance channel unavailable."));});});
      channel.current=room; capturing.current=session.id;
      frameSub.current=screenCaptureEvents.addListener("onScreenCaptureFrame",(event:{jpegBase64:string})=>{
        if(capturing.current!==session.id||!event.jpegBase64)return;
        void room.send({type:"broadcast",event:"frame",payload:{jpegBase64:event.jpegBase64}});
      });
      stopSub.current=screenCaptureEvents.addListener("onScreenCaptureStopped",()=>{
        capturing.current=null; frameSub.current?.remove();frameSub.current=null;stopSub.current?.remove();stopSub.current=null;
        void api(`/guidance/sessions/${session.id}/end`,{method:"POST"}); void client.invalidateQueries({queryKey:["guidance",id]});
      });
      const approved=await nativeCapture.requestAndStart();
      if(!approved){frameSub.current?.remove();frameSub.current=null;stopSub.current?.remove();stopSub.current=null;await supabase.removeChannel(room);channel.current=null;capturing.current=null;await api(`/guidance/sessions/${session.id}/end`,{method:"POST"});throw new Error("Screen sharing permission was not granted.");}
      await client.invalidateQueries({queryKey:["guidance",id]});
    }
    catch { Alert.alert("Couldn’t start guidance","Please try again."); } finally {setBusy(null);}
  }
  async function stop(session:Session){
    setBusy(session.id); try { capturing.current=null; if(screenCapture) await screenCapture.stop();frameSub.current?.remove();frameSub.current=null;stopSub.current?.remove();stopSub.current=null;if(channel.current) await supabase.removeChannel(channel.current);channel.current=null; await api(`/guidance/sessions/${session.id}/end`,{method:"POST"}); await client.invalidateQueries({queryKey:["guidance",id]}); } catch {Alert.alert("Couldn’t stop session","Stop screen sharing from the Saathi notification if it is active.");} finally {setBusy(null);}
  }
  useEffect(()=>()=>{capturing.current=null;if(channel.current)void supabase.removeChannel(channel.current);},[]);
  if(family.isLoading||sessions.isLoading)return <Screen><LoadingState/></Screen>;
  if(family.error||sessions.error)return <Screen><ProblemState message="Phone-help requests couldn’t load." retry={()=>void sessions.refetch()}/></Screen>;
  const pending=sessions.data?.filter(s=>s.status==="requested")??[]; const live=sessions.data?.filter(s=>["consented","active"].includes(s.status))??[];
  return (
    <Screen>
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

      <View style={styles.header}>
        <Text style={styles.title}>{t("smartphoneHelp")}</Text>
        <Text style={styles.subtitle}>
          {t("smartphoneHelpSub")}
        </Text>
      </View>

      {/* Safety Notice Card */}
      <View style={styles.safetyBox}>
        <Ionicons name="shield-checkmark" size={22} color={colors.blue} />
        <Text style={styles.safetyText}>
          {t("viewOnlyNotice")}
        </Text>
      </View>

      {/* Pending Requests */}
      {pending.map((s) => (
        <View key={s.id} style={styles.requestCard}>
          <View style={styles.requestHeaderRow}>
            <View style={styles.iconCircleBlue}>
              <Ionicons name="phone-portrait" size={24} color={colors.blue} />
            </View>
            <View style={styles.requestTextCol}>
              <Text style={styles.requestTitle}>{t("guidanceRequested")}</Text>
              <Text style={styles.requestReason}>
                {s.reason || t("guidanceOfferSub")}
              </Text>
            </View>
          </View>
          <ActionButton
            loading={busy === s.id}
            onPress={() => void decide(s, "consent")}
          >
            {t("allowRequest")}
          </ActionButton>
          <ActionButton
            variant="secondary"
            disabled={busy === s.id}
            onPress={() => void decide(s, "decline")}
          >
            {t("notNow")}
          </ActionButton>
        </View>
      ))}

      {/* Active / Consented Sessions */}
      {live.map((s) => (
        <View key={s.id} style={styles.liveCard}>
          <View style={styles.liveHeaderRow}>
            <View style={styles.livePulseDot} />
            <Text style={styles.liveTitle}>
              {s.status === "active" ? t("sessionActive") : t("sessionAccepted")}
            </Text>
          </View>
          <Text style={styles.liveDescription}>
            {s.status === "active"
              ? t("caregiverGuidingDesc")
              : t("consentGivenDesc")}
          </Text>
          {s.status === "consented" ? (
            <ActionButton
              loading={busy === s.id}
              onPress={() => void start(s)}
            >
              {t("beginScreenSharing")}
            </ActionButton>
          ) : null}
          <ActionButton
            variant="danger"
            loading={busy === s.id}
            onPress={() => void stop(s)}
          >
            {t("stopGuidance")}
          </ActionButton>
        </View>
      ))}

      {!pending.length && !live.length ? (
        <View style={styles.emptyCard}>
          <View style={styles.phoneIconCircle}>
            <Ionicons name="phone-portrait-outline" size={32} color={colors.blue} />
          </View>
          <Text style={styles.emptyTitle}>{t("readyWhenYouNeed")}</Text>
          <Text style={styles.emptySubtitle}>
            {t("guidanceOfferSub")}
          </Text>
        </View>
      ) : null}
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
    lineHeight: 26,
    color: colors.muted,
  },
  safetyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.pale,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: "#D4E2FC",
    padding: 16,
    marginVertical: 8,
  },
  safetyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    lineHeight: 22,
    color: colors.blue,
    flex: 1,
  },
  requestCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 14,
    marginVertical: 8,
  },
  requestHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  iconCircleBlue: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  requestTextCol: {
    flex: 1,
    gap: 4,
  },
  requestTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    color: colors.ink,
  },
  requestReason: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
  },
  liveCard: {
    backgroundColor: colors.mint,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: "#C6E9D5",
    padding: 20,
    gap: 14,
    marginVertical: 8,
  },
  liveHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  livePulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.green,
  },
  liveTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    color: "#286A46",
  },
  liveDescription: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: "#286A46",
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radii.cardMin,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: "center",
    gap: 12,
    marginVertical: 12,
  },
  phoneIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: colors.ink,
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
    textAlign: "center",
  },
});
