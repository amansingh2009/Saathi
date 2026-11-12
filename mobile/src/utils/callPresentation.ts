export type ConnectionState = "connected" | "none" | "pending_sent" | "pending_received" | "blocked";

export function formatCallDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function canInitiateCall(connectionStatus: ConnectionState): boolean {
  return connectionStatus === "connected";
}
