/* global self, firebase, clients */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// TODO: Replace these with your actual Firebase config values
firebase.initializeApp({
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(async (payload) => {
  const data = payload?.data || {};
  const title = data.title || "New Booking";
  const options = { 
    body: data.body || "Tap to respond", 
    data,
    icon: "/favicon.ico"
  };
  await self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const bookingId = event.notification?.data?.bookingId || event.notification?.data?.booking_id;
  
  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    let client = clientList[0];
    
    if (!client) {
      client = await clients.openWindow("/home");
    }
    
    if (client && bookingId) {
      client.postMessage({ type: "BOOKING_ALERT", bookingId });
    }
    
    if (client) {
      client.focus();
    }
  })());
});
