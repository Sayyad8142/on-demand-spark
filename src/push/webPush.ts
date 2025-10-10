import { supabase } from "@/integrations/supabase/client";

export async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  await navigator.serviceWorker.register("/sw.js");
  return true;
}

export async function subscribeWebPush(userId: string, vapidPublicKey: string) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const key = sub.getKey("p256dh");
  const auth = sub.getKey("auth");

  await supabase.from("web_push_subscriptions").upsert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: key ? btoa(String.fromCharCode(...new Uint8Array(key))) : "",
    auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : "",
  });

  return true;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function unsubscribeWebPush(): Promise<boolean> {
  const sub = await getCurrentSubscription();
  if (!sub) return true;
  try {
    const ok = await sub.unsubscribe();
    return ok;
  } catch {
    return false;
  }
}
