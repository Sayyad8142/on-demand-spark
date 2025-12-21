/**
 * Shared Firebase verification helper
 * 
 * Verifies Firebase ID tokens by calling Google's public token verification endpoint.
 * This is a lightweight alternative that doesn't require firebase-admin SDK.
 */

export interface DecodedFirebaseToken {
  uid: string;
  phone_number?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID");

export async function verifyFirebaseToken(idToken: string): Promise<DecodedFirebaseToken> {
  if (!FIREBASE_PROJECT_ID) {
    console.error("❌ FIREBASE_PROJECT_ID not configured");
    throw new Error("Firebase not configured");
  }

  // Verify token with Google's tokeninfo endpoint
  const response = await fetch(
    `https://www.googleapis.com/oauth1/v3/tokeninfo?id_token=${idToken}`
  );

  if (!response.ok) {
    // Try Firebase's secure token verification endpoint
    const verifyResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${Deno.env.get("FIREBASE_WEB_API_KEY")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!verifyResponse.ok) {
      console.error("❌ Token verification failed");
      throw new Error("Invalid Firebase token");
    }

    const data = await verifyResponse.json();
    const user = data.users?.[0];

    if (!user) {
      throw new Error("User not found");
    }

    console.log("✅ Firebase token verified for UID:", user.localId);

    return {
      uid: user.localId,
      phone_number: user.phoneNumber,
      email: user.email,
      name: user.displayName,
    };
  }

  const tokenInfo = await response.json();

  // Verify the audience matches our project
  if (tokenInfo.aud !== FIREBASE_PROJECT_ID) {
    console.error("❌ Token audience mismatch");
    throw new Error("Invalid token audience");
  }

  console.log("✅ Firebase token verified for UID:", tokenInfo.sub);

  return {
    uid: tokenInfo.sub,
    phone_number: tokenInfo.phone_number,
    email: tokenInfo.email,
    name: tokenInfo.name,
  };
}
