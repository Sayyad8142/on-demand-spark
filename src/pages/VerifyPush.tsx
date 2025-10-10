import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ensureServiceWorker, subscribeWebPush, getCurrentSubscription, unsubscribeWebPush } from "@/push/webPush";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

export default function VerifyPush() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(typeof Notification !== "undefined" ? Notification.permission : "default");
  const [endpoint, setEndpoint] = useState<string>("");
  const [subLoading, setSubLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  const shortEndpoint = useMemo(() => (endpoint ? endpoint.slice(0, 36) + "..." : ""), [endpoint]);

  async function refreshStatus() {
    setPermission(typeof Notification !== "undefined" ? Notification.permission : "default");
    const sub = await getCurrentSubscription();
    setEndpoint(sub?.endpoint || "");
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function doSubscribe() {
    setSubLoading(true);
    setResult("");
    try {
      const ok = await ensureServiceWorker();
      if (!ok) return setResult("This browser does not support Service Workers / Push.");
      if (!VAPID_PUBLIC) return setResult("VAPID public key missing (VITE_VAPID_PUBLIC_KEY).");

      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setResult("Notification permission not granted.");

      if (!user?.id) return setResult("Sign in required.");
      await subscribeWebPush(user.id, VAPID_PUBLIC);
      await refreshStatus();
      setResult("✅ Subscribed and saved in Supabase.");
    } catch (e: any) {
      setResult("❌ Subscribe error: " + (e?.message || String(e)));
    } finally {
      setSubLoading(false);
    }
  }

  async function doUnsubscribe() {
    setSubLoading(true);
    setResult("");
    try {
      const ok = await unsubscribeWebPush();
      if (!ok) setResult("Unsubscribe attempt failed (maybe already unsubscribed).");
      await refreshStatus();
      setResult("✅ Unsubscribed.");
    } catch (e: any) {
      setResult("❌ Unsubscribe error: " + (e?.message || String(e)));
    } finally {
      setSubLoading(false);
    }
  }

  async function testPush() {
    setTestLoading(true);
    setResult("");
    try {
      if (!user?.id) return setResult("Sign in required.");

      // Call your Edge Function `send-webpush`
      const { data, error } = await supabase.functions.invoke("send-webpush", {
        body: {
          workerIds: [user.id],
          title: "Didi Now — Test Push",
          body: "If you see this, Web Push works 🎉",
          url: "/home",
        },
      });

      if (error) throw error;
      setResult("📬 Edge function response: " + JSON.stringify(data));
    } catch (e: any) {
      setResult("❌ Test push error: " + (e?.message || String(e)));
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Verify Web Push</h1>

      <Card className="p-4 space-y-2">
        <div className="text-sm">
          <div><span className="font-medium">User:</span> {user?.id || "—"}</div>
          <div><span className="font-medium">Permission:</span> {permission}</div>
          <div className="break-all">
            <span className="font-medium">Endpoint:</span> {endpoint ? shortEndpoint : "—"}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
          <Button onClick={doSubscribe} disabled={subLoading}>
            {subLoading ? "Working..." : "Subscribe"}
          </Button>
          <Button variant="outline" onClick={doUnsubscribe} disabled={subLoading}>
            {subLoading ? "Working..." : "Unsubscribe"}
          </Button>
          <Button variant="secondary" onClick={testPush} disabled={testLoading}>
            {testLoading ? "Sending..." : "Send Test Push"}
          </Button>
          <Button variant="ghost" onClick={refreshStatus}>Refresh Status</Button>
        </div>

        {!!result && <pre className="text-xs bg-muted p-2 rounded mt-2 whitespace-pre-wrap">{result}</pre>}
      </Card>

      <Card className="p-4 text-xs text-muted-foreground">
        <div className="font-medium mb-1">Tips</div>
        <ul className="list-disc ml-4 space-y-1">
          <li>Requires HTTPS (or localhost) and a supported browser.</li>
          <li>If you changed VAPID keys, unsubscribe then subscribe again.</li>
          <li>Keep this page open and also try from another tab to see a background push.</li>
        </ul>
      </Card>
    </div>
  );
}
