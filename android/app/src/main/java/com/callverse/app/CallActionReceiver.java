package com.callverse.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.Ringtone;
import android.net.Uri;
import android.os.Bundle;

/**
 * Handles Answer / Decline action buttons on incoming-call notifications.
 *
 * Uses a BroadcastReceiver instead of getService() because background service
 * starts are blocked on Android 8+ when the app process is dead — broadcast
 * receivers get a temporary exemption, so the buttons keep working even when
 * the app was swiped away.
 */
public class CallActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        Bundle extras = intent.getExtras();
        String callId = extras != null ? extras.getString("callId") : null;
        String callerId = extras != null ? extras.getString("callerId") : null;
        String callerName = extras != null ? extras.getString("callerName") : null;
        String callType = extras != null ? extras.getString("callType") : null;

        // Stop ringing + remove notification immediately, before any network I/O
        dismissCallUi(context, callId);

        final PendingResult result = goAsync();
        final String action = intent.getAction();

        new Thread(() -> {
            String serverUrl = context.getString(R.string.server_url);
            try {
                java.net.HttpURLConnection conn;
                switch (action) {
                    case "call_answer":
                        conn = (java.net.HttpURLConnection) new java.net.URL(
                                serverUrl + "/api/calls/accept/" + callId).openConnection();
                        conn.setRequestMethod("POST");
                        break;
                    case "call_decline":
                        conn = (java.net.HttpURLConnection) new java.net.URL(
                                serverUrl + "/api/calls/decline").openConnection();
                        conn.setRequestMethod("POST");
                        conn.setRequestProperty("Content-Type", "application/json");
                        conn.setDoOutput(true);
                        conn.getOutputStream().write(
                                ("{\"callId\":\"" + callId + "\"}").getBytes());
                        break;
                    default:
                        conn = null;
                }
                if (conn != null) {
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    conn.getResponseCode();
                    conn.disconnect();
                }
            } catch (Exception e) {
                android.util.Log.e("CallVerse", "Notification action failed", e);
            }

            // Open the in-app call screen (auto-accepts) after the accept request
            if ("call_answer".equals(action)) {
                openCallScreen(context, callerId, callId, callerName, callType, true);
            }
            result.finish();
        }).start();
    }

    /** Cancels the ringing notification and stops the ringtone. */
    static void dismissCallUi(Context context, String callId) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && callId != null) {
            int notifId = callId.hashCode();
            nm.cancel(notifId);
            nm.cancel(notifId + 1000);
        }
        Ringtone ringtone = CallMessagingService.currentRingtone;
        if (ringtone != null) {
            try { ringtone.stop(); } catch (Exception ignored) {}
            CallMessagingService.currentRingtone = null;
        }
    }

    /**
     * Opens MainActivity with a callverse:// deep link so the Capacitor web layer
     * receives it via appUrlOpen and navigates to /call/:id automatically.
     */
    static void openCallScreen(Context context, String callerId, String callId,
                               String callerName, String callType, boolean autoAccept) {
        String deepLink = "callverse://call/" + (callerId != null ? callerId : "")
                + "?incoming=true"
                + "&autoAccept=" + autoAccept
                + "&callId=" + (callId != null ? callId : "")
                + "&type=" + (callType != null ? callType : "video")
                + "&callerName=" + Uri.encode(callerName != null ? callerName : "Someone")
                + "&t=" + System.currentTimeMillis();

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch == null) launch = new Intent(context, MainActivity.class);
        launch.setAction(Intent.ACTION_VIEW);
        launch.setData(Uri.parse(deepLink));
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        context.startActivity(launch);
    }
}
