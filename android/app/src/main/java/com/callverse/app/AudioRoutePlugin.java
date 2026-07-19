package com.callverse.app;

import android.content.Context;
import android.media.AudioManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    @PluginMethod
    public void setCommunicationMode(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", false);
        Boolean isVideoCall = call.getBoolean("isVideoCall", false);

        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) {
            call.reject("AudioManager not found");
            return;
        }

        if (enabled) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (isVideoCall) {
                audioManager.setSpeakerphoneOn(true);
            } else {
                audioManager.setSpeakerphoneOn(false);
            }
        } else {
            audioManager.setMode(AudioManager.MODE_NORMAL);
            audioManager.setSpeakerphoneOn(false);
        }

        call.resolve();
    }

    @PluginMethod
    public void setSpeaker(PluginCall call) {
        Boolean useSpeaker = call.getBoolean("useSpeaker", false);
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) {
            call.reject("AudioManager not found");
            return;
        }

        audioManager.setSpeakerphoneOn(useSpeaker);
        call.resolve();
    }
}
