self.addEventListener("push", (event) => {
  const data = event.data?.json?.() || {};
  const title = data.title || "New Booking";
  const body = data.body || "Tap to view";
  const url = data.url || "/home";
  event.waitUntil(
    self.registration.showNotification(title, { body, data: { url } })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/home";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING" && self.skipWaiting) {
    self.skipWaiting();
  }
});
