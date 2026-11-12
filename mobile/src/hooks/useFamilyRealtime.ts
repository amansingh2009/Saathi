import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";

/** Subscribes with the signed-in Supabase session; Postgres changes still pass through RLS. */
export function useFamilyRealtime(familyId: string | undefined) {
  const client = useQueryClient();
  useEffect(() => {
    if (!familyId) return;
    const topic = `family:${familyId}:${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase.channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `family_id=eq.${familyId}` }, () => {
        void client.invalidateQueries({ queryKey: ["tasks", familyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "medication_logs", filter: `family_id=eq.${familyId}` }, () => {
        void client.invalidateQueries({ queryKey: ["medicines", familyId] });
        void client.invalidateQueries({ queryKey: ["medicine-history", familyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_events", filter: `family_id=eq.${familyId}` }, () => {
        void client.invalidateQueries({ queryKey: ["emergency", familyId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [client, familyId]);
}
