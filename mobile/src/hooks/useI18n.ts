import { usePreferences } from "@/store/preferences";
import { t, type TranslationKey } from "@/constants/strings";

export function useI18n() {
  const language = usePreferences((state) => state.language);
  const setLanguage = usePreferences((state) => state.setLanguage);

  return {
    language,
    setLanguage,
    t: (key: TranslationKey, params?: Record<string, string | number>) =>
      t(language, key, params),
  };
}

