import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { LoadingState } from "@/components/LoadingState";
import { Panel } from "@/components/Panel";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";
import { screenCapture, screenCaptureEvents } from "@/services/screenCapture";
import { supabase } from "@/services/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import * as Notifications from "expo-notifications";

type Session={id:string;status:string;reason?:string|null;created_at:string;caregiver_user_id:string};
export default function PhoneHelp(){
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
  return <Screen><Heading title="Help with my phone" subtitle="You decide whether your family can see your screen. You can stop sharing at any time."/>
    {pending.map(s=><Panel key={s.id}><Text style={styles.body}>{s.reason||"A caregiver would like to help you with your phone."}</Text><ActionButton loading={busy===s.id} onPress={()=>void decide(s,"consent")}>Allow request</ActionButton><ActionButton variant="secondary" onPress={()=>void decide(s,"decline")}>Not now</ActionButton></Panel>)}
    {live.map(s=><Panel key={s.id}><Text style={styles.body}>{s.status==="active"?"Guidance session is active.":"You agreed to the request. Tap to begin the Android screen-sharing permission flow."}</Text>{s.status==="consented"?<ActionButton loading={busy===s.id} onPress={()=>void start(s)}>Begin screen sharing</ActionButton>:null}<ActionButton variant="danger" loading={busy===s.id} onPress={()=>void stop(s)}>Stop guidance</ActionButton></Panel>)}
    {!pending.length&&!live.length?<Panel><Text style={styles.body}>No pending requests. Your caregivers can request a guidance session from their Saathi app.</Text></Panel>:null}
  </Screen>;
}
const styles=StyleSheet.create({body:{fontFamily:"Inter_400Regular",fontSize:18,lineHeight:27,color:colors.ink}});
