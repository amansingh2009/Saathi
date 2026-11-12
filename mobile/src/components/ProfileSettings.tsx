import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Screen } from "@/components/Screen";
import { useFamilyContext } from "@/hooks/useFamilyContext";
import { api } from "@/services/api";
import { supabase } from "@/services/supabase";
import { useActiveFamily } from "@/store/activeFamily";
import { usePreferences, type Language } from "@/store/preferences";
import { colors } from "@/theme/tokens";

export function ProfileSettings() {
  const router=useRouter();const family=useFamilyContext();const setFamily=useActiveFamily((s)=>s.setFamilyId);
  const [email,setEmail]=useState("");const language=usePreferences((s)=>s.language);const setLanguage=usePreferences((s)=>s.setLanguage);
  useEffect(()=>{void supabase.auth.getUser().then(({data})=>setEmail(data.user?.email??""));void api<{preferred_language?:Language}>("/profiles/me").then((profile)=>{if(profile.preferred_language)setLanguage(profile.preferred_language);}).catch(()=>undefined);},[setLanguage]);
  async function updateLanguage(next:Language){setLanguage(next);try{await api("/profiles/me",{method:"PATCH",body:JSON.stringify({preferred_language:next})});}catch{Alert.alert("Language not saved","Your choice is on this device. Please try again when you are online.");}}
  function selectFamily(familyId:string,role:"elderly"|"caregiver"){setFamily(familyId);router.replace(role==="elderly"?"/(elderly)/(tabs)":"/(caregiver)/(tabs)");}
  async function signOut(){await supabase.auth.signOut();router.replace("/(auth)/welcome");}
  return <Screen><Heading title="Your profile" subtitle={email}/><Text style={styles.heading}>Language</Text>
    {([{id:"en",label:"English"},{id:"hi",label:"हिन्दी"},{id:"ta",label:"தமிழ்"}] as {id:Language;label:string}[]).map((item)=><ActionButton key={item.id} variant={language===item.id?"primary":"secondary"} onPress={()=>void updateLanguage(item.id)}>{item.label}</ActionButton>)}
    <Text style={styles.heading}>Your families</Text>{family.data?.memberships.map((item)=><ActionButton key={item.family.id} variant={item.family.id===family.data?.family.id?"primary":"secondary"} onPress={()=>selectFamily(item.family.id,item.membership.role)}>{item.family.name} · {item.membership.role==="elderly"?"Family member":"Caregiver"}</ActionButton>)}
    <Text style={styles.body}>You decide when phone guidance can use screen sharing. You can stop a session at any time.</Text><ActionButton variant="quiet" onPress={()=>void signOut()}>Sign out</ActionButton>
  </Screen>;
}
const styles=StyleSheet.create({heading:{fontFamily:"Inter_600SemiBold",fontSize:20,color:colors.ink},body:{fontFamily:"Inter_400Regular",fontSize:18,lineHeight:26,color:colors.muted}});
