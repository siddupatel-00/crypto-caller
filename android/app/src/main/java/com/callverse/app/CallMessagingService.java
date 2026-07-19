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
import android.text.Spannable;
import android.text.SpannableString;
import android.text.style.ForegroundColorSpan;
import android.graphics.Color;
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

        // Full Screen Intent (Lock Screen UI)
        Intent fullScreenIntent = new Intent(this, IncomingCallActivity.class);
        fullScreenIntent.putExtra("callId", callId);
        fullScreenIntent.putExtra("callerId", callerId);
        fullScreenIntent.putExtra("callerName", callerName);
        fullScreenIntent.putExtra("callType", callType);
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(this, notifId + 3, fullScreenIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Colored Actions for Heads-up Notification
        SpannableString acceptText = new SpannableString("Answer");
        acceptText.setSpan(new ForegroundColorSpan(Color.parseColor("#4CAF50")), 0, acceptText.length(), Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
        
        SpannableString declineText = new SpannableString("Decline");
        declineText.setSpan(new ForegroundColorSpan(Color.parseColor("#F44336")), 0, declineText.length(), Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Incoming " + (callType != null ? callType : "video") + " call")
            .setContentText(callerName != null ? callerName : "Someone is calling")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setOngoing(true)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .addAction(0, acceptText, acceptPendingIntent)
            .addAction(0, declineText, declinePendingIntent);

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
