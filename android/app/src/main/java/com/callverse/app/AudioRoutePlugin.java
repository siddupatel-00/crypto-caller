package com.callverse.app;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import java.util.List;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private void routeAudio(AudioManager audioManager, boolean useSpeaker) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
            boolean deviceSet = false;
            for (AudioDeviceInfo device : devices) {
                if (useSpeaker && device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                    audioManager.setCommunicationDevice(device);
                    deviceSet = true;
                    break;
                } else if (!useSpeaker && device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) {
                    audioManager.setCommunicationDevice(device);
                    deviceSet = true;
                    break;
                }
            }
            if (!deviceSet) {
                audioManager.setSpeakerphoneOn(useSpeaker);
            }
        } else {
            audioManager.setSpeakerphoneOn(useSpeaker);
        }
    }

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
            routeAudio(audioManager, isVideoCall);
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice();
            }
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

        if (audioManager.getMode() != AudioManager.MODE_IN_COMMUNICATION) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        }
        routeAudio(audioManager, useSpeaker);
        call.resolve();
    }
}
