import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";

export type Language = "en" | "hi" | "ta";

type PreferencesState = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const storage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const usePreferences = create<PreferencesState>()(persist((set) => ({
  language: "en",
  setLanguage: (language) => set({ language }),
}), { name: "saathi.preferences", storage: createJSONStorage(() => storage) }));
