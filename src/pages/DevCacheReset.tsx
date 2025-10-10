import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DevCacheReset() {
  const [swState, setSwState] = useState("n/a");
  const [cachesList, setCachesList] = useState<string[]>([]);
  const BUILD_ID = import.meta.env.VITE_BUILD_ID || "dev";

  async function refresh() {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        setSwState(regs.length ? `registered (${regs.length})` : "none");
      } else {
        setSwState("unsupported");
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        setCachesList(keys);
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function updateSW() {
    if (!("serviceWorker" in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      await r.update();
      if (r.waiting) r.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    await refresh();
    alert("Service worker updated (if available). Reload the page.");
  }

  async function unregisterSW() {
    if (!("serviceWorker" in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
    await refresh();
    alert("Service worker unregistered. Reload the page.");
  }

  async function clearCaches() {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await refresh();
    alert("All caches cleared. Reload the page.");
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Dev Cache Reset</h1>

      <Card className="p-4 space-y-2">
        <div><span className="font-medium">BUILD_ID:</span> {BUILD_ID}</div>
        <div><span className="font-medium">Service Worker:</span> {swState}</div>
        <div className="text-sm">
          <span className="font-medium">Cache Keys:</span> {cachesList.length ? cachesList.join(", ") : "none"}
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <Button onClick={updateSW}>Update SW (Skip Waiting)</Button>
          <Button variant="outline" onClick={unregisterSW}>Unregister SW</Button>
          <Button variant="secondary" onClick={clearCaches}>Clear Caches</Button>
          <Button variant="ghost" onClick={refresh}>Refresh Status</Button>
        </div>
      </Card>

      <Card className="p-4 text-xs text-muted-foreground">
        <div className="font-medium mb-1">Tips</div>
        <ul className="list-disc ml-4 space-y-1">
          <li>If you changed code but still see old UI, unregister the SW and clear caches, then reload.</li>
          <li>Set VITE_BUILD_ID to a new value on each deploy to verify you're on the latest build.</li>
        </ul>
      </Card>
    </div>
  );
}
