import { useOfflineMode } from "@/hooks/useOfflineMode";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WifiOff, Wifi, RefreshCw, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function OfflineBanner() {
  const { isOnline } = useOfflineMode();
  const { hasQueuedItems, isSyncing, processSyncQueue, syncQueue } = useOfflineSync();

  if (isOnline && !hasQueuedItems) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed top-0 left-0 right-0 z-50 p-2"
      >
        {!isOnline ? (
          <Alert className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
            <WifiOff className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertDescription className="text-yellow-900 dark:text-yellow-100">
              <div className="flex items-center justify-between">
                <span className="font-medium">You're offline</span>
                <span className="text-xs">Changes will sync when reconnected</span>
              </div>
            </AlertDescription>
          </Alert>
        ) : hasQueuedItems ? (
          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-900 dark:text-blue-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  <span className="font-medium">
                    {syncQueue.length} action{syncQueue.length > 1 ? 's' : ''} pending sync
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={processSyncQueue}
                  disabled={isSyncing}
                  className="h-7 text-xs"
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Sync Now
                    </>
                  )}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
