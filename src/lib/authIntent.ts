// Shared (no-circular) flags related to auth behavior.
// Kept in a separate module so storage/session code can safely depend on it.

let intentionalLogout = false;

export function setIntentionalLogoutFlag(value: boolean) {
  intentionalLogout = value;
}

export function getIntentionalLogoutFlag() {
  return intentionalLogout;
}
