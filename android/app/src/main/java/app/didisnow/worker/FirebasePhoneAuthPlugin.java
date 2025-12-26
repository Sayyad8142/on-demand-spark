package app.didisnow.worker;

import android.util.Log;
import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.auth.PhoneAuthCredential;
import com.google.firebase.auth.PhoneAuthOptions;
import com.google.firebase.auth.PhoneAuthProvider;

import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "FirebasePhoneAuth")
public class FirebasePhoneAuthPlugin extends Plugin {

    private static final String TAG = "FirebasePhoneAuth";
    private FirebaseAuth mAuth;
    private String mVerificationId;
    private PhoneAuthProvider.ForceResendingToken mResendToken;
    private PluginCall pendingCall;

    @Override
    public void load() {
        super.load();
        if (FirebaseApp.getApps(getContext()).isEmpty()) {
            FirebaseApp.initializeApp(getContext());
        }
        mAuth = FirebaseAuth.getInstance();
        Log.d(TAG, "FirebasePhoneAuthPlugin loaded");
    }

    @PluginMethod
    public void sendOtp(PluginCall call) {
        String phone = call.getString("phone");
        if (phone == null || phone.isEmpty()) {
            call.reject("Phone number is required");
            return;
        }

        Log.d(TAG, "📱 Sending OTP to: " + phone);
        pendingCall = call;

        PhoneAuthOptions options = PhoneAuthOptions.newBuilder(mAuth)
                .setPhoneNumber(phone)
                .setTimeout(60L, TimeUnit.SECONDS)
                .setActivity(getActivity())
                .setCallbacks(new PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
                    @Override
                    public void onVerificationCompleted(@NonNull PhoneAuthCredential credential) {
                        Log.d(TAG, "✅ Auto-verification completed");
                        // Auto-verification - sign in directly
                        signInWithCredential(credential);
                    }

                    @Override
                    public void onVerificationFailed(@NonNull com.google.firebase.FirebaseException e) {
                        Log.e(TAG, "❌ Verification failed: " + e.getMessage());
                        if (pendingCall != null) {
                            pendingCall.reject("Verification failed: " + e.getMessage());
                            pendingCall = null;
                        }
                    }

                    @Override
                    public void onCodeSent(@NonNull String verificationId,
                                           @NonNull PhoneAuthProvider.ForceResendingToken token) {
                        Log.d(TAG, "📨 OTP code sent, verificationId: " + verificationId);
                        mVerificationId = verificationId;
                        mResendToken = token;

                        if (pendingCall != null) {
                            JSObject result = new JSObject();
                            result.put("success", true);
                            result.put("verificationId", verificationId);
                            pendingCall.resolve(result);
                            pendingCall = null;
                        }
                    }
                })
                .build();

        PhoneAuthProvider.verifyPhoneNumber(options);
    }

    @PluginMethod
    public void verifyOtp(PluginCall call) {
        String otp = call.getString("otp");
        String verificationId = call.getString("verificationId");

        // Use stored verificationId if not provided
        if (verificationId == null || verificationId.isEmpty()) {
            verificationId = mVerificationId;
        }

        if (verificationId == null || verificationId.isEmpty()) {
            call.reject("No verification ID. Please request OTP first.");
            return;
        }

        if (otp == null || otp.isEmpty()) {
            call.reject("OTP is required");
            return;
        }

        Log.d(TAG, "🔐 Verifying OTP: " + otp);
        pendingCall = call;

        PhoneAuthCredential credential = PhoneAuthProvider.getCredential(verificationId, otp);
        signInWithCredential(credential);
    }

    private void signInWithCredential(PhoneAuthCredential credential) {
        mAuth.signInWithCredential(credential)
                .addOnCompleteListener(getActivity(), task -> {
                    if (task.isSuccessful()) {
                        FirebaseUser user = task.getResult().getUser();
                        if (user != null) {
                            Log.d(TAG, "✅ Sign in successful, UID: " + user.getUid());
                            
                            // Get the ID token
                            user.getIdToken(true).addOnCompleteListener(tokenTask -> {
                                if (tokenTask.isSuccessful()) {
                                    String idToken = tokenTask.getResult().getToken();
                                    Log.d(TAG, "✅ Got ID token");

                                    JSObject result = new JSObject();
                                    result.put("success", true);
                                    result.put("uid", user.getUid());
                                    result.put("phone", user.getPhoneNumber());
                                    result.put("idToken", idToken);
                                    
                                    if (pendingCall != null) {
                                        pendingCall.resolve(result);
                                        pendingCall = null;
                                    }
                                } else {
                                    Log.e(TAG, "❌ Failed to get ID token");
                                    if (pendingCall != null) {
                                        pendingCall.reject("Failed to get ID token");
                                        pendingCall = null;
                                    }
                                }
                            });
                        }
                    } else {
                        Log.e(TAG, "❌ Sign in failed: " + task.getException());
                        if (pendingCall != null) {
                            pendingCall.reject("Sign in failed: " + 
                                (task.getException() != null ? task.getException().getMessage() : "Unknown error"));
                            pendingCall = null;
                        }
                    }
                });
    }

    @PluginMethod
    public void getCurrentUser(PluginCall call) {
        FirebaseUser user = mAuth.getCurrentUser();
        if (user != null) {
            user.getIdToken(true).addOnCompleteListener(task -> {
                if (task.isSuccessful()) {
                    JSObject result = new JSObject();
                    result.put("uid", user.getUid());
                    result.put("phone", user.getPhoneNumber());
                    result.put("idToken", task.getResult().getToken());
                    call.resolve(result);
                } else {
                    JSObject result = new JSObject();
                    result.put("uid", user.getUid());
                    result.put("phone", user.getPhoneNumber());
                    call.resolve(result);
                }
            });
        } else {
            JSObject result = new JSObject();
            result.put("uid", null);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        mAuth.signOut();
        mVerificationId = null;
        mResendToken = null;
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
}
