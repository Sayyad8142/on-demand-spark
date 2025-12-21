/**
 * API helper for calling Supabase Edge Functions with Firebase authentication.
 * Since we removed Supabase Auth, we use Firebase ID tokens for authentication.
 */

import { auth } from "@/lib/firebase";

const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o";

/**
 * Get the current Firebase user's ID token.
 * Returns null if user is not signed in.
 */
export async function getFirebaseToken(): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.log("⚠️ No Firebase user signed in");
    return null;
  }
  try {
    const token = await currentUser.getIdToken();
    return token;
  } catch (error) {
    console.error("❌ Failed to get Firebase ID token:", error);
    return null;
  }
}

/**
 * Result type for Edge Function calls
 */
export interface CallFnResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

/**
 * Call a Supabase Edge Function with Firebase authentication.
 * 
 * @param name - The name of the Edge Function
 * @param body - The request body (will be JSON stringified)
 * @returns CallFnResult with the response data or error
 */
export async function callFn<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<CallFnResult<T>> {
  const token = await getFirebaseToken();
  
  if (!token) {
    return {
      ok: false,
      error: "Not authenticated. Please sign in again.",
      status: 401,
    };
  }

  try {
    console.log(`📡 Calling Edge Function: ${name}`);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    const status = response.status;
    
    // Handle non-JSON responses
    const contentType = response.headers.get("content-type");
    let data: T | undefined;
    let errorText: string | undefined;

    if (contentType?.includes("application/json")) {
      const json = await response.json();
      if (response.ok) {
        data = json as T;
      } else {
        errorText = json.error || json.message || JSON.stringify(json);
      }
    } else {
      const text = await response.text();
      if (!response.ok) {
        errorText = text || `HTTP ${status}`;
      }
    }

    if (!response.ok) {
      console.error(`❌ Edge Function ${name} failed:`, status, errorText);
      return {
        ok: false,
        error: errorText || `Request failed with status ${status}`,
        status,
      };
    }

    console.log(`✅ Edge Function ${name} succeeded`);
    return {
      ok: true,
      data,
      status,
    };
  } catch (error) {
    console.error(`❌ Edge Function ${name} error:`, error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error",
      status: 0,
    };
  }
}

/**
 * Helper to show toast for permission errors
 */
export function isPermissionError(result: CallFnResult): boolean {
  return result.status === 401 || result.status === 403;
}

/**
 * Get a user-friendly error message
 */
export function getErrorMessage(result: CallFnResult): string {
  if (result.status === 401 || result.status === 403) {
    return "Permission error. Token invalid or function not deployed.";
  }
  if (result.status === 404) {
    return "Edge function not found. Please deploy the function.";
  }
  return result.error || "An unknown error occurred";
}
