import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { Heading } from "@/components/Heading";
import { Screen } from "@/components/Screen";
import { supabase } from "@/services/supabase";
import { colors } from "@/theme/tokens";
import { usePreferences } from "@/store/preferences";
import { t } from "@/constants/strings";

const formSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
type FormValues = z.infer<typeof formSchema>;

export default function SignIn() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const language = usePreferences((state) => state.language);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { control, handleSubmit, getValues } = useForm<FormValues>({ defaultValues: { email: "", password: "" } });

  const submit = handleSubmit(async () => {
    const parsed = formSchema.safeParse(getValues());
    if (!parsed.success) { setMessage("Enter a valid email and a password with at least 8 characters."); return; }
    setBusy(true); setMessage("");
    try {
      if (creating) {
        const { data, error } = await supabase.auth.signUp({ email: parsed.data.email.trim().toLowerCase(), password: parsed.data.password });
        if (error) throw error;
        if (!data.session) { setMessage("Check your email to confirm your account, then sign in."); setCreating(false); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email.trim().toLowerCase(), password: parsed.data.password });
        if (error) throw error;
      }
      if (params.role) router.replace({ pathname: "/(auth)/family-setup", params: { role: params.role } });
      else router.replace("/");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to sign in. Please try again."); }
    finally { setBusy(false); }
  });

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}><Screen>
    <Heading title={creating ? t(language, "signUp") : t(language, "signIn")} subtitle="Your account keeps your family information private." />
    <Text style={styles.label}>{t(language, "email")}</Text>
    <Controller control={control} name="email" render={({ field: { onChange, value } }) => <TextInput accessibilityLabel={t(language, "email")} autoCapitalize="none" keyboardType="email-address" value={value} onChangeText={onChange} style={styles.input} />} />
    <Text style={styles.label}>{t(language, "password")}</Text>
    <Controller control={control} name="password" render={({ field: { onChange, value } }) => <TextInput accessibilityLabel={t(language, "password")} secureTextEntry value={value} onChangeText={onChange} style={styles.input} />} />
    {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    <ActionButton onPress={() => void submit()} loading={busy}>{creating ? "Create account" : "Sign in"}</ActionButton>
    <ActionButton variant="secondary" onPress={() => { setCreating(!creating); setMessage(""); }}>{creating ? "I already have an account" : "Create a new account"}</ActionButton>
    <ActionButton variant="quiet" onPress={() => router.back()}>{t(language, "back")}</ActionButton>
  </Screen></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ flex: { flex: 1 }, label: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: colors.muted }, input: { minHeight: 60, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 16, fontFamily: "Inter_400Regular", fontSize: 20, color: colors.ink }, message: { fontFamily: "Inter_500Medium", fontSize: 16, lineHeight: 24, color: colors.red } });
