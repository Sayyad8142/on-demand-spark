import { supabase } from "@/integrations/supabase/client";
import { ONESIGNAL_APP_ID } from "@/lib/onesignal";

declare global {
  interface Window {
    OneSignal: any;
  }
}

export async function registerWebPush(userId: string) {
  try {
    // Load OneSignal SDK
    if (!window.OneSignal) {
      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      document.head.appendChild(script);
      
      await new Promise((resolve) => {
        script.onload = resolve;
      });

      // Wait for OneSignal to be available on window
      let attempts = 0;
      while (!window.OneSignal && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.OneSignal) {
        console.error("OneSignal failed to load after 5 seconds");
        return;
      }
    }

    // Initialize OneSignal
    await window.OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
    });

    // Request notification permission
    const permission = await window.OneSignal.Notifications.requestPermission();
    if (!permission) {
      console.log("Notification permission not granted");
      return;
    }

    // Get the OneSignal player ID (subscription ID)
    const playerId = await window.OneSignal.User.PushSubscription.id;
    if (!playerId) {
      console.log("No OneSignal player ID received");
      return;
    }

    console.log("OneSignal player ID received:", playerId.substring(0, 20) + "...");

    // Save to database
    await supabase
      .from("fcm_tokens")
      .upsert({ user_id: userId, token: playerId })
      .throwOnError();

    console.log("OneSignal player ID saved to database");

    // Listen for notification clicks
    window.OneSignal.Notifications.addEventListener('click', (event: any) => {
      const bookingId = event.notification?.data?.booking_id || event.notification?.data?.bookingId;
      if (bookingId) {
        window.postMessage({ type: "BOOKING_ALERT", bookingId }, "*");
      }
    });
  } catch (error) {
    console.error("Error registering web push:", error);
  }
}
