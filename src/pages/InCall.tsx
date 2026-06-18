import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MicOff, Mic, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AgoraCall, isAgoraAvailable, stableUid } from "@/native/agoraCall";
import { toast } from "@/hooks/use-toast";

/**
 * In-call screen for accepted Agora voice calls.
 *
 *  - Fetches a fresh Agora token from edge function `agora-token`
 *  - Joins channel `booking_<bookingId>` as worker
 *  - Auto-disconnects after 10 minutes
 *  - Auto-disconnects if booking transitions to completed / cancelled
 */
const MAX_CALL_MS = 10 * 60 * 1000;

export default function InCall() {
  const { bookingId = "" } = useParams();
  const [search] = useSearchParams();
  const customerName = search.get("customer") || "Customer";
  const navigate = useNavigate();
  const { session } = useAuth();

  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState("Connecting...");
  const endedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // Connect
  useEffect(() => {
    let cancelled = false;
    const channel = `booking_${bookingId}`;
    const uid = stableUid(session?.user?.id || bookingId);

    (async () => {
      if (!bookingId) {
        toast({ title: "Missing booking id", variant: "destructive" });
        navigate(-1);
        return;
      }
      if (!isAgoraAvailable()) {
        setStatus("Voice calls require the mobile app");
        return;
      }
      try {
        setStatus("Requesting token...");
        const { data, error } = await supabase.functions.invoke("agora-token", {
          body: { channel, role: "worker", uid },
        });
        if (error) throw error;
        const { token, appId } = (data || {}) as { token: string; appId: string };
        if (!appId) throw new Error("agora-token did not return appId");

        setStatus("Joining call...");
        await AgoraCall.init({ appId });
        await AgoraCall.join({ token: token || "", channel, uid });

        if (cancelled) {
          await AgoraCall.leave();
          return;
        }
        setConnected(true);
        setStatus("Connected");
      } catch (e: any) {
        console.error("[InCall] join failed", e);
        setStatus(`Call failed: ${e?.message || "unknown error"}`);
        toast({
          title: "Call failed",
          description: e?.message || "Could not connect",
          variant: "destructive",
        });
      }
    })();

    // Listeners
    const listeners: Array<{ remove: () => Promise<void> }> = [];
    if (isAgoraAvailable()) {
      AgoraCall.addListener("agora:remote-joined", () => setStatus("Connected"))
        .then((l) => listeners.push(l));
      AgoraCall.addListener("agora:remote-left", () => {
        setStatus("Customer ended call");
        endCall("remote-left");
      }).then((l) => listeners.push(l));
      AgoraCall.addListener("agora:error", (d: any) => {
        console.error("[InCall] agora error", d);
        setStatus(`Error ${d?.code ?? ""}`);
      }).then((l) => listeners.push(l));
    }

    return () => {
      cancelled = true;
      listeners.forEach((l) => l.remove().catch(() => {}));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // Call timer + 10-minute cap
  useEffect(() => {
    if (!connected) return;
    timerRef.current = window.setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next * 1000 >= MAX_CALL_MS) {
          endCall("max-duration");
        }
        return next;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [connected]);

  // Auto-disconnect if booking becomes completed/cancelled
  useEffect(() => {
    if (!bookingId) return;
    const ch = supabase
      .channel(`incall-${bookingId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        (payload: any) => {
          const newStatus = payload?.new?.status;
          if (newStatus === "completed" || newStatus === "cancelled") {
            setStatus(`Booking ${newStatus}`);
            endCall(`booking-${newStatus}`);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [bookingId]);

  const endCall = async (reason: string) => {
    if (endedRef.current) return;
    endedRef.current = true;
    console.log("[InCall] ending call reason=", reason);
    try {
      if (isAgoraAvailable()) await AgoraCall.leave();
    } catch (e) {
      console.warn("[InCall] leave error", e);
    }
    window.setTimeout(() => navigate("/home"), 600);
  };

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    try { await AgoraCall.setMuted({ muted: next }); } catch {}
  };

  const toggleSpeaker = async () => {
    const next = !speaker;
    setSpeaker(next);
    try { await AgoraCall.setSpeaker({ on: next }); } catch {}
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-between bg-slate-900 text-white p-6">
      <div className="pt-12 text-center">
        <p className="text-sm uppercase tracking-widest text-slate-400">Voice Call</p>
        <h1 className="mt-6 text-4xl font-bold">{customerName}</h1>
        <p className="mt-2 text-slate-300">Booking #{bookingId.slice(0, 8)}</p>
        <p className="mt-6 text-lg text-slate-200">
          {connected ? `${mm}:${ss}` : status}
        </p>
      </div>

      <div className="mx-auto mb-12 flex w-full max-w-sm items-center justify-around">
        <button
          onClick={toggleMute}
          className="flex flex-col items-center gap-2"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700">
            {muted ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
          </span>
          <span className="text-xs text-slate-300">{muted ? "Unmute" : "Mute"}</span>
        </button>

        <button
          onClick={() => endCall("user-ended")}
          className="flex flex-col items-center gap-2"
          aria-label="End call"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 shadow-lg active:scale-95 transition">
            <PhoneOff className="h-9 w-9" />
          </span>
          <span className="text-xs text-slate-300">End</span>
        </button>

        <button
          onClick={toggleSpeaker}
          className="flex flex-col items-center gap-2"
          aria-label={speaker ? "Speaker off" : "Speaker on"}
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700">
            {speaker ? <Volume2 className="h-7 w-7" /> : <VolumeX className="h-7 w-7" />}
          </span>
          <span className="text-xs text-slate-300">Speaker</span>
        </button>
      </div>
    </div>
  );
}
