import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, RefreshCw, Trash2, Copy, Check, AlertCircle, CheckCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getStorageCacheDebug, reloadSessionFromStorage } from "@/lib/capacitorStorage";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { checkNotificationPermission, type PermissionStatus } from "@/lib/permissions";
import { CURRENT_VERSION_NAME } from "@/config/version";

interface AuthEvent {
  time: string;
  event: string;
  details?: string;
}

interface AuthError {
  time: string;
  error: string;
  source: string;
}

// Global auth events tracker (shared with useAuth)
const authEvents: AuthEvent[] = [];
const authErrors: AuthError[] = [];

export const logAuthEvent = (event: string, details?: string) => {
  authEvents.unshift({
    time: new Date().toISOString(),
    event,
    details
  });
  // Keep only last 10 events
  if (authEvents.length > 10) authEvents.pop();
};

export const logAuthError = (error: string, source: string) => {
  authErrors.unshift({
    time: new Date().toISOString(),
    error,
    source
  });
  // Keep only last 5 errors
  if (authErrors.length > 5) authErrors.pop();
};

interface StorageSync {
  bothPresent: boolean;
  webLength: number | null;
  nativeLength: number | null;
  webRefreshLast6: string;
  nativeRefreshLast6: string;
  webExpiresAt: number | null;
  nativeExpiresAt: number | null;
  tokenMatch: boolean;
  expiryMatch: boolean;
  parseError: string | null;
}

interface NotificationDiagnostics {
  workerId: string | null;
  firebaseUid: string | null;
  fcmTokenExists: boolean;
  notificationPermissionStatus: PermissionStatus | "loading";
  lastTokenUpdatedAt: string | null;
  lastSeenAt: string | null;
  appVersion: string;
}

// Derive type from the actual function return
type StorageCacheDebug = ReturnType<typeof getStorageCacheDebug>;

