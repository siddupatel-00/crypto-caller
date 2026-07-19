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

public class CallMessagingService extends FirebaseMessagingService {

    public static Ringtone currentRingtone;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        if (remoteMessage.getData().size() > 0) {
            Map<String, String> data = remoteMessage.getData();
            String action = data.get("action");
            if ("cancel_call".equals(action)) {
                cancelCallNotification(data);
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
        if (currentRingtone != null) {
            currentRingtone.stop();
            currentRingtone = null;
        }
    }

    private void showCallNotification(Map<String, String> data) {
        String callId = data.get("callId");
        String callerId = data.get("callerId");
        String callerName = data.get("callerName");
        String callType = data.get("callType");

        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        String channelId = "calls";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(channelId, "Incoming Calls", NotificationManager.IMPORTANCE_HIGH);
            notificationManager.createNotificationChannel(channel);
        }

        int notifId = callId != null ? callId.hashCode() : (int) System.currentTimeMillis();

        // Tap notification → open the app (MainActivity / dashboard).
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

        // Full Screen Intent – opens the main React app directly over the lock screen
        Intent fullScreenIntent = new Intent(this, MainActivity.class);
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreenIntent.putExtra("callId", callId);
        fullScreenIntent.putExtra("callerId", callerId);
        fullScreenIntent.putExtra("callerName", callerName);
        fullScreenIntent.putExtra("callType", callType);
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(this, notifId + 1, fullScreenIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Incoming " + (callType != null ? callType : "video") + " call")
            .setContentText(callerName != null ? callerName + " is calling" : "Someone is calling")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setOngoing(true)
            .setSound(null) // Do not play default sound, we manage it with RingtoneManager
            .setContentIntent(tapPendingIntent)
            .setFullScreenIntent(fullScreenPendingIntent, true);

        notificationManager.notify(notifId, builder.build());

        // Play Ringtone
        SharedPreferences prefs = getSharedPreferences("CallversePrefs", Context.MODE_PRIVATE);
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

    @Override
    public void onNewToken(@NonNull String s) {
        PushNotificationsPlugin.onNewToken(s);
    }
}
