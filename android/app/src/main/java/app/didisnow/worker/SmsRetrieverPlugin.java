package app.didisnow.worker;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.phone.SmsRetriever;
import com.google.android.gms.auth.api.phone.SmsRetrieverClient;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Status;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "SmsRetrieverPlugin")
public class SmsRetrieverPlugin extends Plugin {
    
    private static final String TAG = "SmsRetrieverPlugin";
    private BroadcastReceiver smsReceiver;
    private boolean isWatching = false;

    @PluginMethod
    public void startWatching(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        Log.d(TAG, "📱 Starting SMS Retriever...");

        // Start SMS Retriever
        SmsRetrieverClient client = SmsRetriever.getClient(activity);
        client.startSmsRetriever().addOnSuccessListener(aVoid -> {
            isWatching = true;
            Log.d(TAG, "✅ SMS Retriever started successfully");
            
            // Register broadcast receiver
            if (smsReceiver != null) {
                try {
                    activity.unregisterReceiver(smsReceiver);
                } catch (Exception e) {
                    // Ignore
                }
            }
            
            smsReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    Log.d(TAG, "📨 BroadcastReceiver onReceive called");
                    
                    if (SmsRetriever.SMS_RETRIEVED_ACTION.equals(intent.getAction())) {
                        Bundle extras = intent.getExtras();
                        if (extras == null) {
                            Log.e(TAG, "❌ No extras in intent");
                            return;
                        }
                        
                        Status status = (Status) extras.get(SmsRetriever.EXTRA_STATUS);
                        
                        if (status != null) {
                            Log.d(TAG, "📱 SMS Status code: " + status.getStatusCode());
                            
                            switch (status.getStatusCode()) {
                                case CommonStatusCodes.SUCCESS:
                                    // Get SMS message contents
                                    String message = (String) extras.get(SmsRetriever.EXTRA_SMS_MESSAGE);
                                    Log.d(TAG, "📱 SMS received: " + message);
                                    
                                    if (message != null) {
                                        // Extract 6-digit OTP
                                        String otp = extractOtp(message);
                                        if (otp != null) {
                                            Log.d(TAG, "✅ OTP extracted: " + otp);
                                            
                                            // Notify JS layer
                                            JSObject ret = new JSObject();
                                            ret.put("message", message);
                                            ret.put("otp", otp);
                                            notifyListeners("smsReceived", ret);
                                        } else {
                                            Log.w(TAG, "⚠️ No OTP found in message");
                                            JSObject ret = new JSObject();
                                            ret.put("message", message);
                                            notifyListeners("smsReceived", ret);
                                        }
                                    }
                                    break;
                                case CommonStatusCodes.TIMEOUT:
                                    Log.w(TAG, "⚠️ SMS Retriever timeout");
                                    JSObject timeout = new JSObject();
                                    timeout.put("error", "Timeout");
                                    notifyListeners("smsError", timeout);
                                    break;
                                default:
                                    Log.w(TAG, "⚠️ Unknown status: " + status.getStatusCode());
                                    break;
                            }
                        }
                    }
                }
            };

            IntentFilter filter = new IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                activity.registerReceiver(smsReceiver, filter, Context.RECEIVER_EXPORTED);
            } else {
                activity.registerReceiver(smsReceiver, filter);
            }

            JSObject ret = new JSObject();
            ret.put("status", "started");
            call.resolve(ret);
        }).addOnFailureListener(e -> {
            Log.e(TAG, "❌ Failed to start SMS Retriever: " + e.getMessage());
            call.reject("Failed to start SMS Retriever: " + e.getMessage());
        });
    }
    
    private String extractOtp(String message) {
        // Try to find 6-digit OTP in the message
        Pattern pattern = Pattern.compile("\\b(\\d{6})\\b");
        Matcher matcher = pattern.matcher(message);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return null;
    }

    @PluginMethod
    public void stopWatching(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null && smsReceiver != null) {
            try {
                activity.unregisterReceiver(smsReceiver);
                Log.d(TAG, "✅ SMS Retriever stopped");
            } catch (Exception e) {
                Log.w(TAG, "Receiver was not registered");
            }
            smsReceiver = null;
        }
        isWatching = false;
        
        JSObject ret = new JSObject();
        ret.put("status", "stopped");
        call.resolve(ret);
    }
    
    @PluginMethod
    public void getAppHash(PluginCall call) {
        // Helper to get app hash for SMS format
        try {
            Activity activity = getActivity();
            if (activity == null) {
                call.reject("Activity not available");
                return;
            }
            
            AppSignatureHelper helper = new AppSignatureHelper(activity);
            java.util.ArrayList<String> signatures = helper.getAppSignatures();
            
            JSObject ret = new JSObject();
            if (!signatures.isEmpty()) {
                ret.put("hash", signatures.get(0));
                Log.d(TAG, "📱 App hash: " + signatures.get(0));
            } else {
                ret.put("hash", "");
            }
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "❌ Error getting app hash: " + e.getMessage());
            call.reject("Error getting app hash: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (smsReceiver != null) {
            try {
                getActivity().unregisterReceiver(smsReceiver);
            } catch (Exception e) {
                // Receiver was not registered
            }
        }
        super.handleOnDestroy();
    }
}
