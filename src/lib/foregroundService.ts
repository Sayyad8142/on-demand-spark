// Foreground services have been removed from this app.
// FCM push notifications work independently without requiring foreground services.
// This file is kept for backward compatibility but no longer provides functionality.

export async function startForegroundService() {
  console.log('Foreground service removed - not needed for FCM notifications');
}

export async function stopForegroundService() {
  console.log('Foreground service removed - not needed for FCM notifications');
}
