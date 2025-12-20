package app.didisnow.worker;

import android.app.Activity;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseException;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.auth.PhoneAuthCredential;
import com.google.firebase.auth.PhoneAuthOptions;
import com.google.firebase.auth.PhoneAuthProvider;

import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "FirebasePhoneAuth")
public class FirebasePhoneAuthPlugin extends Plugin {
  private static final String TAG = "FirebasePhoneAuth";

  private String lastVerificationId = null;
  private PhoneAuthProvider.ForceResendingToken lastResendToken = null;

  @PluginMethod
  public void sendOtp(PluginCall call) {
    String phone = call.getString("phone", null);
    if (phone == null || phone.isEmpty()) {
      call.reject("missing phone");
      return;
    }

    Activity activity = getActivity();
    if (activity == null) {
      call.reject("activity not available");
      return;
    }

    Log.d(TAG, "📲 sendOtp phone=" + phone);

    call.setKeepAlive(true);

    PhoneAuthProvider.OnVerificationStateChangedCallbacks callbacks =
      new PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
        @Override
        public void onVerificationCompleted(PhoneAuthCredential credential) {
          Log.d(TAG, "✅ onVerificationCompleted (auto)");
          // Instant verification or auto-retrieval succeeded.
          FirebaseAuth.getInstance().signInWithCredential(credential)
            .addOnSuccessListener(result -> {
              FirebaseUser user = result.getUser();
              if (user == null) {
                call.reject("no user after auto verification");
                return;
              }
              user.getIdToken(true)
                .addOnSuccessListener(tokenResult -> {
                  JSObject ret = new JSObject();
                  ret.put("autoVerified", true);
                  ret.put("idToken", tokenResult.getToken());
                  call.resolve(ret);
                })
                .addOnFailureListener(e -> {
                  Log.e(TAG, "❌ getIdToken failed", e);
                  call.reject("getIdToken failed: " + e.getMessage());
                });
            })
            .addOnFailureListener(e -> {
              Log.e(TAG, "❌ signInWithCredential failed", e);
              call.reject("signInWithCredential failed: " + e.getMessage());
            });
        }

        @Override
        public void onVerificationFailed(FirebaseException e) {
          Log.e(TAG, "❌ onVerificationFailed", e);
          call.reject(e.getMessage() != null ? e.getMessage() : "verification failed");
        }

        @Override
        public void onCodeSent(String verificationId, PhoneAuthProvider.ForceResendingToken token) {
          Log.d(TAG, "📩 onCodeSent verificationId=" + (verificationId != null ? verificationId.substring(0, Math.min(8, verificationId.length())) : "null") + "...");
          lastVerificationId = verificationId;
          lastResendToken = token;

          JSObject ret = new JSObject();
          ret.put("autoVerified", false);
          ret.put("verificationId", verificationId);
          call.resolve(ret);
        }
      };

    PhoneAuthOptions.Builder builder = PhoneAuthOptions.newBuilder(FirebaseAuth.getInstance())
      .setPhoneNumber(phone)
      .setTimeout(60L, TimeUnit.SECONDS)
      .setActivity(activity)
      .setCallbacks(callbacks);

    // If we have a previous token, allow resends without restarting the whole flow.
    if (lastResendToken != null) {
      builder.setForceResendingToken(lastResendToken);
    }

    PhoneAuthProvider.verifyPhoneNumber(builder.build());
  }

  @PluginMethod
  public void verifyOtp(PluginCall call) {
    String otp = call.getString("otp", null);
    String verificationId = call.getString("verificationId", lastVerificationId);

    if (otp == null || otp.isEmpty()) {
      call.reject("missing otp");
      return;
    }
    if (verificationId == null || verificationId.isEmpty()) {
      call.reject("missing verificationId");
      return;
    }

    Log.d(TAG, "🔎 verifyOtp verificationId=" + verificationId.substring(0, Math.min(8, verificationId.length())) + "...");

    PhoneAuthCredential credential = PhoneAuthProvider.getCredential(verificationId, otp);
    FirebaseAuth.getInstance().signInWithCredential(credential)
      .addOnSuccessListener(result -> {
        FirebaseUser user = result.getUser();
        if (user == null) {
          call.reject("no user after verification");
          return;
        }

        user.getIdToken(true)
          .addOnSuccessListener(tokenResult -> {
            JSObject ret = new JSObject();
            ret.put("idToken", tokenResult.getToken());
            call.resolve(ret);
          })
          .addOnFailureListener(e -> {
            Log.e(TAG, "❌ getIdToken failed", e);
            call.reject("getIdToken failed: " + e.getMessage());
          });
      })
      .addOnFailureListener(e -> {
        Log.e(TAG, "❌ verifyOtp signInWithCredential failed", e);
        call.reject(e.getMessage() != null ? e.getMessage() : "otp verification failed");
      });
  }

  @PluginMethod
  public void signOut(PluginCall call) {
    try {
      FirebaseAuth.getInstance().signOut();
      JSObject ret = new JSObject();
      ret.put("ok", true);
      call.resolve(ret);
    } catch (Exception e) {
      Log.e(TAG, "❌ signOut failed", e);
      call.reject("signOut failed: " + e.getMessage());
    }
  }
}
