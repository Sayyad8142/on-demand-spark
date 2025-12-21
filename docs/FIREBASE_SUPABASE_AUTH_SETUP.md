# Firebase + Supabase Third-Party Auth Setup

Supabase Third-Party Auth with Firebase requires Firebase users to have specific custom claims in their JWT token.

## Required Custom Claims

Supabase expects Firebase ID tokens to include:
```json
{
  "role": "authenticated",
  "aud": "authenticated"
}
```

Without these claims, Supabase will reject the token with error:
> "custom oidc provider 'firebase' not allowed"

---

## Step 1: Create Firebase Cloud Function for NEW Users

Create a Cloud Function that automatically sets claims when users sign up.

### File: `functions/index.js`

```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

/**
 * Automatically set Supabase-compatible claims for new Firebase Auth users.
 * This runs on every user creation (OTP, email, social login, etc.)
 */
exports.setSupabaseClaims = functions.auth.user().onCreate(async (user) => {
  try {
    await admin.auth().setCustomUserClaims(user.uid, {
      role: "authenticated",
      aud: "authenticated",
    });
    console.log(`✅ Supabase claims set for new user: ${user.uid} (${user.phoneNumber || user.email})`);
  } catch (error) {
    console.error(`❌ Failed to set claims for user ${user.uid}:`, error);
  }
});
```

### Deploy the function:
```bash
cd functions
npm install firebase-functions firebase-admin
firebase deploy --only functions
```

---

## Step 2: Backfill Claims for EXISTING Users

Run this one-time script to add claims to all existing users.

### File: `scripts/backfill-claims.js`

```javascript
const admin = require("firebase-admin");

// Initialize with service account
const serviceAccount = require("./path-to-your-service-account-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function backfillClaims(nextPageToken) {
  try {
    const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
    
    console.log(`Processing ${listUsersResult.users.length} users...`);
    
    for (const user of listUsersResult.users) {
      try {
        // Get existing claims and merge
        const existingClaims = user.customClaims || {};
        await admin.auth().setCustomUserClaims(user.uid, {
          ...existingClaims,
          role: "authenticated",
          aud: "authenticated",
        });
        console.log(`✅ Updated: ${user.uid} (${user.phoneNumber || user.email || 'anonymous'})`);
      } catch (err) {
        console.error(`❌ Failed for ${user.uid}:`, err.message);
      }
    }
    
    // Process next page if exists
    if (listUsersResult.pageToken) {
      console.log("Fetching next page...");
      await backfillClaims(listUsersResult.pageToken);
    } else {
      console.log("✅ All users processed!");
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run
console.log("Starting backfill of Supabase claims...");
backfillClaims();
```

### Run the script:
```bash
node scripts/backfill-claims.js
```

---

## Step 3: Important - Token Refresh Required

After claims are added, users **MUST sign out and sign in again** to get a new Firebase ID token with the claims.

The app handles this automatically - on next login, Firebase issues a fresh token with the claims.

---

## How the App Uses This

The app authenticates with Supabase using:

```typescript
// Get Firebase ID token (contains custom claims)
const idToken = await firebaseUser.getIdToken(true); // force refresh

// Sign in to Supabase using Third-Party Auth
const { data, error } = await supabase.auth.signInWithIdToken({
  provider: "firebase",
  token: idToken,
});
```

This creates a Supabase session linked to the Firebase user.

---

## Verification

To verify claims are set correctly, add this to your Firebase function or script:

```javascript
const user = await admin.auth().getUser(uid);
console.log("Custom claims:", user.customClaims);
// Should show: { role: "authenticated", aud: "authenticated" }
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| "custom oidc provider 'firebase' not allowed" | Missing claims OR Third-Party Auth not enabled | Check Supabase Dashboard → Auth → Third-Party Auth → Firebase is ENABLED |
| Token works but no claims | User signed up before Cloud Function deployed | Run backfill script, then user must re-login |
| Claims set but still failing | Token not refreshed | Call `getIdToken(true)` to force refresh |

---

## Firebase Project Details

- **Firebase Project ID**: `didi-now-worker-7b4cb`
- **Supabase Project ID**: `paywwbuqycovjopryele`
