// Requests Android overlay permission for displaying booking alerts over other apps
export async function requestAndroidOverlay() {
  // @ts-ignore - Check if native Android bridge is available
  if ((window as any).AndroidOverlay?.request) {
    // If we add a native bridge later, call it
    await (window as any).AndroidOverlay.request();
    return;
  }
  
  // Fallback: Alert users to manually enable in Settings
  // This will be handled by the native MainActivity on app launch
  console.log('Overlay permission request - handled natively on Android');
}
