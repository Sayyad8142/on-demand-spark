/**
 * Shared Firebase verification helper
 * 
 * Uses Firebase Admin SDK to securely verify ID tokens.
 * This prevents fake tokens and ensures production-grade security.
 */

import { initializeApp, cert, getApps } from "https://esm.sh/firebase-admin@12.0.0/app";
import { getAuth } from "https://esm.sh/firebase-admin@12.0.0/auth";

export interface DecodedFirebaseToken {
  uid: string;
  phone_number?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

let initialized = false;

export async function verifyFirebaseToken(idToken: string): Promise<DecodedFirebaseToken> {
  // Initialize Firebase Admin if not already initialized
  if (!initialized && !getApps().length) {
    const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
    const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
    const privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY")?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      console.error("❌ Missing Firebase Admin credentials");
      throw new Error("Firebase Admin SDK not configured");
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    initialized = true;
    console.log("✅ Firebase Admin SDK initialized");
  }

  // Verify the token using Firebase Admin SDK
  const decodedToken = await getAuth().verifyIdToken(idToken);
  
  console.log("✅ Firebase token verified for UID:", decodedToken.uid);
  
  return {
    uid: decodedToken.uid,
    phone_number: decodedToken.phone_number,
    email: decodedToken.email,
    name: decodedToken.name,
  };
}
