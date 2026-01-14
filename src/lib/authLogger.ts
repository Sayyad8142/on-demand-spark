// Auth logging helper for debugging session persistence issues
// All logs prefixed with 🔐 for easy filtering

const AUTH_LOG_PREFIX = '🔐 [Auth]';

const persistLastIssue = (kind: string, message: string) => {
  try {
    const payload = {
      ts: new Date().toISOString(),
      kind,
      message,
    };
    localStorage.setItem('auth_last_issue', JSON.stringify(payload));
  } catch {
    // ignore (e.g., storage blocked)
  }
};

export const authLog = {
  storageReady: (hasSession: boolean, attempt: number, maxAttempts: number) => {
    console.log(`${AUTH_LOG_PREFIX} Storage ready after ${attempt}/${maxAttempts} attempts. Session present: ${hasSession}`);
  },

  storageRetry: (attempt: number, error: any) => {
    console.warn(`${AUTH_LOG_PREFIX} Storage read attempt ${attempt} failed:`, error?.message || error);
  },

  storageExhausted: (attempts: number) => {
    const msg = `Storage exhausted ${attempts} attempts with no session loaded`;
    console.error(`${AUTH_LOG_PREFIX} ${msg}`);
    persistLastIssue('STORAGE_EXHAUSTED', msg);
  },

  initAuthStart: () => {
    console.log(`${AUTH_LOG_PREFIX} initAuth starting...`);
  },

  initAuthSession: (hasSession: boolean, userId?: string) => {
    if (hasSession) {
      console.log(`${AUTH_LOG_PREFIX} initAuth got session for user: ${userId}`);
    } else {
      console.log(`${AUTH_LOG_PREFIX} initAuth got null session from getSession()`);
    }
  },

  restoreAttempt: (source: string) => {
    console.log(`${AUTH_LOG_PREFIX} Attempting restore from: ${source}`);
  },

  restoreResult: (source: string, success: boolean, userId?: string) => {
    if (success) {
      console.log(`${AUTH_LOG_PREFIX} Restore from ${source} SUCCESS, user: ${userId}`);
    } else {
      console.log(`${AUTH_LOG_PREFIX} Restore from ${source} FAILED`);
    }
  },

  refreshStart: (reason: string) => {
    console.log(`${AUTH_LOG_PREFIX} Refresh starting: ${reason}`);
  },

  refreshSuccess: (expiresAt?: number) => {
    const expiresIn = expiresAt ? Math.round((expiresAt * 1000 - Date.now()) / 60000) : 'unknown';
    console.log(`${AUTH_LOG_PREFIX} Refresh SUCCESS, expires in ${expiresIn} min`);
  },

  refreshError: (errorCode: string, errorMessage: string) => {
    console.error(`${AUTH_LOG_PREFIX} Refresh ERROR [${errorCode}]: ${errorMessage}`);
    persistLastIssue('REFRESH_ERROR', `[${errorCode}] ${errorMessage}`);
  },

  tokenPersisted: (key: string, success: boolean) => {
    if (success) {
      console.log(`${AUTH_LOG_PREFIX} Token persisted to ${key}`);
    } else {
      console.warn(`${AUTH_LOG_PREFIX} Failed to persist token to ${key}`);
    }
  },

  backupUsed: (reason: string) => {
    console.log(`${AUTH_LOG_PREFIX} Using backup session: ${reason}`);
  },

  signedOutEvent: (intentional: boolean, count: number) => {
    console.log(`${AUTH_LOG_PREFIX} SIGNED_OUT event received. Intentional: ${intentional}, Count: ${count}`);
    if (!intentional) {
      persistLastIssue('SIGNED_OUT', `Unexpected SIGNED_OUT (count=${count})`);
    }
  },

  routeDecision: (route: string, reason: string) => {
    console.log(`${AUTH_LOG_PREFIX} Route decision: ${route} - ${reason}`);
    if (route === '/auth') {
      persistLastIssue('ROUTE_AUTH', reason);
    }
  },
};
