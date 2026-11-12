import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type ActiveFamilyState = { familyId: string | null; setFamilyId: (id: string) => void };
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
export const useActiveFamily = create<ActiveFamilyState>()(persist((set) => ({
  familyId: null,
  setFamilyId: (familyId) => set({ familyId }),
}), { name: "saathi.active-family", storage: createJSONStorage(() => storage) }));