export default function AuthDebug() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, session, refreshSession } = useAuth();
  const [storageDebug, setStorageDebug] = useState<StorageCacheDebug | null>(null);
  const [storageSync, setStorageSync] = useState<StorageSync | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [notificationDiagnostics, setNotificationDiagnostics] = useState<NotificationDiagnostics | null>(null);
  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDebugInfo = useCallback(async () => {
    setLoading(true);
    try {
      // Get storage cache debug (memory cache info)
      const cacheDebug = getStorageCacheDebug();
      setStorageDebug(cacheDebug);

      const [permissionState, workerResult] = await Promise.all([
        checkNotificationPermission(),
        user?.id
          ? supabase
              .from('workers')
              .select('id, fcm_token, fcm_token_updated_at, last_seen_at')
              .or(`user_id.eq.${user.id},id.eq.${user.id}`)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (workerResult.error) console.warn('[AuthDebug] Worker diagnostics load failed:', workerResult.error.message);
      setNotificationDiagnostics({
        workerId: workerResult.data?.id ?? null,
        firebaseUid: user?.id ?? null,
        fcmTokenExists: !!workerResult.data?.fcm_token,
        notificationPermissionStatus: permissionState.status,
        lastTokenUpdatedAt: workerResult.data?.fcm_token_updated_at ?? null,
        lastSeenAt: workerResult.data?.last_seen_at ?? null,
        appVersion: CURRENT_VERSION_NAME,
      });

      // Reload from persistent storage
      await reloadSessionFromStorage();

      // Read DIRECTLY from Preferences (async) for accurate sync check
      let webSessionRaw: string | null = null;
      let nativeSessionRaw: string | null = null;

      if (Capacitor.isNativePlatform()) {
        const { value: webVal } = await Preferences.get({ key: 'didi-worker-session' });
        const { value: nativeVal } = await Preferences.get({ key: 'didi_session' });
        webSessionRaw = webVal;
        nativeSessionRaw = nativeVal;
      } else {
        // On web, read from localStorage
        webSessionRaw = localStorage.getItem('didi-worker-session');
        nativeSessionRaw = localStorage.getItem('didi_session');
      }

      // Parse and compare
      let webRefreshLast6 = '';
      let nativeRefreshLast6 = '';
      let webExpiresAt: number | null = null;
      let nativeExpiresAt: number | null = null;
      let parseError: string | null = null;

      // Parse web session
      if (webSessionRaw) {
        try {
          const parsed = JSON.parse(webSessionRaw);
          const rt = parsed.refresh_token || '';
          webRefreshLast6 = rt ? rt.slice(-6) : 'EMPTY';
          webExpiresAt = parsed.expires_at || null;
        } catch (e) {
          webRefreshLast6 = 'PARSE_ERR';
          parseError = `Web parse: ${e instanceof Error ? e.message : 'Unknown'}`;
        }
      }

      // Parse native session (different format: refreshToken vs refresh_token)
      if (nativeSessionRaw) {
        try {
          const parsed = JSON.parse(nativeSessionRaw);
          // Native uses 'refreshToken' (camelCase), web uses 'refresh_token' (snake_case)
          const rt = parsed.refreshToken || parsed.refresh_token || '';
          nativeRefreshLast6 = rt ? rt.slice(-6) : 'EMPTY';
          // Native uses 'expiresAt' (camelCase), web uses 'expires_at' (snake_case)
          nativeExpiresAt = parsed.expiresAt || parsed.expires_at || null;
        } catch (e) {
          nativeRefreshLast6 = 'PARSE_ERR';
          parseError = (parseError ? parseError + '; ' : '') + `Native parse: ${e instanceof Error ? e.message : 'Unknown'}`;
        }
      }

      const bothPresent = Boolean(webSessionRaw) && Boolean(nativeSessionRaw);
      const tokenMatch = webRefreshLast6 === nativeRefreshLast6 && 
                         webRefreshLast6.length > 0 && 
                         webRefreshLast6 !== 'PARSE_ERR' && 
                         webRefreshLast6 !== 'EMPTY';
      const expiryMatch = webExpiresAt === nativeExpiresAt;

      setStorageSync({
        bothPresent,
        webLength: webSessionRaw ? webSessionRaw.length : null,
        nativeLength: nativeSessionRaw ? nativeSessionRaw.length : null,
        webRefreshLast6: webRefreshLast6 || 'N/A',
        nativeRefreshLast6: nativeRefreshLast6 || 'N/A',
        webExpiresAt,
        nativeExpiresAt,
        tokenMatch,
        expiryMatch,
        parseError
      });

      console.log('[AuthDebug] Storage sync check:', {
        webLength: webSessionRaw?.length,
        nativeLength: nativeSessionRaw?.length,
        webRefreshLast6,
        nativeRefreshLast6,
        tokenMatch
      });

    } catch (e) {
      console.error('Debug load error:', e);
      toast({
        title: "Load Error",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive"
      });
    }
    setLoading(false);
  }, [toast, user?.id]);

  // Initial load
  useEffect(() => {
    loadDebugInfo();
  }, [loadDebugInfo]);

  // Auto-refresh interval (30 seconds)
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshIntervalRef.current = setInterval(() => {
        loadDebugInfo();
      }, 30000);
    } else {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [autoRefresh, loadDebugInfo]);

  const handleForceRefresh = async () => {
    setLoading(true);
    try {
      const result = await refreshSession();
      toast({
        title: result ? "Refresh Success" : "Refresh Failed",
        description: result ? `Token expires at ${new Date((result.expires_at || 0) * 1000).toISOString()}` : "No session returned"
      });
      await loadDebugInfo();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      logAuthError(message, 'manual_refresh');
      toast({
        title: "Refresh Error",
        description: message,
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleClearSession = async () => {
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key: 'didi-worker-session' });
      await Preferences.remove({ key: 'didi_session' });
    }
    localStorage.clear();
    toast({
      title: "Session Cleared",
      description: "All storage cleared - you will be logged out"
    });
    setTimeout(() => navigate('/auth'), 1000);
  };

  const copyDebugInfo = async () => {
    const info = {
      timestamp: new Date().toISOString(),
      platform: Capacitor.getPlatform(),
      isNative: Capacitor.isNativePlatform(),
      userId: user?.id,
      sessionExpiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      storageDebug,
      storageSync,
      notificationDiagnostics,
      recentEvents: authEvents.slice(0, 5),
      recentErrors: authErrors.slice(0, 3)
    };
    
    try {
      await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
      setCopied(true);
      toast({ title: "Copied", description: "Debug info copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const expiresAt = session?.expires_at ? new Date(session.expires_at * 1000) : null;
  const now = new Date();
  const timeUntilExpiry = expiresAt ? Math.round((expiresAt.getTime() - now.getTime()) / 1000 / 60) : null;

  // Sync status helper
  const getSyncStatus = () => {
    if (!storageSync) return { icon: null, text: 'Loading...', color: '' };
    if (storageSync.parseError) return { icon: AlertCircle, text: 'PARSE ERROR', color: 'text-destructive' };
    if (!storageSync.bothPresent) return { icon: AlertCircle, text: 'MISSING SESSION', color: 'text-destructive' };
    if (storageSync.tokenMatch) return { icon: CheckCircle, text: 'IN SYNC', color: 'text-primary' };
    return { icon: AlertCircle, text: 'DESYNC', color: 'text-destructive' };
  };

  const syncStatus = getSyncStatus();

  return (
    <div className="min-h-screen bg-background p-4">
      <header className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-semibold">Auth Debug</h1>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={copyDebugInfo} disabled={loading}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span className="ml-1 text-xs">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={loadDebugInfo} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </header>

      {/* Auto-refresh toggle with manual refresh button */}
      <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm">Auto refresh (30s)</span>
          <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
        </div>
        <Button variant="ghost" size="sm" onClick={loadDebugInfo} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          <span className="text-xs">Refresh</span>
        </Button>
      </div>

      <div className="space-y-4">
        {/* Session Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground">User ID:</span>
              <span className="truncate max-w-[200px]">{user?.id || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expires At:</span>
              <span>{expiresAt ? format(expiresAt, 'HH:mm:ss') : 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expires In:</span>
              <span className={timeUntilExpiry !== null && timeUntilExpiry < 10 ? 'text-destructive' : ''}>
                {timeUntilExpiry !== null ? `${timeUntilExpiry} min` : 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Notification Diagnostics */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Notification Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs font-mono">
            <DebugRow label="Worker ID" value={notificationDiagnostics?.workerId || 'None'} />
            <DebugRow label="Firebase UID" value={notificationDiagnostics?.firebaseUid || 'None'} />
            <DebugRow label="FCM Token Exists" value={notificationDiagnostics?.fcmTokenExists ? 'Yes' : 'No'} />
            <DebugRow label="Notification Permission" value={notificationDiagnostics?.notificationPermissionStatus || 'loading'} />
            <DebugRow label="Last Token Updated" value={notificationDiagnostics?.lastTokenUpdatedAt ? format(new Date(notificationDiagnostics.lastTokenUpdatedAt), 'dd MMM HH:mm') : 'N/A'} />
            <DebugRow label="Last Seen At" value={notificationDiagnostics?.lastSeenAt ? format(new Date(notificationDiagnostics.lastSeenAt), 'dd MMM HH:mm') : 'N/A'} />
            <DebugRow label="App Version" value={notificationDiagnostics?.appVersion || CURRENT_VERSION_NAME} />
          </CardContent>
        </Card>

        {/* Storage Sync Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Storage Sync
              {syncStatus.icon && (
                <span className={`flex items-center gap-1 text-xs ${syncStatus.color}`}>
                  <syncStatus.icon className="w-3 h-3" />
                  {syncStatus.text}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Both Present:</span>
              <span className={storageSync?.bothPresent ? 'text-primary' : 'text-destructive'}>
                {storageSync?.bothPresent ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Web Session:</span>
              <span>{storageSync?.webLength ? `${storageSync.webLength} chars` : 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Native Session:</span>
              <span>{storageSync?.nativeLength ? `${storageSync.nativeLength} chars` : 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Web RT (last 6):</span>
              <span className="font-bold">{storageSync?.webRefreshLast6 || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Native RT (last 6):</span>
              <span className="font-bold">{storageSync?.nativeRefreshLast6 || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Token Match:</span>
              <span className={storageSync?.tokenMatch ? 'text-primary' : 'text-destructive'}>
                {storageSync?.tokenMatch ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expiry Match:</span>
              <span className={storageSync?.expiryMatch ? 'text-primary' : 'text-muted-foreground'}>
                {storageSync?.expiryMatch ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            {storageSync?.parseError && (
              <div className="text-destructive text-[10px] break-all">
                {storageSync.parseError}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Memory Cache Debug */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Memory Cache</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Initialized:</span>
              <span>{storageDebug?.initialized ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Has Session:</span>
              <span>{storageDebug?.hasSession ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Keys:</span>
              <span className="truncate max-w-[180px]">{storageDebug?.keys.join(', ') || 'None'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Auth Events */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Events ({authEvents.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {authEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No events recorded yet</p>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {authEvents.slice(0, 5).map((evt, i) => (
                  <div key={i} className="text-xs font-mono flex gap-2">
                    <span className="text-muted-foreground">{format(new Date(evt.time), 'HH:mm:ss')}</span>
                    <span className="text-primary">{evt.event}</span>
                    {evt.details && <span className="text-muted-foreground truncate">{evt.details}</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Auth Errors */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive">Recent Errors ({authErrors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {authErrors.length === 0 ? (
              <p className="text-xs text-muted-foreground">No errors recorded</p>
            ) : (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {authErrors.slice(0, 3).map((err, i) => (
                  <div key={i} className="text-xs font-mono">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground">{format(new Date(err.time), 'HH:mm:ss')}</span>
                      <span className="text-destructive">{err.source}</span>
                    </div>
                    <div className="text-destructive/80 truncate">{err.error}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleForceRefresh} disabled={loading} className="flex-1">
            <RefreshCw className="w-4 h-4 mr-2" />
            Force Refresh
          </Button>
          <Button onClick={handleClearSession} variant="destructive" className="flex-1">
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Session
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          Platform: {Capacitor.getPlatform()} | Native: {Capacitor.isNativePlatform() ? 'Yes' : 'No'}
        </p>
      </div>
    </div>
  );
}
