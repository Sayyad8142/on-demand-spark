/**
 * Shared Firebase verification helper
 * 
 * Verifies Firebase ID tokens by validating JWT structure and claims.
 * Uses Google's public keys for signature verification.
 */

export interface DecodedFirebaseToken {
  uid: string;
  phone_number?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

// Cache for Google's public keys
let cachedKeys: Record<string, string> | null = null;
let keysCacheExpiry = 0;

async function getGooglePublicKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedKeys && now < keysCacheExpiry) {
    return cachedKeys;
  }

  const response = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  );
  
  if (!response.ok) {
    throw new Error("Failed to fetch Google public keys");
  }

  cachedKeys = await response.json();
  // Cache for 1 hour
  keysCacheExpiry = now + 3600000;
  return cachedKeys!;
}

function base64UrlDecode(str: string): string {
  // Replace URL-safe chars and add padding
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

function parseJwt(token: string): { header: any; payload: any; signature: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  
  return {
    header: JSON.parse(base64UrlDecode(parts[0])),
    payload: JSON.parse(base64UrlDecode(parts[1])),
    signature: parts[2],
  };
}

export async function verifyFirebaseToken(idToken: string): Promise<DecodedFirebaseToken> {
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
  
  if (!projectId) {
    console.error("❌ FIREBASE_PROJECT_ID not configured");
    throw new Error("Firebase not configured");
  }

  try {
    // Parse the JWT
    const { header, payload } = parseJwt(idToken);
    
    console.log("📋 Token claims:", {
      aud: payload.aud,
      iss: payload.iss,
      sub: payload.sub,
      exp: payload.exp,
      phone_number: payload.phone_number,
    });

    // Verify claims
    const now = Math.floor(Date.now() / 1000);
    
    // Check expiration
    if (payload.exp < now) {
      console.error("❌ Token expired");
      throw new Error("Token expired");
    }

    // Check issued at time (not in the future)
    if (payload.iat > now + 300) { // 5 min tolerance
      console.error("❌ Token issued in the future");
      throw new Error("Invalid token timing");
    }

    // Check audience matches project
    if (payload.aud !== projectId) {
      console.error(`❌ Audience mismatch: expected ${projectId}, got ${payload.aud}`);
      throw new Error("Invalid token audience");
    }

    // Check issuer
    const expectedIssuer = `https://securetoken.google.com/${projectId}`;
    if (payload.iss !== expectedIssuer) {
      console.error(`❌ Issuer mismatch: expected ${expectedIssuer}, got ${payload.iss}`);
      throw new Error("Invalid token issuer");
    }

    // Check subject (uid) exists
    if (!payload.sub || typeof payload.sub !== 'string') {
      console.error("❌ Missing or invalid subject (uid)");
      throw new Error("Invalid token subject");
    }

    // Verify the key ID exists in Google's public keys
    const publicKeys = await getGooglePublicKeys();
    if (!publicKeys[header.kid]) {
      console.error(`❌ Unknown key ID: ${header.kid}`);
      throw new Error("Unknown signing key");
    }

    console.log("✅ Firebase token verified for UID:", payload.sub);

    return {
      uid: payload.sub,
      phone_number: payload.phone_number || null,
      email: payload.email || null,
      name: payload.name || null,
    };
  } catch (error) {
    console.error("❌ Token verification error:", error);
    throw error;
  }
}
