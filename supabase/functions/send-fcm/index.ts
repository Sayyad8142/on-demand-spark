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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("📤 send-fcm invoked");

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

    const bookingType = data?.booking_type || "unknown";
    console.log(`📤 Sending FCM to workers for ${bookingType} booking:`, workerIds);
    console.log(`📦 Incoming data payload:`, JSON.stringify(data, null, 2));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get FCM tokens for these workers
    const { data: tokens, error: tokenError } = await supabase
      .from("fcm_tokens")
      .select("token, user_id")
      .in("user_id", workerIds);

    if (tokenError) {
      console.error("Error fetching tokens:", tokenError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch tokens" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log("⚠️ No FCM tokens found for workers:", workerIds);
      return new Response(
        JSON.stringify({ error: "No tokens found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Found ${tokens.length} FCM tokens`);

    // Get Firebase service account key from secrets
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountJson) {
      console.error("❌ FIREBASE_SERVICE_ACCOUNT_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Firebase not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const projectId = serviceAccount.project_id;

    // Get OAuth2 access token
    const accessToken = await getAccessToken(serviceAccount);

    // Send to each token
    const results = await Promise.all(
      tokens.map(async ({ token, user_id }) => {
        try {
          const isBookingAlert = data?.type === "BOOKING_ALERT";
          
          // Build the data payload - ALL values must be strings for FCM
          const baseData: Record<string, string> = {
            type: String(data?.type || ""),
            bookingId: String(data?.bookingId || data?.booking_id || ""),
            booking_id: String(data?.bookingId || data?.booking_id || ""),
            booking_type: String(data?.booking_type || "instant"), // "instant" or "scheduled"
            customer: String(data?.customer || ""),
            community: String(data?.community || ""),
            serviceType: String(data?.serviceType || data?.service_type || ""),
            service_type: String(data?.serviceType || data?.service_type || ""),
            location: String(data?.location || ""),
            flat_no: String(data?.flat_no || ""), // Keep flat_no for overlay to read
            price: String(data?.price || "0"),
            scheduled_time: String(data?.scheduled_time || ""), // Human-readable
            scheduled_date: String(data?.scheduled_date || ""),
            scheduled_time_raw: String(data?.scheduled_time_raw || ""),
            title: String(title),
            body: String(body),
          };
          
          console.log(`📦 FCM data payload for ${user_id} (${bookingType} booking):`, JSON.stringify(baseData, null, 2));

          // CRITICAL: For BOOKING_ALERT, we MUST use data-only message (no notification block)
          // This ensures onMessageReceived() is ALWAYS called, even when app is in background
          // Both instant and scheduled bookings use the SAME data-only format
          const message = isBookingAlert
            ? {
                // ✅ DATA-ONLY payload - ensures MyFirebaseService.onMessageReceived() runs
                // This works for BOTH instant AND scheduled bookings
                message: {
                  token,
                  android: {
                    priority: "HIGH" as const,
                    ttl: "60s",
                  },
                  data: baseData,
                },
              }
            : {
                // Keep visible notification for other push types
                message: {
                  token,
                  notification: { title, body },
                  android: {
                    priority: "HIGH" as const,
                    ttl: "60s",
                  },
                  data: baseData,
                },
              };

          console.log(`🚀 Sending FCM message to ${user_id}:`);
          console.log(`   isBookingAlert: ${isBookingAlert}`);
          console.log(`   booking_type: ${baseData.booking_type}`);
          console.log(`   has_notification_block: ${!isBookingAlert}`);
          console.log(`   message structure:`, JSON.stringify(message, null, 2));

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
            console.error(`❌ FCM error for user ${user_id}:`, result);
            
            // If token is invalid/not registered, delete it from database
            if (result.error?.code === 404 || 
                result.error?.details?.some((d: any) => d.errorCode === "UNREGISTERED")) {
              console.log(`🗑️ Deleting stale FCM token for user ${user_id}`);
              await supabase.from("fcm_tokens").delete().eq("user_id", user_id);
            }
            
            return { user_id, success: false, error: result };
          }

          console.log(`✅ FCM sent successfully to user ${user_id}:`, result);
          return { user_id, success: true, messageId: result.name };
        } catch (error) {
          console.error(`❌ Error sending to user ${user_id}:`, error);
          return { user_id, success: false, error: String(error) };
        }
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    console.log(`📊 FCM Summary: Sent ${successCount}/${results.length} notifications (${bookingType} booking)`);

    return new Response(JSON.stringify({ 
      success: true,
      booking_type: bookingType,
      sent: successCount,
      failed: failureCount,
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
  
  // Import private key
  // NOTE: Some deployments store the private key with literal "\\n" sequences.
  // Normalize to real newlines before stripping PEM headers.
  const privateKeyRaw = String(serviceAccount.private_key || "");
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;

  const pemContents = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/[\r\n\s]/g, "");

  const decodeBase64ToBytes = (b64: string): Uint8Array => {
    // Be tolerant to url-safe base64 and missing padding
    const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    try {
      const bin = atob(padded);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch {
      throw new Error(
        "Invalid Firebase service account private_key. Re-check FIREBASE_SERVICE_ACCOUNT_KEY (must be the full JSON with a valid PEM private_key)."
      );
    }
  };

  // Base64-decode PKCS8 key material
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

  // Exchange JWT for access token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await response.json();
  return data.access_token;
}
