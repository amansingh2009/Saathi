import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type PersistedChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: number;
};

type ChatHistoryState = {
  messages: PersistedChatMessage[];
  addMessage: (message: { role: "user" | "model"; content: string; id?: string }) => void;
  setMessages: (messages: PersistedChatMessage[]) => void;
  clearHistory: () => void;
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

export const useChatHistory = create<ChatHistoryState>()(
  persist(
    (set) => ({
      messages: [],
      addMessage: (msg) =>
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: msg.id || `${Date.now()}-${msg.role}`,
              role: msg.role,
              content: msg.content,
              timestamp: Date.now(),
            },
          ].slice(-50),
        })),
      setMessages: (messages) => set({ messages: messages.slice(-50) }),
      clearHistory: () => set({ messages: [] }),
    }),
    {
      name: "saathi.chat-history",
      storage: createJSONStorage(() => storage),
    }
  )
);

