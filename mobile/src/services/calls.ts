import { api } from "./api";

export interface SeniorProfile {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  interests: string[];
  bio?: string | null;
  preferred_language: string;
  connection_status: "none" | "pending_sent" | "pending_received" | "connected";
  connection_id?: string | null;
}

export interface SeniorConnection {
  id: string;
  peer_id: string;
  peer_name: string;
  peer_avatar?: string | null;
  peer_interests: string[];
  peer_bio?: string | null;
  peer_language: string;
  status: "connected" | "pending_sent" | "pending_received";
  created_at: string;
  updated_at: string;
}

export interface ConnectionsListResponse {
  connected: SeniorConnection[];
  pending_sent: SeniorConnection[];
  pending_received: SeniorConnection[];
}

export interface CallRecord {
  id: string;
  caller_id: string;
  receiver_id: string;
  call_type: "audio" | "video";
  status: "ringing" | "accepted" | "rejected" | "missed" | "ended";
  room_name: string;
  created_at: string;
  answered_at?: string | null;
  ended_at?: string | null;
}

export interface CallInitiateResponse {
  call: CallRecord;
  token: string;
  room_name: string;
  livekit_url: string;
}

export interface CallTokenResponse {
  token: string;
  room_name: string;
  livekit_url: string;
  call_id: string;
}

export interface CallHistoryItem {
  id: string;
  peer_id: string;
  peer_name: string;
  peer_avatar?: string | null;
  call_type: "audio" | "video";
  direction: "incoming" | "outgoing";
  status: "ringing" | "accepted" | "rejected" | "missed" | "ended";
  created_at: string;
  answered_at?: string | null;
  ended_at?: string | null;
}

export async function discoverSeniors(query?: string, language?: string): Promise<SeniorProfile[]> {
  const params = new URLSearchParams();
  if (query) params.append("query", query);
  if (language) params.append("language", language);
  const qStr = params.toString() ? `?${params.toString()}` : "";
  return api<SeniorProfile[]>(`/connections/discover${qStr}`);
}

export async function listConnections(): Promise<ConnectionsListResponse> {
  return api<ConnectionsListResponse>("/connections");
}

export async function sendConnectionRequest(recipientId: string): Promise<any> {
  return api("/connections/requests", {
    method: "POST",
    body: JSON.stringify({ recipient_id: recipientId }),
  });
}

export async function acceptConnectionRequest(connectionId: string): Promise<any> {
  return api(`/connections/requests/${connectionId}/accept`, {
    method: "POST",
  });
}

export async function rejectConnectionRequest(connectionId: string): Promise<any> {
  return api(`/connections/requests/${connectionId}/reject`, {
    method: "POST",
  });
}

export async function blockUser(userId: string): Promise<any> {
  return api("/connections/block", {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function reportUser(userId: string, reason: string): Promise<any> {
  return api("/connections/report", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, reason }),
  });
}

export async function updateSeniorProfile(profile: {
  full_name?: string;
  bio?: string;
  avatar_url?: string;
  is_discoverable?: boolean;
  interests?: string[];
  preferred_language?: "en" | "hi" | "ta";
}): Promise<any> {
  return api("/connections/profile", {
    method: "PATCH",
    body: JSON.stringify(profile),
  });
}

export async function initiateCall(
  receiverId: string,
  callType: "audio" | "video"
): Promise<CallInitiateResponse> {
  return api<CallInitiateResponse>("/calls", {
    method: "POST",
    body: JSON.stringify({ receiver_id: receiverId, call_type: callType }),
  });
}

export async function acceptCall(callId: string): Promise<CallTokenResponse> {
  return api<CallTokenResponse>(`/calls/${callId}/accept`, {
    method: "POST",
  });
}

export async function rejectCall(callId: string): Promise<any> {
  return api(`/calls/${callId}/reject`, {
    method: "POST",
  });
}

export async function endCall(callId: string): Promise<any> {
  return api(`/calls/${callId}/end`, {
    method: "POST",
  });
}

export async function getCallToken(callId: string): Promise<CallTokenResponse> {
  return api<CallTokenResponse>(`/calls/${callId}/token`, {
    method: "POST",
  });
}

export async function getCallHistory(): Promise<CallHistoryItem[]> {
  return api<CallHistoryItem[]>("/calls/history");
}

export async function joinInstantRoom(
  roomName?: string,
  callType: "audio" | "video" = "video"
): Promise<{ room_name: string; token: string; livekit_url: string; call_type: "audio" | "video" }> {
  return api("/calls/instant", {
    method: "POST",
    body: JSON.stringify({ room_name: roomName, call_type: callType }),
  });
}

