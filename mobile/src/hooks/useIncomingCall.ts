import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/services/supabase";
import { acceptCall, rejectCall } from "@/services/calls";

export interface IncomingCallInfo {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string | null;
  callType: "audio" | "video";
  roomName: string;
}

export function useIncomingCall() {
  const router = useRouter();
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const currentCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentCallIdRef.current = incomingCall?.callId ?? null;
  }, [incomingCall]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isMounted = true;

    async function initListener() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted) return;

      const userId = user.id;
      const topic = `user_calls_${userId}_${Math.random().toString(36).substring(2, 9)}`;

      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "calls",
            filter: `receiver_id=eq.${userId}`,
          },
          async (payload: any) => {
            const record = payload.new;
            if (!record) return;

            if (record.status === "ringing") {
              // Fetch caller name
              let callerName = "A Senior Friend";
              let callerAvatar: string | null = null;

              try {
                const { data } = await supabase
                  .from("profiles")
                  .select("full_name, avatar_url")
                  .eq("id", record.caller_id)
                  .maybeSingle();

                if (data?.full_name) {
                  callerName = data.full_name;
                }
                callerAvatar = data?.avatar_url ?? null;
              } catch (err) {
                console.warn("Could not fetch caller profile:", err);
              }

              if (isMounted) {
                setIncomingCall({
                  callId: record.id,
                  callerId: record.caller_id,
                  callerName,
                  callerAvatar,
                  callType: record.call_type || "video",
                  roomName: record.room_name,
                });
              }
            } else if (
              ["missed", "rejected", "ended"].includes(record.status) &&
              currentCallIdRef.current === record.id
            ) {
              if (isMounted) {
                setIncomingCall(null);
                setIsAnswering(false);
              }
            }
          }
        )
        .subscribe();
    }

    initListener();

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const accept = useCallback(async () => {
    if (!incomingCall || isAnswering) return;
    setIsAnswering(true);
    try {
      const result = await acceptCall(incomingCall.callId);
      const callData = incomingCall;
      setIncomingCall(null);
      setIsAnswering(false);

      router.push({
        pathname: "/(elderly)/call",
        params: {
          callId: callData.callId,
          roomName: result.room_name,
          token: result.token,
          livekitUrl: result.livekit_url,
          callType: callData.callType,
          peerName: callData.callerName,
          role: "receiver",
        },
      });
    } catch (err) {
      console.error("Failed to accept call:", err);
      setIsAnswering(false);
      setIncomingCall(null);
    }
  }, [incomingCall, isAnswering, router]);

  const decline = useCallback(async () => {
    if (!incomingCall) return;
    const callId = incomingCall.callId;
    setIncomingCall(null);
    setIsAnswering(false);
    try {
      await rejectCall(callId);
    } catch (err) {
      console.warn("Error rejecting call:", err);
    }
  }, [incomingCall]);

  return {
    incomingCall,
    isAnswering,
    accept,
    decline,
  };
}

