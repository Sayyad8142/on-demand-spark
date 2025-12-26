import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';

// Firebase configuration from google-services.json
const firebaseConfig = {
  apiKey: "AIzaSyB5BxScrhv7MjYmKbY3DILVvei7NOjft0Q",
  authDomain: "didi-now-worker-7b4cb.firebaseapp.com",
  projectId: "didi-now-worker-7b4cb",
  storageBucket: "didi-now-worker-7b4cb.firebasestorage.app",
  messagingSenderId: "993479758920",
  appId: "1:993479758920:android:c7bcf1f203ef4e0df6747d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// For web - invisible reCAPTCHA
let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;

export const setupRecaptcha = (buttonId: string) => {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
  }
  
  recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
    size: 'invisible',
    callback: () => {
      console.log('📱 reCAPTCHA solved');
    },
    'expired-callback': () => {
      console.log('📱 reCAPTCHA expired');
    }
  });
  
  return recaptchaVerifier;
};

export const sendOtpWeb = async (phone: string, buttonId: string): Promise<boolean> => {
  try {
    const verifier = setupRecaptcha(buttonId);
    confirmationResult = await signInWithPhoneNumber(auth, phone, verifier);
    console.log('✅ OTP sent via Firebase Web');
    return true;
  } catch (error) {
    console.error('❌ Firebase sendOtp error:', error);
    throw error;
  }
};

export const verifyOtpWeb = async (otp: string): Promise<any> => {
  if (!confirmationResult) {
    throw new Error('No OTP session found. Please request OTP again.');
  }
  
  try {
    const result = await confirmationResult.confirm(otp);
    console.log('✅ OTP verified via Firebase Web');
    return result.user;
  } catch (error) {
    console.error('❌ Firebase verifyOtp error:', error);
    throw error;
  }
};

export const getFirebaseIdToken = async (): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    return await user.getIdToken(true);
  } catch (error) {
    console.error('❌ Error getting Firebase ID token:', error);
    return null;
  }
};

export const signOutFirebase = async (): Promise<void> => {
  await auth.signOut();
};

export default app;
