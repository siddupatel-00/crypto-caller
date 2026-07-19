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
        Map<String, String> data = remoteMessage.getData();
        
        if ("incoming_call".equals(data.get("action"))) {
            showCallNotification(data);
        } else if ("cancel_call".equals(data.get("action"))) {
            cancelCallNotification(data);
        } else {
            super.onMessageReceived(remoteMessage);
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        }
    }

    private void cancelCallNotification(Map<String, String> data) {
        String callId = data.get("callId");
        int notifId = callId != null ? callId.hashCode() : 0;
        if (notifId != 0) {
            NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            notificationManager.cancel(notifId);
        }
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

        // Accept Action (Opens app via Deep Link)
        Intent acceptIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("callverse://call/" + callerId + "?incoming=true&callId=" + callId + "&type=" + callType + "&autoAccept=true"));
        acceptIntent.setPackage(getPackageName());
        PendingIntent acceptPendingIntent = PendingIntent.getActivity(this, notifId + 1, acceptIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Decline Action (Broadcast Receiver hits API)
        Intent declineIntent = new Intent(this, CallActionReceiver.class);
        declineIntent.setAction("DECLINE_CALL");
        declineIntent.putExtra("callId", callId);
        declineIntent.putExtra("notifId", notifId);
        PendingIntent declinePendingIntent = PendingIntent.getBroadcast(this, notifId + 2, declineIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Default click action (just open app)
        Intent contentIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("callverse://call/" + callerId + "?incoming=true&callId=" + callId + "&type=" + callType));
        contentIntent.setPackage(getPackageName());
        PendingIntent contentPendingIntent = PendingIntent.getActivity(this, notifId, contentIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Incoming " + (callType != null ? callType : "video") + " call")
            .setContentText(callerName != null ? callerName : "Someone is calling")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setOngoing(true)
            .setContentIntent(contentPendingIntent)
            .setFullScreenIntent(contentPendingIntent, true)
            .addAction(0, "Accept", acceptPendingIntent)
            .addAction(0, "Decline", declinePendingIntent);

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
