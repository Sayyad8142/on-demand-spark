// @ts-nocheck
import { initializeApp } from "firebase/app";
import { getAuth, RecaptchaVerifier } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDDYRSiCCRslPT_vJ4xhMyEfQkOk_n2eH4",
  authDomain: "didi-now-worker-7b4cb.firebaseapp.com",
  projectId: "didi-now-worker-7b4cb",
  storageBucket: "didi-now-worker-7b4cb.firebasestorage.app",
  messagingSenderId: "993479758920",
  appId: "1:993479758920:web:1550b0d6c69afa10f6747d",
  measurementId: "G-RM3H6RH1E0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

let verifier: any = null;

export function getRecaptchaVerifier(containerId: string) {
  const el = document.getElementById(containerId);
  if (!el) throw new Error(`reCAPTCHA container #${containerId} not found`);
  if (!verifier) verifier = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
  return verifier;
}

export function clearRecaptchaVerifier() {
  try { verifier?.clear?.(); } catch {}
  verifier = null;
}
