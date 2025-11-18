import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, WifiOff, RefreshCw, Trash2, Database, Clock } from "lucide-react";
import { useOfflineMode } from "@/hooks/useOfflineMode";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Preferences } from "@capacitor/preferences";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function OfflineSettings() {
  const navigate = useNavigate();
  const { isOnline, wasOffline } = useOfflineMode();
  const { syncQueue, isSyncing, processSyncQueue, clearQueue, hasQueuedItems } = useOfflineSync();

  const clearAllCache = async () => {
    try {
      const { keys } = await Preferences.keys();
      for (const key of keys) {
        if (key.startsWith('cache_') || key.startsWith('worker_')) {
          await Preferences.remove({ key });
        }
      }
      toast.success('All cached data cleared');
    } catch (error) {
      console.error('Failed to clear cache:', error);
      toast.error('Failed to clear cache');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <WifiOff className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold">Offline Mode</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-20">
        {/* Connection Status */}
        <Card>
          <CardHeader>
            <CardTitle>Connection Status</CardTitle>
            <CardDescription>Current network connectivity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                <div>
                  <p className="font-medium">{isOnline ? 'Online' : 'Offline'}</p>
                  <p className="text-sm text-muted-foreground">
                    {isOnline 
                      ? 'Connected to the internet' 
                      : 'No internet connection detected'}
                  </p>
                </div>
              </div>
              {wasOffline && isOnline && (
                <Badge variant="secondary">Recently reconnected</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sync Queue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Sync Queue
              {hasQueuedItems && (
                <Badge variant="secondary">{syncQueue.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Actions waiting to be synced to the server
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {syncQueue.length === 0 ? (
              <Alert>
                <AlertDescription className="text-center py-4">
                  No pending actions. Everything is synced!
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-2">
                  {syncQueue.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium capitalize">{item.type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="outline">Pending</Badge>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={processSyncQueue}
                    disabled={!isOnline || isSyncing}
                    className="flex-1"
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Sync Now
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={clearQueue}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Queue
                  </Button>
                </div>

                {!isOnline && (
                  <Alert>
                    <AlertDescription className="text-sm">
                      You're currently offline. Items will sync automatically when connection is restored.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Cache Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Cache Management
            </CardTitle>
            <CardDescription>
              Manage locally cached data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cached data allows the app to work offline. Clear cache if you experience data issues.
            </p>
            <Button
              variant="destructive"
              onClick={clearAllCache}
              className="w-full"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Cache
            </Button>
          </CardContent>
        </Card>

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle>How Offline Mode Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">Automatic Detection</p>
              <p>The app automatically detects when you go offline and shows a banner at the top.</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Action Queuing</p>
              <p>Actions you take while offline are saved and automatically synced when you reconnect.</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Data Caching</p>
              <p>Important data is cached locally so you can view it even without internet.</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Optimistic Updates</p>
              <p>Changes appear immediately in the UI for a smooth experience.</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
