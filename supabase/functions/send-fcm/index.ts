import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface FCMPayload {
  workerIds: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Startup: validate Firebase service account & log project_id ───
const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY");
let _serviceAccount: any = null;
let _firebaseProjectId: string | null = null;

if (serviceAccountJson) {
  try {
    _serviceAccount = JSON.parse(serviceAccountJson);
    _firebaseProjectId = _serviceAccount.project_id ?? null;
    console.log(`🔑 Firebase service account loaded — project_id: ${_firebaseProjectId}`);
    console.log(`🔑 Firebase client_email: ${_serviceAccount.client_email ?? "MISSING"}`);
    // IMPORTANT: The project_id here MUST match the google-services.json project_number/sender_id
    // Worker app uses project: didi-now-worker-7b4cb (sender 993479758920)
    // If this log shows a DIFFERENT project_id, that is the SENDER_ID_MISMATCH root cause.
    if (_firebaseProjectId !== "didi-now-worker-7b4cb") {
      console.error(`⚠️ SENDER_ID WARNING: Service account project_id "${_firebaseProjectId}" does NOT match worker app project "didi-now-worker-7b4cb"`);
      console.error(`⚠️ This WILL cause SENDER_ID_MISMATCH errors for all FCM sends!`);
    }
  } catch (e) {
    console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", e);
  }
} else {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT_KEY secret is NOT configured");
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("📤 send-fcm invoked");
    console.log("═══════════════════════════════════════════════════════════");

    // SECURITY: Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("❌ No authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate and parse payload
    const payload: FCMPayload = await req.json();
    const { workerIds, title, body, data } = payload;

    // SECURITY: Validate inputs
    if (!Array.isArray(workerIds) || workerIds.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid workerIds" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate all workerIds are UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!workerIds.every(id => uuidRegex.test(id))) {
      return new Response(JSON.stringify({ error: "Invalid worker ID format" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!title || !body) {
      return new Response(JSON.stringify({ error: "Missing title or body" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const bookingId = data?.bookingId || data?.booking_id || "unknown";
    const bookingType = data?.booking_type || "unknown";
    console.log(`📋 Booking: ${bookingId} (${bookingType})`);
    console.log(`👷 Worker IDs requested: [${workerIds.join(", ")}]`);

    // ─── Validate Firebase config ───
    if (!_serviceAccount) {
      console.error("❌ FIREBASE_SERVICE_ACCOUNT_KEY not configured or invalid");
      return new Response(
        JSON.stringify({ error: "Firebase not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const projectId = _firebaseProjectId!;
    console.log(`🔑 Using Firebase project: ${projectId}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── Token lookup: unified logic ───
    // Source 1 (primary): workers.fcm_token — set by native Android on login
    // Source 2 (fallback): fcm_tokens table — set by Capacitor JS plugin
    // We also try matching by workers.id in case workerIds contains worker.id instead of user_id

    const { data: workersData, error: workerTokenError } = await supabase
      .from("workers")
      .select("id, user_id, fcm_token, full_name")
      .or(`user_id.in.(${workerIds.map(id => `"${id}"`).join(",")}),id.in.(${workerIds.map(id => `"${id}"`).join(",")})`)
      .not("fcm_token", "is", null);

    const { data: fcmTokensData, error: fcmTokenError } = await supabase
      .from("fcm_tokens")
      .select("token, user_id")
      .in("user_id", workerIds);

    if (workerTokenError) console.error("❌ Error fetching worker tokens:", workerTokenError);
    if (fcmTokenError) console.error("❌ Error fetching fcm_tokens:", fcmTokenError);

    // Merge tokens: workers table takes priority over fcm_tokens table
    const tokenMap = new Map<string, { token: string; source: string; workerName: string }>();
    
    // First: fcm_tokens table (lower priority)
    if (fcmTokensData) {
      for (const row of fcmTokensData) {
        if (row.token) {
          tokenMap.set(row.user_id, { 
            token: row.token, 
            source: "fcm_tokens_table",
            workerName: "unknown"
          });
        }
      }
    }
    
    // Then: workers table (higher priority, overrides)
    if (workersData) {
      for (const row of workersData) {
        if (row.fcm_token) {
          const targetId = row.user_id || row.id;
          tokenMap.set(targetId, { 
            token: row.fcm_token, 
            source: "workers.fcm_token",
            workerName: row.full_name || "unknown"
          });
        }
      }
    }

    console.log(`📊 Token lookup results:`);
    console.log(`   workers.fcm_token entries: ${workersData?.length ?? 0}`);
    console.log(`   fcm_tokens table entries: ${fcmTokensData?.length ?? 0}`);
    console.log(`   merged unique tokens: ${tokenMap.size}`);
    
    // Log which workers have NO token
    const missingTokenWorkers = workerIds.filter(id => !tokenMap.has(id));
    if (missingTokenWorkers.length > 0) {
      console.warn(`⚠️ ${missingTokenWorkers.length} workers have NO FCM token: [${missingTokenWorkers.join(", ")}]`);
    }

    if (tokenMap.size === 0) {
      console.log("⚠️ No FCM tokens found for any requested workers");
      return new Response(
        JSON.stringify({ error: "No tokens found", workerIds }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get OAuth2 access token for FCM v1 API
    const accessToken = await getAccessToken(_serviceAccount);

    // ─── Send to each worker ───
    const results = await Promise.all(
      Array.from(tokenMap.entries()).map(async ([userId, { token, source, workerName }]) => {
        try {
          const isBookingAlert = data?.type === "BOOKING_ALERT";
          
          // Build data payload — ALL values must be strings for FCM
          const baseData: Record<string, string> = {
            type: String(data?.type || ""),
            bookingId: String(data?.bookingId || data?.booking_id || ""),
            booking_id: String(data?.bookingId || data?.booking_id || ""),
            booking_type: String(data?.booking_type || "instant"),
            customer: String(data?.customer || ""),
            community: String(data?.community || ""),
            serviceType: String(data?.serviceType || data?.service_type || ""),
            service_type: String(data?.serviceType || data?.service_type || ""),
            location: String(data?.location || ""),
            flat_no: String(data?.flat_no || ""),
            price: String(data?.price || "0"),
            scheduled_time: String(data?.scheduled_time || ""),
            scheduled_date: String(data?.scheduled_date || ""),
            scheduled_time_raw: String(data?.scheduled_time_raw || ""),
            title: String(title),
            body: String(body),
          };

          // CRITICAL: BOOKING_ALERT uses data-only message (no notification block)
          // This ensures MyFirebaseService.onMessageReceived() ALWAYS fires on Android
          const message = isBookingAlert
            ? {
                message: {
                  token,
                  android: { priority: "HIGH" as const, ttl: "60s" },
                  data: baseData,
                },
              }
            : {
                message: {
                  token,
                  notification: { title, body },
                  android: { priority: "HIGH" as const, ttl: "60s" },
                  data: baseData,
                },
              };

          console.log(`📤 Sending FCM to ${workerName} (${userId}), token: ${token.substring(0, 20)}..., source: ${source}`);

          const response = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(message),
            }
          );

          const result = await response.json();

          if (!response.ok) {
            const errorCode = result.error?.details?.[0]?.errorCode || result.error?.status || "UNKNOWN";
            console.error(`❌ FCM failed for ${workerName}: ${errorCode} — ${result.error?.message || JSON.stringify(result.error)}`);
            
            // Clean up stale tokens (UNREGISTERED = device no longer has app)
            if (result.error?.code === 404 || 
                result.error?.details?.some((d: any) => d.errorCode === "UNREGISTERED")) {
              console.log(`🗑️ Cleaning stale token for ${workerName} (${userId})`);
              await supabase.from("fcm_tokens").delete().eq("user_id", userId);
              await supabase.from("workers").update({ fcm_token: null }).eq("user_id", userId);
            }
            
            return { user_id: userId, worker_name: workerName, success: false, error_code: errorCode, error: result.error?.message };
          }

          console.log(`✅ FCM sent to ${workerName} (${userId}) — messageId: ${result.name}`);
          return { user_id: userId, worker_name: workerName, success: true, messageId: result.name };
        } catch (error) {
          console.error(`❌ Exception sending to ${workerName} (${userId}):`, error);
          return { user_id: userId, worker_name: workerName, success: false, error: String(error) };
        }
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`📊 FCM SUMMARY: ${successCount}/${results.length} sent (${bookingType} booking ${bookingId})`);
    if (failureCount > 0) {
      const failedWorkers = results.filter(r => !r.success).map(r => `${r.worker_name}:${r.error_code || 'ERR'}`);
      console.error(`❌ Failed: ${failedWorkers.join(", ")}`);
    }
    console.log("═══════════════════════════════════════════════════════════");

    return new Response(JSON.stringify({ 
      success: successCount > 0,
      firebase_project: projectId,
      booking_id: bookingId,
      booking_type: bookingType,
      sent: successCount,
      failed: failureCount,
      total_tokens: tokenMap.size,
      missing_tokens: missingTokenWorkers.length,
      results 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Error in send-fcm:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function getAccessToken(serviceAccount: any): Promise<string> {
  const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  
  const now = Math.floor(Date.now() / 1000);
  const jwtClaimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  
  const jwtClaimSetEncoded = btoa(JSON.stringify(jwtClaimSet))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const signatureInput = `${jwtHeader}.${jwtClaimSetEncoded}`;
  
  // Normalize private key newlines
  const privateKeyRaw = String(serviceAccount.private_key || "");
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;

  const pemContents = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/[\r\n\s]/g, "");

  const decodeBase64ToBytes = (b64: string): Uint8Array => {
    const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    try {
      const bin = atob(padded);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch {
      throw new Error(
        "Invalid Firebase service account private_key. Re-check FIREBASE_SERVICE_ACCOUNT_KEY."
      );
    }
  };

  const pkcs8Bytes = decodeBase64ToBytes(pemContents);
  const pkcs8 = pkcs8Bytes.buffer.slice(
    pkcs8Bytes.byteOffset,
    pkcs8Bytes.byteOffset + pkcs8Bytes.byteLength
  ) as ArrayBuffer;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const signatureEncoded = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signatureInput}.${signatureEncoded}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await response.json();
  if (!tokenData.access_token) {
    console.error("❌ Failed to get OAuth2 access token:", tokenData);
    throw new Error("Failed to get Firebase access token");
  }
  return tokenData.access_token;
}
