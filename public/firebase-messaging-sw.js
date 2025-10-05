/* global self, firebase, clients */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Firebase config will be injected at runtime from environment
firebase.initializeApp({
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage(async (payload) => {
  console.log('Background message received:', payload);
  
  const data = payload?.data || {};
  const title = data.title || "New Booking";
  const body = data.body || "Tap to review";
  const bookingId = data.bookingId;
  
  const options = {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { bookingId },
    requireInteraction: true,
    tag: bookingId ? `booking-${bookingId}` : 'booking-alert',
  };
  
  await self.registration.showNotification(title, options);
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  console.log('Notification clicked:', event.notification.data);
  event.notification.close();
  
  const bookingId = event.notification?.data?.bookingId;
  
  event.waitUntil((async () => {
    try {
      // Try to find an existing window
      const clientList = await clients.matchAll({ 
        type: "window", 
        includeUncontrolled: true 
      });
      
      // Prefer focused window, otherwise take first available
      let client = clientList.find(c => c.focused) || clientList[0];
      
      // Open new window if none exists
      if (!client) {
        client = await clients.openWindow("/");
      }
      
      // Send message to client with booking ID
      if (client && bookingId) {
        client.postMessage({ 
          type: "BOOKING_ALERT", 
          bookingId 
        });
      }
      
      // Focus the window
      if (client) {
        await client.focus();
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  })());
});
