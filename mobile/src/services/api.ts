import { supabase } from "@/services/supabase";
import Constants from "expo-constants";
import { Platform } from "react-native";

export function getBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const host = window.location.hostname || "localhost";
    return `${window.location.protocol}//${host}:8765/api/v1`;
  }
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  // If running in Expo Go or dev client on a physical device, detect host IP from Metro connection:
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })?.manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      // If the configured URL is missing or points to the emulator loopback (10.0.2.2) or localhost:
      if (!envUrl || envUrl.includes("10.0.2.2") || envUrl.includes("localhost") || envUrl.includes("127.0.0.1")) {
        return `http://${host}:8765/api/v1`;
      }
    }
  }
  return envUrl || "http://192.168.113.88:8765/api/v1";
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = getBaseUrl();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Please sign in to continue.", 401);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl}${normalizedPath}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new Error(`Connection error to ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    if (response.status === 401) {
      try {
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (!error && refreshed.session?.access_token) {
          response = await fetch(url, {
            ...init,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${refreshed.session.access_token}`,
              ...init.headers,
            },
          });
          if (response.ok) {
            if (response.status === 204) return undefined as T;
            return response.json() as Promise<T>;
          }
        }
      } catch {
        /* refresh failed */
      }
    }

    let message = "Something went wrong. Please try again.";
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = body.detail[0].msg;
    } catch { /* use the safe default message */ }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
