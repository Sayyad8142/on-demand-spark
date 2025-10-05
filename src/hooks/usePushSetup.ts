import { useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Firebase configuration
// NOTE: These are publishable keys and are safe to expose in client-side code
// They are protected by Firebase security rules on the backend
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const vapidKey = "YOUR_FIREBASE_VAPID_KEY";

export function usePushSetup() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const setupPushNotifications = async () => {
      try {
        // Check if notifications are supported
        if (!(await isSupported())) {
          console.log('Firebase messaging not supported in this browser');
          return;
        }

        // Check if service workers are supported
        if (!("serviceWorker" in navigator)) {
          console.log('Service workers not supported');
          return;
        }

        // Register service worker
        const registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );
        console.log('Service worker registered:', registration);

        // Request notification permission
        const permission = await Notification.requestPermission();
        console.log('Notification permission:', permission);
        
        if (permission !== "granted") {
          console.log('Notification permission denied');
          return;
        }

        // Initialize Firebase app
        const app = initializeApp(firebaseConfig);
        const messaging = getMessaging(app);

        // Wait for service worker to be ready
        const swRegistration = await navigator.serviceWorker.ready;

        // Get FCM token
        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swRegistration,
        });

        console.log('FCM token obtained:', token);

        if (token) {
          // Upsert token to database
          const { error } = await supabase
            .from("fcm_tokens")
            .upsert({
              user_id: user.id,
              token,
              updated_at: new Date().toISOString(),
            });

          if (error) {
            console.error('Error saving FCM token:', error);
          } else {
            console.log('FCM token saved successfully');
          }
        }

        // Handle foreground messages
        onMessage(messaging, (payload) => {
          console.log('Foreground message received:', payload);
          
          const bookingId = payload?.data?.bookingId;
          if (bookingId) {
            // Post message to window to trigger alert modal
            window.postMessage({ 
              type: "BOOKING_ALERT", 
              bookingId 
            }, "*");
          }
        });

      } catch (error) {
        console.error('Error setting up push notifications:', error);
      }
    };

    setupPushNotifications();
  }, [user?.id]);
}
