import { Stack } from "expo-router";
import { IncomingCallModal } from "@/components/IncomingCallModal";

export default function CaregiverLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <IncomingCallModal />
    </>
  );
}

