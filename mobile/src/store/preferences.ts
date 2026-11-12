import { Platform } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";

export type Language = "en" | "hi" | "ta";

type PreferencesState = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const storage = {
  getItem: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(typeof localStorage !== "undefined" ? localStorage.getItem(key) : null)
      : SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    Platform.OS === "web"
      ? Promise.resolve(typeof localStorage !== "undefined" ? localStorage.setItem(key, value) : undefined)
      : SecureStore.setItemAsync(key, value),
  removeItem: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(typeof localStorage !== "undefined" ? localStorage.removeItem(key) : undefined)
      : SecureStore.deleteItemAsync(key),
};

export const usePreferences = create<PreferencesState>()(persist((set) => ({
  language: "en",
  setLanguage: (language) => set({ language }),
}), { name: "saathi.preferences", storage: createJSONStorage(() => storage) }));
