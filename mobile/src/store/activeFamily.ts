import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type ActiveFamilyState = { familyId: string | null; setFamilyId: (id: string) => void };
const storage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};
export const useActiveFamily = create<ActiveFamilyState>()(persist((set) => ({
  familyId: null,
  setFamilyId: (familyId) => set({ familyId }),
}), { name: "saathi.active-family", storage: createJSONStorage(() => storage) }));
