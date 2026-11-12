import { useEffect } from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { supabase } from "@/services/supabase";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });

export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(() => queryClient.invalidateQueries());
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const response = Notifications.addNotificationResponseReceivedListener((notification) => {
      if (notification.notification.request.content.data?.event_id) router.push("/(caregiver)/(tabs)/alerts");
    });
    return () => response.remove();
  }, [router]);
  if (!fontsLoaded) return null;
  return <QueryClientProvider client={queryClient}><Stack screenOptions={{ headerShown: false, animation: "fade" }} /></QueryClientProvider>;
}
