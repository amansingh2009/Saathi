import { useRouter } from "expo-router";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Screen } from "@/components/Screen";

export default function ConnectionError() {
  const router = useRouter();
  return <Screen><Heading title="We couldn’t connect" subtitle="Check your internet connection and try again. Your account information is still safe." /><ActionButton onPress={() => router.replace("/")}>Try again</ActionButton></Screen>;
}
