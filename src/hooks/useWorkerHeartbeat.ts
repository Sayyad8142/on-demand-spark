import { useEffect, useRef } from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { sendWorkerHeartbeat } from "@/lib/workerHeartbeat";

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes — analytics-only ping

/**
 * Global worker heartbeat — runs whenever the worker is logged in,
 * regardless of online/offline status. Fires on:
 *  - mount (cold start / login)
 *  - foreground resume (native + web)
 *  - every 2 minutes while app is open
 *
 * The backend uses these beats to compute notification_health and to know
 * which workers are reachable for booking dispatch.
 */
export function useWorkerHeartbeat(workerIdOrUserId: string | undefined | null) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedOnceRef = useRef(false);

  useEffect(() => {
    if (!workerIdOrUserId) return;

    // First beat — treated as "open" on cold start, "login" if mounted later.
    const reason = firedOnceRef.current ? "login" : "open";
    firedOnceRef.current = true;
    sendWorkerHeartbeat(workerIdOrUserId, reason);

    intervalRef.current = setInterval(() => {
      sendWorkerHeartbeat(workerIdOrUserId, "interval");
    }, INTERVAL_MS);

    // Web visibility resume
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        sendWorkerHeartbeat(workerIdOrUserId, "foreground");
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    // Native foreground resume
    // The listener handle arrives asynchronously; if the effect was already
    // cleaned up by then, remove it immediately so it never leaks.
    let nativeSub: { remove: () => Promise<void> | void } | null = null;
    let disposed = false;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) sendWorkerHeartbeat(workerIdOrUserId, "foreground");
      })
        .then((sub) => {
          if (disposed) void sub.remove();
          else nativeSub = sub;
        })
        .catch(() => { /* listener unavailable — interval + visibility still run */ });
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisible);
      disposed = true;
      if (nativeSub) void nativeSub.remove();
      nativeSub = null;
    };
  }, [workerIdOrUserId]);
}
