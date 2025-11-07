package app.didisnow.worker;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.phone.SmsRetriever;
import com.google.android.gms.auth.api.phone.SmsRetrieverClient;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Status;

@CapacitorPlugin(name = "SmsRetrieverPlugin")
public class SmsRetrieverPlugin extends Plugin {
    
    private BroadcastReceiver smsReceiver;
    private boolean isWatching = false;

    @PluginMethod
    public void startWatching(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        // Start SMS Retriever
        SmsRetrieverClient client = SmsRetriever.getClient(activity);
        client.startSmsRetriever().addOnSuccessListener(aVoid -> {
            isWatching = true;
            
            // Register broadcast receiver
            smsReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (SmsRetriever.SMS_RETRIEVED_ACTION.equals(intent.getAction())) {
                        Bundle extras = intent.getExtras();
                        Status status = (Status) extras.get(SmsRetriever.EXTRA_STATUS);
                        
                        if (status != null) {
                            switch (status.getStatusCode()) {
                                case CommonStatusCodes.SUCCESS:
                                    // Get SMS message contents
                                    String message = (String) extras.get(SmsRetriever.EXTRA_SMS_MESSAGE);
                                    
                                    if (message != null) {
                                        // Notify JS layer
                                        JSObject ret = new JSObject();
                                        ret.put("message", message);
                                        notifyListeners("smsReceived", ret);
                                    }
                                    break;
                                case CommonStatusCodes.TIMEOUT:
                                    JSObject timeout = new JSObject();
                                    timeout.put("error", "Timeout");
                                    notifyListeners("smsError", timeout);
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
            call.reject("Failed to start SMS Retriever: " + e.getMessage());
        });
    }

    @PluginMethod
    public void stopWatching(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null && smsReceiver != null) {
            try {
                activity.unregisterReceiver(smsReceiver);
            } catch (Exception e) {
                // Receiver was not registered
            }
            smsReceiver = null;
        }
        isWatching = false;
        
        JSObject ret = new JSObject();
        ret.put("status", "stopped");
        call.resolve(ret);
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
