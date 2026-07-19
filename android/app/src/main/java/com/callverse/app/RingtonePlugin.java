package com.callverse.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.RingtoneManager;
import android.net.Uri;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Ringtone")
public class RingtonePlugin extends Plugin {

    private static final String PREF_NAME = "CallversePrefs";
    private static final String KEY_RINGTONE_URI = "custom_ringtone_uri";

    @PluginMethod
    public void pickRingtone(PluginCall call) {
        Intent intent = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_RINGTONE);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false);

        SharedPreferences prefs = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        String currentUri = prefs.getString(KEY_RINGTONE_URI, null);
        if (currentUri != null) {
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(currentUri));
        }

        startActivityForResult(call, intent, "ringtonePickResult");
    }

    @ActivityCallback
    private void ringtonePickResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() == Activity.RESULT_OK) {
            Intent data = result.getData();
            if (data != null) {
                Uri uri = data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
                if (uri != null) {
                    SharedPreferences prefs = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
                    prefs.edit().putString(KEY_RINGTONE_URI, uri.toString()).apply();
                    
                    JSObject ret = new JSObject();
                    ret.put("uri", uri.toString());
                    call.resolve(ret);
                    return;
                }
            }
        }
        
        call.reject("Ringtone picker was cancelled or failed");
    }

    @PluginMethod
    public void getCurrentRingtone(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        String currentUri = prefs.getString(KEY_RINGTONE_URI, null);
        
        JSObject ret = new JSObject();
        ret.put("uri", currentUri != null ? currentUri : "");
        call.resolve(ret);
    }

    @PluginMethod
    public void stopRingtone(PluginCall call) {
        if (CallMessagingService.currentRingtone != null) {
            CallMessagingService.currentRingtone.stop();
            CallMessagingService.currentRingtone = null;
        }
        
        // Also clear the notification if it's still showing
        android.app.NotificationManager nm = (android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancelAll();
        }
        
        call.resolve();
    }
}
