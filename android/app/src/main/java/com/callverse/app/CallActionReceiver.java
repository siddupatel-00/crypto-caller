package com.callverse.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.net.HttpURLConnection;
import java.net.URL;

public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if ("DECLINE_CALL".equals(intent.getAction())) {
            String callId = intent.getStringExtra("callId");
            int notifId = intent.getIntExtra("notifId", 0);
            
            if (notifId != 0) {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                nm.cancel(notifId);
            }
            
            if (CallMessagingService.currentRingtone != null) {
                CallMessagingService.currentRingtone.stop();
                CallMessagingService.currentRingtone = null;
            }
            
            if (callId != null) {
                new Thread(() -> {
                    try {
                        // Assuming running on emulator for now. A production app would read SERVER_URL from config.
                        URL url = new URL("http://10.0.2.2:3001/api/calls/decline/" + callId);
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestMethod("POST");
                        conn.getResponseCode();
                        conn.disconnect();
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }).start();
            }
        }
    }
}
