package com.callverse.app;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

public class IncomingCallActivity extends AppCompatActivity {
    
    private String callId;
    private String callerId;
    private String callType;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Wake up screen and show above lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (keyguardManager != null) {
                keyguardManager.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }

        setContentView(R.layout.activity_incoming_call);

        Intent intent = getIntent();
        callId = intent.getStringExtra("callId");
        callerId = intent.getStringExtra("callerId");
        String callerName = intent.getStringExtra("callerName");
        callType = intent.getStringExtra("callType");
        
        TextView nameText = findViewById(R.id.callerName);
        if (callerName != null) {
            nameText.setText(callerName);
        }

        TextView statusText = findViewById(R.id.callStatus);
        if (callType != null) {
            statusText.setText("Incoming " + callType + " call");
        }

        ImageButton btnAccept = findViewById(R.id.btnAccept);
        btnAccept.setOnClickListener(v -> acceptCall());

        ImageButton btnDecline = findViewById(R.id.btnDecline);
        btnDecline.setOnClickListener(v -> declineCall());
    }

    private void acceptCall() {
        stopRingtoneAndCancelNotification();
        // Fire deep link to open the React app
        Intent acceptIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("callverse://call/" + callerId + "?incoming=true&callId=" + callId + "&type=" + callType + "&autoAccept=true"));
        acceptIntent.setPackage(getPackageName());
        startActivity(acceptIntent);
        finish();
    }

    private void declineCall() {
        stopRingtoneAndCancelNotification();
        // Hit the API to decline
        Intent declineIntent = new Intent(this, CallActionReceiver.class);
        declineIntent.setAction("DECLINE_CALL");
        declineIntent.putExtra("callId", callId);
        sendBroadcast(declineIntent);
        finish();
    }

    private void stopRingtoneAndCancelNotification() {
        if (CallMessagingService.currentRingtone != null) {
            CallMessagingService.currentRingtone.stop();
            CallMessagingService.currentRingtone = null;
        }
        int notifId = callId != null ? callId.hashCode() : 0;
        if (notifId != 0) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            nm.cancel(notifId);
        }
    }
}
