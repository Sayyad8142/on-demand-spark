import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, Trash2, Copy, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { capacitorStorage, getStorageCacheDebug, reloadSessionFromStorage } from "@/lib/capacitorStorage";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

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

export default function AuthDebug() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, session, refreshSession } = useAuth();
  const [storageDebug, setStorageDebug] = useState<ReturnType<typeof getStorageCacheDebug> | null>(null);
  const [rawStorage, setRawStorage] = useState<{
    webSession: string | null;
    nativeSession: string | null;
    webRefreshLast6: string;
    nativeRefreshLast6: string;
    tokenMatch: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadDebugInfo = useCallback(async () => {
    setLoading(true);
    try {
      // Get storage cache debug
      const cacheDebug = getStorageCacheDebug();
      setStorageDebug(cacheDebug);

      // Reload from persistent storage
      await reloadSessionFromStorage();

      // Read raw storage values
      const webSession = capacitorStorage.getItem('didi-worker-session');
      const nativeSession = capacitorStorage.getItem('didi_session');

      let webRefreshLast6 = '';
      let nativeRefreshLast6 = '';

      try {
        if (webSession) {
          const parsed = JSON.parse(webSession);
          const rt = parsed.refresh_token || '';
          webRefreshLast6 = rt.slice(-6);
        }
      } catch {
        webRefreshLast6 = 'PARSE_ERR';
      }

      try {
        if (nativeSession) {
          const parsed = JSON.parse(nativeSession);
          const rt = parsed.refreshToken || '';
          nativeRefreshLast6 = rt.slice(-6);
        }
      } catch {
        nativeRefreshLast6 = 'PARSE_ERR';
      }

      setRawStorage({
        webSession: webSession ? `${webSession.length} chars` : null,
        nativeSession: nativeSession ? `${nativeSession.length} chars` : null,
        webRefreshLast6,
        nativeRefreshLast6,
        tokenMatch: webRefreshLast6 === nativeRefreshLast6 && webRefreshLast6.length > 0
      });

      // Also read directly from Preferences to verify
      if (Capacitor.isNativePlatform()) {
        const { value: directWeb } = await Preferences.get({ key: 'didi-worker-session' });
        const { value: directNative } = await Preferences.get({ key: 'didi_session' });
        console.log('[DEBUG] Direct Preferences read:', {
          webSession: directWeb ? `${directWeb.length} chars` : null,
          nativeSession: directNative ? `${directNative.length} chars` : null
        });
      }
    } catch (e) {
      console.error('Debug load error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDebugInfo();
  }, [loadDebugInfo]);

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

  const copyDebugInfo = () => {
    const info = {
      timestamp: new Date().toISOString(),
      userId: user?.id,
      sessionExpiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      storageDebug,
      rawStorage,
      recentEvents: authEvents.slice(0, 5),
      recentErrors: authErrors.slice(0, 3)
    };
    navigator.clipboard.writeText(JSON.stringify(info, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiresAt = session?.expires_at ? new Date(session.expires_at * 1000) : null;
  const now = new Date();
  const timeUntilExpiry = expiresAt ? Math.round((expiresAt.getTime() - now.getTime()) / 1000 / 60) : null;

  return (
    <div className="min-h-screen bg-background p-4">
      <header className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-semibold">Auth Debug</h1>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={copyDebugInfo}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
        <Button variant="outline" size="sm" onClick={loadDebugInfo} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </header>

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

        {/* Storage Sync Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Storage Sync
              {rawStorage?.tokenMatch && (
                <span className="text-primary text-xs">✓ IN SYNC</span>
              )}
              {rawStorage && !rawStorage.tokenMatch && (
                <span className="text-destructive text-xs">✗ DESYNC</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Web Session:</span>
              <span>{rawStorage?.webSession || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Native Session:</span>
              <span>{rawStorage?.nativeSession || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Web RT (last 6):</span>
              <span className="font-bold">{rawStorage?.webRefreshLast6 || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Native RT (last 6):</span>
              <span className="font-bold">{rawStorage?.nativeRefreshLast6 || 'N/A'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Auth Events */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            {authEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No events recorded yet</p>
            ) : (
              <div className="space-y-1">
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
            <CardTitle className="text-sm text-destructive">Recent Errors</CardTitle>
          </CardHeader>
          <CardContent>
            {authErrors.length === 0 ? (
              <p className="text-xs text-muted-foreground">No errors recorded</p>
            ) : (
              <div className="space-y-1">
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

        {/* Storage Cache Debug */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Memory Cache</CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-mono">
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(storageDebug, null, 2)}
            </pre>
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
