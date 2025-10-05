import { messaging } from "@/lib/firebase";
import { getToken, onMessage, isSupported } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";

// TODO: Replace with your actual VAPID key from Firebase Console > Project Settings > Cloud Messaging
const VAPID_KEY = "YOUR_VAPID_KEY_HERE";

export async function registerWebPush(userId: string) {
  try {
    // Check if messaging is supported
    const supported = await isSupported();
    if (!supported) {
      console.log("Firebase messaging not supported in this browser");
      return;
    }

    // Check if service workers are supported
    if (!("serviceWorker" in navigator)) {
      console.log("Service workers not supported");
      return;
    }

    // Register service worker
    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    
    // Request notification permission
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    
    if (Notification.permission !== "granted") {
      console.log("Notification permission not granted");
      return;
    }

    // Wait for service worker to be ready
    const swr = await navigator.serviceWorker.ready;
    
    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swr,
    });
    
    if (!token) {
      console.log("No FCM token received");
      return;
    }

    console.log("FCM token received:", token.substring(0, 20) + "...");

    // Save token to database
    await supabase
      .from("fcm_tokens")
      .upsert({ user_id: userId, token })
      .throwOnError();

    console.log("FCM token saved to database");

    // Listen for foreground messages
    onMessage(messaging, (payload) => {
      console.log("Foreground message received:", payload);
      const id = payload?.data?.bookingId || payload?.data?.booking_id;
      if (id) {
        window.postMessage({ type: "BOOKING_ALERT", bookingId: id }, "*");
      }
    });
  } catch (error) {
    console.error("Error registering web push:", error);
  }
}
