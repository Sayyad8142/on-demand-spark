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
    if (_firebaseProjectId !== "didi-now-worker-7b4cb") {
      console.error(`⚠️ SENDER_ID WARNING: project_id "${_firebaseProjectId}" does NOT match worker app project`);
    }
  } catch (e) {
    console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", e);
  }
} else {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT_KEY secret is NOT configured");
}

// FCM error codes that mean the token is permanently invalid
const INVALID_TOKEN_ERRORS = new Set([
  'UNREGISTERED', 'INVALID_ARGUMENT', 'SENDER_ID_MISMATCH', 'NOT_FOUND'
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("📤 send-fcm invoked");
    console.log("═══════════════════════════════════════════════════════════");

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const payload: FCMPayload = await req.json();
    const { workerIds, title, body, data } = payload;

    if (!Array.isArray(workerIds) || workerIds.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid workerIds" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!workerIds.every(id => uuidRegex.test(id))) {
      return new Response(JSON.stringify({ error: "Invalid worker ID format" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!title || !body) {
      return new Response(JSON.stringify({ error: "Missing title or body" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const bookingId = data?.bookingId || data?.booking_id || "unknown";
    const bookingType = data?.booking_type || "unknown";
    console.log(`📋 Booking: ${bookingId} (${bookingType})`);
    console.log(`👷 Worker IDs requested: [${workerIds.join(", ")}]`);

    if (!_serviceAccount) {
      return new Response(
        JSON.stringify({ error: "Firebase not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const projectId = _firebaseProjectId!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── Token lookup: workers.fcm_token is source of truth ───
    const { data: workersData, error: workerTokenError } = await supabase
      .from("workers")
      .select("id, user_id, fcm_token, fcm_token_status, full_name, payout_ready")
      .or(`user_id.in.(${workerIds.map(id => `"${id}"`).join(",")}),id.in.(${workerIds.map(id => `"${id}"`).join(",")})`)

    if (workerTokenError) console.error("❌ Error fetching worker tokens:", workerTokenError);

    // Build token map from workers table only (source of truth)
    const tokenMap = new Map<string, { token: string; source: string; workerName: string; workerId: string }>();
    const skippedWorkers: { id: string; name: string; reason: string }[] = [];
    
    if (workersData) {
      for (const row of workersData) {
        const targetId = row.user_id || row.id;
        
        if (row.payout_ready !== true) {
          skippedWorkers.push({ id: targetId, name: row.full_name || "unknown", reason: "payout_not_ready" });
          continue;
        }
        if (!row.fcm_token) {
          skippedWorkers.push({ id: targetId, name: row.full_name || "unknown", reason: "no_token" });
          continue;
        }
        if (row.fcm_token_status === 'invalid') {
          skippedWorkers.push({ id: targetId, name: row.full_name || "unknown", reason: "token_invalid" });
          continue;
        }
        
        tokenMap.set(targetId, { 
          token: row.fcm_token, 
          source: "workers.fcm_token",
          workerName: row.full_name || "unknown",
          workerId: row.id,
        });
      }
    }

    // Also check fcm_tokens table as fallback for workers with missing token
    if (skippedWorkers.some(w => w.reason === 'no_token')) {
      const missingIds = skippedWorkers.filter(w => w.reason === 'no_token').map(w => w.id);
      const { data: fcmFallback } = await supabase
        .from("fcm_tokens")
        .select("token, user_id")
        .in("user_id", missingIds);
      
      if (fcmFallback) {
        for (const row of fcmFallback) {
          if (row.token && !tokenMap.has(row.user_id)) {
            // Found in fallback — use it and also update workers table
            const workerRow = workersData?.find(w => (w.user_id || w.id) === row.user_id);
            tokenMap.set(row.user_id, {
              token: row.token,
              source: "fcm_tokens_fallback",
              workerName: workerRow?.full_name || "unknown",
              workerId: workerRow?.id || row.user_id,
            });
            // Promote to workers table for next time
            if (workerRow) {
              await supabase.from("workers").update({
                fcm_token: row.token,
                fcm_token_status: 'active',
                fcm_token_updated_at: new Date().toISOString(),
              }).eq("id", workerRow.id);
            }
            // Remove from skipped
            const idx = skippedWorkers.findIndex(w => w.id === row.user_id);
            if (idx >= 0) skippedWorkers.splice(idx, 1);
          }
        }
      }
    }

    console.log(`📊 Token lookup: ${tokenMap.size} valid, ${skippedWorkers.length} skipped`);
    if (skippedWorkers.length > 0) {
      console.warn(`⚠️ Skipped workers: ${skippedWorkers.map(w => `${w.name}(${w.reason})`).join(", ")}`);
    }

    if (tokenMap.size === 0) {
      return new Response(
        JSON.stringify({ error: "No valid tokens found", workerIds, skipped: skippedWorkers }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getAccessToken(_serviceAccount);

    // ─── Send to each worker ───
    const results = await Promise.all(
      Array.from(tokenMap.entries()).map(async ([userId, { token, source, workerName, workerId }]) => {
        try {
          const isBookingAlert = data?.type === "BOOKING_ALERT";
          
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
            prealert_sent: String(data?.prealert_sent || "false"),
            request_status: String(data?.request_status || ""),
            title: String(title),
            body: String(body),
          };

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

          console.log(`📤 Sending to ${workerName} (${userId}), token: ${token.substring(0, 20)}..., src: ${source}`);

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
            
            // ─── Token health: mark invalid on permanent errors ───
            const isPermanentError = INVALID_TOKEN_ERRORS.has(errorCode) || 
              result.error?.code === 404 ||
              result.error?.details?.some((d: any) => INVALID_TOKEN_ERRORS.has(d.errorCode));

            if (isPermanentError) {
              console.log(`🗑️ Marking token INVALID for ${workerName} (${workerId}): ${errorCode}`);
              
              // Mark token as invalid (don't delete — keep for debugging)
              await supabase.from("workers").update({
                fcm_token_status: 'invalid',
                fcm_last_fail_at: new Date().toISOString(),
                fcm_last_fail_reason: errorCode,
              }).eq("id", workerId);
              
              // Also clean fcm_tokens fallback
              await supabase.from("fcm_tokens").delete().eq("user_id", userId);
            } else {
              // Transient error — just log failure time
              await supabase.from("workers").update({
                fcm_last_fail_at: new Date().toISOString(),
                fcm_last_fail_reason: errorCode,
              }).eq("id", workerId);
            }
            
            return { user_id: userId, worker_name: workerName, success: false, error_code: errorCode, error: result.error?.message, permanent: isPermanentError };
          }

          console.log(`✅ FCM sent to ${workerName} (${userId}) — messageId: ${result.name}`);
          
          // ─── Token health: update last successful send ───
          await supabase.from("workers").update({
            fcm_last_send_at: new Date().toISOString(),
            fcm_token_status: 'active', // Confirm active on success
          }).eq("id", workerId);
          
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
      skipped_workers: skippedWorkers,
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
      throw new Error("Invalid Firebase service account private_key.");
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
