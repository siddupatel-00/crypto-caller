package com.callverse.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import java.util.Map;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;

public class CallMessagingService extends FirebaseMessagingService {

    public static Ringtone currentRingtone;
    private static final String CHANNEL_CALLS = "calls";
    private static final String CHANNEL_MISSED = "missed_calls";
    private static final String ACTION_ANSWER = "call_answer";
    private static final String ACTION_DECLINE = "call_decline";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        if (remoteMessage.getData().size() > 0) {
            Map<String, String> data = remoteMessage.getData();
            String action = data.get("action");
            if ("cancel_call".equals(action)) {
                cancelCallNotification(data);
            } else if ("missed_call".equals(action)) {
                showMissedCallNotification(
                    data.get("callId"),
                    data.get("callerId"),
                    data.get("callerName"),
                    data.get("callType")
                );
            } else if (ACTION_ANSWER.equals(action)) {
                handleAnswerAction(data);
            } else if (ACTION_DECLINE.equals(action)) {
                handleDeclineAction(data);
            } else {
                showCallNotification(data);
            }
        }
    }

    private void cancelCallNotification(Map<String, String> data) {
        String callId = data.get("callId");
        int notifId = callId != null ? callId.hashCode() : 0;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.cancel(notifId);
        nm.cancel(notifId + 1000); // cancel full screen intent if separate
        if (currentRingtone != null) {
            currentRingtone.stop();
            currentRingtone = null;
        }
    }

    private void handleAnswerAction(Map<String, String> data) {
        String callId = data.get("callId");
        String callerId = data.get("callerId");
        String callerName = data.get("callerName");
        String callType = data.get("callType");

        // Cancel the notification and stop ringtone
        cancelCallNotification(data);

        // Send acceptance to server via HTTP
        sendCallAcceptToServer(callId);

        // Launch app with call screen (auto-accept)
        launchCallScreen(callId, callerId, callerName, callType, true);
    }

    private void handleDeclineAction(Map<String, String> data) {
        String callId = data.get("callId");
        // Cancel the notification and stop ringtone
        cancelCallNotification(data);

        // Send decline to server via HTTP
        sendCallDeclineToServer(callId);

        // Optionally show a brief toast or heads-up that call was declined
    }

    private void sendCallAcceptToServer(String callId) {
        if (callId == null) return;
        new Thread(() -> {
            try {
                String serverUrl = getString(R.string.server_url) + "/api/calls/accept/" + callId;
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) new java.net.URL(serverUrl).openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.getResponseCode(); // Fire and forget
            } catch (Exception e) {
                android.util.Log.e("CallVerse", "Failed to send accept to server", e);
            }
        }).start();
    }

    private void sendCallDeclineToServer(String callId) {
        if (callId == null) return;
        new Thread(() -> {
            try {
                String serverUrl = getString(R.string.server_url) + "/api/calls/decline";
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) new java.net.URL(serverUrl).openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                String json = "{\"callId\":\"" + callId + "\"}";
                conn.getOutputStream().write(json.getBytes());
                conn.getResponseCode(); // Fire and forget
            } catch (Exception e) {
                android.util.Log.e("CallVerse", "Failed to send decline to server", e);
            }
        }).start();
    }

    private void launchCallScreen(String callId, String callerId, String callerName, String callType, boolean autoAccept) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("callId", callId);
        intent.putExtra("callerId", callerId);
        intent.putExtra("callerName", callerName);
        intent.putExtra("callType", callType);
        intent.putExtra("autoAccept", autoAccept);
        startActivity(intent);
    }

    private void showCallNotification(Map<String, String> data) {
        String callId = data.get("callId");
        String callerId = data.get("callerId");
        String callerName = data.get("callerName");
        String callType = data.get("callType");

        SharedPreferences prefs = getSharedPreferences("CallversePrefs", Context.MODE_PRIVATE);
        String activeUserId = prefs.getString("active_user_id", null);
        if (callerId != null && activeUserId != null && callerId.equals(activeUserId)) {
            return;
        }

        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Call channel - high importance, shows on lock screen
            NotificationChannel callChannel = new NotificationChannel(
                CHANNEL_CALLS, "Incoming Calls", NotificationManager.IMPORTANCE_HIGH
            );
            callChannel.setDescription("Incoming voice and video calls");
            callChannel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            callChannel.enableVibration(true);
            callChannel.setVibrationPattern(new long[]{0, 500, 200, 500});
            callChannel.setShowBadge(true);
            notificationManager.createNotificationChannel(callChannel);

            // Missed call channel - default importance
            NotificationChannel missedChannel = new NotificationChannel(
                CHANNEL_MISSED, "Missed Calls", NotificationManager.IMPORTANCE_DEFAULT
            );
            missedChannel.setDescription("Notifications for missed calls");
            missedChannel.setShowBadge(true);
            notificationManager.createNotificationChannel(missedChannel);
        }

        int notifId = callId != null ? callId.hashCode() : (int) System.currentTimeMillis();

        // --- Main tap intent: opens the app ---
        Intent tapIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (tapIntent == null) {
            tapIntent = new Intent(this, MainActivity.class);
        }
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        tapIntent.putExtra("callId", callId);
        tapIntent.putExtra("callerId", callerId);
        tapIntent.putExtra("callerName", callerName);
        tapIntent.putExtra("callType", callType);
        PendingIntent tapPendingIntent = PendingIntent.getActivity(this, notifId, tapIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // --- Full Screen Intent: opens directly over lock screen ---
        Intent fullScreenIntent = new Intent(this, MainActivity.class);
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreenIntent.putExtra("callId", callId);
        fullScreenIntent.putExtra("callerId", callerId);
        fullScreenIntent.putExtra("callerName", callerName);
        fullScreenIntent.putExtra("callType", callType);
        fullScreenIntent.putExtra("autoAccept", false); // Let user decide in app
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(this, notifId + 1, fullScreenIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // --- ANSWER ACTION ---
        Intent answerIntent = new Intent(this, CallMessagingService.class);
        answerIntent.setAction(ACTION_ANSWER);
        answerIntent.putExtra("callId", callId);
        answerIntent.putExtra("callerId", callerId);
        answerIntent.putExtra("callerName", callerName);
        answerIntent.putExtra("callType", callType);
        PendingIntent answerPendingIntent = PendingIntent.getService(this, notifId + 2, answerIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // --- DECLINE ACTION ---
        Intent declineIntent = new Intent(this, CallMessagingService.class);
        declineIntent.setAction(ACTION_DECLINE);
        declineIntent.putExtra("callId", callId);
        PendingIntent declinePendingIntent = PendingIntent.getService(this, notifId + 3, declineIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Build notification with actions
        String typeLabel = (callType != null && callType.equals("voice")) ? "Voice" : "Video";
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_CALLS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Incoming " + typeLabel + " Call")
            .setContentText(callerName != null ? callerName + " is calling..." : "Someone is calling...")
            .setSubText("Tap to answer or swipe for options")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(false) // Don't auto-cancel on tap; let actions handle it
            .setOngoing(true)
            .setSound(null) // We handle ringtone separately
            .setContentIntent(tapPendingIntent)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(
                R.drawable.ic_call_answer,
                "Answer",
                answerPendingIntent
            )
            .addAction(
                R.drawable.ic_call_decline,
                "Decline",
                declinePendingIntent
            )
            // Large icon: use app icon or could fetch caller avatar
            .setLargeIcon(android.graphics.BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher))
            .setColor(Color.parseColor("#8B5CF6")) // Brand violet
            .setColorized(true)
            .setStyle(new NotificationCompat.BigTextStyle()
                .bigText(callerName != null ? "Incoming " + typeLabel + " call from " + callerName : "Incoming " + typeLabel + " call")
                .setBigContentTitle("Incoming " + typeLabel + " Call")
                .setSummaryText("Swipe down for Answer / Decline")
            );

        notificationManager.notify(notifId, builder.build());

        // Play Ringtone
        String customUri = prefs.getString("custom_ringtone_uri", null);
        Uri ringtoneUri = customUri != null ? Uri.parse(customUri) : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);

        if (currentRingtone != null) {
            currentRingtone.stop();
        }
        currentRingtone = RingtoneManager.getRingtone(this, ringtoneUri);
        if (currentRingtone != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                currentRingtone.setLooping(true);
            }
            currentRingtone.play();
        }
    }

    public void showMissedCallNotification(String callId, String callerId, String callerName, String callType) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel missedChannel = new NotificationChannel(
                CHANNEL_MISSED, "Missed Calls", NotificationManager.IMPORTANCE_DEFAULT
            );
            missedChannel.setDescription("Notifications for missed calls");
            missedChannel.setShowBadge(true);
            notificationManager.createNotificationChannel(missedChannel);
        }

        int notifId = callId != null ? callId.hashCode() : (int) System.currentTimeMillis();

        // Tap to open app to call history
        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        tapIntent.putExtra("openHistory", true);
        PendingIntent tapPendingIntent = PendingIntent.getActivity(this, notifId, tapIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String typeLabel = (callType != null && callType.equals("voice")) ? "Voice" : "Video";
        String title = "Missed " + typeLabel + " Call";
        String text = callerName != null ? callerName + " called you" : "You missed a call";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_MISSED)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
            .setAutoCancel(true)
            .setOngoing(false)
            .setContentIntent(tapPendingIntent)
            .setColor(Color.parseColor("#F43F5E")) // Rose for missed
            .setColorized(true)
            .setStyle(new NotificationCompat.BigTextStyle()
                .bigText(text)
                .setBigContentTitle(title)
                .setSummaryText("Just now")
            );

        notificationManager.notify(notifId + 10000, builder.build()); // Different ID range
    }

    @Override
    public void onNewToken(@NonNull String s) {
        PushNotificationsPlugin.onNewToken(s);
    }
}