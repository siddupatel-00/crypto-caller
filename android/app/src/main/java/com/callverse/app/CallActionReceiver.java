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
                        // Using the production URL instead of localhost
                        URL url = new URL("https://crypto-caller.onrender.com/api/calls/decline");
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestMethod("POST");
                        conn.setRequestProperty("Content-Type", "application/json; utf-8");
                        conn.setRequestProperty("Accept", "application/json");
                        conn.setDoOutput(true);
                        
                        String jsonInputString = "{\"callId\": \"" + callId + "\"}";
                        try(java.io.OutputStream os = conn.getOutputStream()) {
                            byte[] input = jsonInputString.getBytes("utf-8");
                            os.write(input, 0, input.length);
                        }
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
