import { useEffect, useState } from "react";
import { Alert, Image, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { LoadingState } from "@/components/LoadingState";
import { Panel } from "@/components/Panel";
import { ProblemState } from "@/components/ProblemState";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { supabase } from "@/services/supabase";
import { colors } from "@/theme/tokens";

type Session={id:string;status:string;reason?:string|null;created_at:string};
export default function GuidanceMonitor(){
  const family=useFamilyContext();const id=family.data?.family.id;const [frame,setFrame]=useState<string|null>(null);const [question,setQuestion]=useState("What should I tap next?");const [guidance,setGuidance]=useState("");const [analyzing,setAnalyzing]=useState(false);
  const sessions=useQuery({queryKey:["guidance",id],enabled:!!id,queryFn:()=>api<Session[]>(`/guidance/sessions?family_id=${id}`),refetchInterval:3000});
  const active=sessions.data?.find(s=>s.status==="active");
  useEffect(()=>{
    setFrame(null);if(!active)return;
    const channel=supabase.channel(`guidance:${active.id}`,{config:{private:true}}).on("broadcast",{event:"frame"},({payload})=>{if(typeof payload?.jpegBase64==="string")setFrame(payload.jpegBase64);}).subscribe();
    return ()=>{void supabase.removeChannel(channel);};
  },[active?.id]);
  async function askSaathi(){
    if(!active||!frame)return;
    setAnalyzing(true);setGuidance("");
    try{const result=await api<{guidance:string}>("/ai/guidance-image",{method:"POST",body:JSON.stringify({session_id:active.id,image_base64:frame,question})});setGuidance(result.guidance);}
    catch{Alert.alert("Couldn’t get guidance","The frame was not analyzed. Check the connection or Gemini setup and try again.");}
    finally{setAnalyzing(false);}
  }
  if(family.isLoading||sessions.isLoading)return <Screen><LoadingState/></Screen>;
  if(family.error||sessions.error)return <Screen><ProblemState message="Guidance status couldn’t load." retry={()=>void sessions.refetch()}/></Screen>;
  return <Screen><Heading title="Phone guidance" subtitle="Screen sharing only starts after the family member accepts the request and Android permission prompt."/>
    {active?<Panel><Text style={styles.body}>Session active · {active.reason||"Family support"}</Text>{frame?<Image accessibilityLabel="Live screen shared by your family member" source={{uri:`data:image/jpeg;base64,${frame}`}} style={styles.frame} resizeMode="contain"/>:<View style={styles.placeholder}><Text style={styles.body}>Waiting for the next screen image…</Text></View>}<Text style={styles.note}>Your family member controls their phone. Saathi does not provide remote taps or control.</Text>
      <Text style={styles.note}>Ask Saathi sends this screen image to Gemini for a one step suggestion. Do this only when the screen contains no private codes or financial details.</Text>
      <TextInput accessibilityLabel="Question about the shared screen" value={question} onChangeText={setQuestion} maxLength={300} style={styles.input} placeholder="What would you like help with?" />
      <ActionButton disabled={!frame||question.trim().length<3} loading={analyzing} onPress={()=>Alert.alert("Send this screen for guidance?","Saathi will send the latest shared image and your question to Gemini. Continue only if the screen has no private codes or financial information.",[{text:"Cancel",style:"cancel"},{text:"Send image",onPress:()=>void askSaathi()}])}>Ask Saathi about this screen</ActionButton>
      {guidance?<View accessibilityLiveRegion="polite"><Text style={styles.body}>Suggested next step</Text><Text style={styles.note}>{guidance}</Text></View>:null}
      <ActionButton variant="danger" onPress={()=>void api(`/guidance/sessions/${active.id}/end`,{method:"POST"}).then(()=>sessions.refetch())}>End guidance</ActionButton></Panel>:null}
    {sessions.data?.filter(s=>s.status==="requested").map(s=><Panel key={s.id}><Text style={styles.body}>Waiting for family member consent · {s.reason||"Phone help"}</Text></Panel>)}
    {!active&&!sessions.data?.some(s=>s.status==="requested")?<Panel><Text style={styles.body}>No active guidance session.</Text></Panel>:null}
  </Screen>;
}
const styles=StyleSheet.create({body:{fontFamily:"Inter_500Medium",fontSize:18,lineHeight:26,color:colors.ink},note:{fontFamily:"Inter_400Regular",fontSize:15,lineHeight:22,color:colors.muted},input:{minHeight:64,borderColor:colors.line,borderWidth:1,borderRadius:16,padding:16,fontFamily:"Inter_400Regular",fontSize:18,color:colors.ink},frame:{height:480,width:"100%",backgroundColor:"#10141d",borderRadius:18},placeholder:{height:260,alignItems:"center",justifyContent:"center"}});
