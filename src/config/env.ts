// Single source of truth for Supabase connection config
const CUSTOM_DOMAIN = "https://api.didisnow.com";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o";

export function getSupabaseUrl(): string {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  // Use env var only if it points to our custom domain; ignore platform-injected supabase.co URLs
  if (envUrl && envUrl.includes("api.didisnow.com")) {
    return envUrl;
  }
  return CUSTOM_DOMAIN;
}

export function getSupabaseAnonKey(): string {
  return (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || ANON_KEY;
}

/** Non-blocking connectivity check – call once at startup. Only runs when DEBUG_SUPABASE_CONNECTION is set. */
export function debugConnectionCheck(): void {
  if (!import.meta.env.VITE_DEBUG_SUPABASE_CONNECTION) return;
  fetch(`${getSupabaseUrl()}/rest/v1/`, {
    method: "HEAD",
    headers: { apikey: getSupabaseAnonKey() },
  })
    .then((r) => console.log(`✅ Supabase connection: ${r.ok ? "SUCCESS" : "FAILED"} (${r.status})`))
    .catch((e) => console.error("❌ Supabase connection: FAILED", e));
}
