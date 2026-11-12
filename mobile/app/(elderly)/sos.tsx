import { useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Panel } from "@/components/Panel";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { colors } from "@/theme/tokens";
import type { FamilyMember } from "@/components/FamilyList";

type Result = { event: { id:string; status:string; created_at:string }; notification_delivery:{status:string;sent:number} };
type EmergencyEvent={id:string;status:"open"|"acknowledged"|"resolved";created_at:string;acknowledged_at?:string|null;acknowledged_by?:string|null;resolved_at?:string|null};
export default function SOS() {
  const router=useRouter(); const family=useFamilyContext(); const [sending,setSending]=useState(false); const [result,setResult]=useState<Result|null>(null); const [error,setError]=useState(false);
  const event=useQuery({queryKey:["emergency-event",result?.event.id],enabled:!!result,queryFn:()=>api<EmergencyEvent>(`/emergency/${result?.event.id}`),refetchInterval:result?3000:false});
  const members=useQuery({queryKey:["members",family.data?.family.id],enabled:!!result&&!!family.data?.family.id,queryFn:()=>api<FamilyMember[]>(`/families/${family.data?.family.id}/members`)});
  async function send() {
    if(!family.data?.family.id) return; setSending(true); setError(false);
    try { const data=await api<Result>("/emergency",{method:"POST",body:JSON.stringify({family_id:family.data.family.id,message:"A family member requested help."})}); setResult(data); }
    catch { setError(true); }
    finally { setSending(false); }
  }
  return <Screen><Heading title={result?"Help request sent":"Do you need help?"} subtitle="If you are in immediate danger, call your local emergency number too." />
    {result ? <Panel><Text style={styles.title}>{["sent","partially_sent"].includes(result.notification_delivery.status)?"Emergency alert recorded":"Alert recorded · notification not sent"}</Text><Text style={styles.body}>Notification status: {result.notification_delivery.status.replaceAll("_"," ")}.</Text><Text style={styles.body}>Alert status: {event.data?.status??"open"} · {new Date(result.event.created_at).toLocaleString()}</Text>{event.data?.acknowledged_at?<Text style={styles.body}>Caregiver acknowledged{members.data?.find(m=>m.user_id===event.data?.acknowledged_by)?.profile?.full_name?` · ${members.data.find(m=>m.user_id===event.data?.acknowledged_by)?.profile?.full_name}`:""} · {new Date(event.data.acknowledged_at).toLocaleString()}</Text>:null}{event.data?.status==="resolved"&&event.data.resolved_at?<Text style={styles.body}>Caregiver marked this request resolved · {new Date(event.data.resolved_at).toLocaleString()}</Text>:null}{event.data?.status==="open"?<Text style={styles.body}>No caregiver has acknowledged yet. If you need urgent help, call your local emergency number.</Text>:null}{event.error?<Text accessibilityRole="alert" style={styles.error}>The latest alert status could not be refreshed.</Text>:null}<ActionButton variant="secondary" onPress={()=>router.back()}>Done</ActionButton></Panel> : <Panel><Text style={styles.body}>Tap below only if you want to create an emergency alert for your connected caregivers. Delivery depends on the family's notification setup.</Text>{error?<Text accessibilityRole="alert" style={styles.error}>We couldn’t connect. Please try again or call your local emergency number.</Text>:null}<ActionButton variant="danger" loading={sending} onPress={()=>Alert.alert("Send emergency alert?","Saathi will create an alert record. Notification delivery depends on your family's setup.",[{text:"Cancel",style:"cancel"},{text:"Send alert",style:"destructive",onPress:()=>void send()}])}>Send SOS alert</ActionButton><ActionButton variant="secondary" onPress={()=>router.back()}>Cancel</ActionButton></Panel>}
  </Screen>;
}
const styles=StyleSheet.create({title:{fontFamily:"Inter_700Bold",fontSize:22,color:colors.ink},body:{fontFamily:"Inter_400Regular",fontSize:18,lineHeight:27,color:colors.muted},error:{fontFamily:"Inter_600SemiBold",fontSize:17,lineHeight:24,color:colors.red}});
