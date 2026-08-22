package com.callverse.app;

import android.content.Context;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import java.util.List;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean routeActive = false;
    private boolean wantSpeaker = false;
    private AudioDeviceCallback deviceCallback;

    private AudioManager am() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    private int targetType(boolean useSpeaker) {
        return useSpeaker ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
    }

    /** Applies MODE_IN_COMMUNICATION + the requested device. Returns actual route name or null. */
    private String applyRoute(boolean useSpeaker) {
        AudioManager audioManager = am();
        if (audioManager == null) return null;
        int target = targetType(useSpeaker);
        String applied = null;

        // Mode must be IN_COMMUNICATION for earpiece/speaker routing to hold.
        if (audioManager.getMode() != AudioManager.MODE_IN_COMMUNICATION) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
            for (AudioDeviceInfo device : devices) {
                if (device.getType() == target) {
                    if (audioManager.setCommunicationDevice(device)) {
                        AudioDeviceInfo current = audioManager.getCommunicationDevice();
                        if (current != null && current.getType() == target) {
                            applied = nameFor(target);
                        }
                    }
                    break;
                }
            }
            if (applied == null) {
                // Fallback path for stubborn OEM builds
                audioManager.setSpeakerphoneOn(useSpeaker);
                applied = (audioManager.isSpeakerphoneOn() == useSpeaker)
                        ? (useSpeaker ? "speaker" : "earpiece") : null;
            }
        } else {
            audioManager.setSpeakerphoneOn(useSpeaker);
            applied = (audioManager.isSpeakerphoneOn() == useSpeaker)
                    ? (useSpeaker ? "speaker" : "earpiece") : null;
        }
        return applied;
    }

    private static String nameFor(int type) {
        return type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER ? "speaker" : "earpiece";
    }

    private void startManaging(PluginCall call, boolean useSpeaker) {
        wantSpeaker = useSpeaker;
        routeActive = true;
        registerDeviceCallback();

        String applied = applyRoute(wantSpeaker);

        for (long delayMs : new long[]{400L, 1000L, 2000L}) {
            mainHandler.postDelayed(() -> {
                if (!routeActive) return;
                AudioManager audioManager = am();
                if (audioManager == null) return;
                AudioDeviceInfo current = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    current = audioManager.getCommunicationDevice();
                }
                boolean drifted = current == null || current.getType() != targetType(wantSpeaker)
                        || audioManager.isSpeakerphoneOn() != wantSpeaker;
                if (drifted) applyRoute(wantSpeaker);
            }, delayMs);
        }

        JSObject res = new JSObject();
        res.put("ok", applied != null);
        res.put("using", applied == null ? "unknown" : applied);
        res.put("requested", useSpeaker ? "speaker" : "earpiece");
        call.resolve(res);
    }

    private void registerDeviceCallback() {
        if (deviceCallback != null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        deviceCallback = new AudioDeviceCallback() {
            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) { reassert(); }
            @Override
            public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) { reassert(); }
        };
        am().registerAudioDeviceCallback(deviceCallback, mainHandler);
    }

    private void reassert() {
        if (!routeActive) return;
        mainHandler.postDelayed(() -> {
            if (routeActive) applyRoute(wantSpeaker);
        }, 250);
    }

    @PluginMethod
    public void setCommunicationMode(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        boolean isVideoCall = call.getBoolean("isVideoCall", false);

        if (!enabled) {
            routeActive = false;
            unregisterCallback();
            AudioManager audioManager = am();
            if (audioManager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    audioManager.clearCommunicationDevice();
                }
                audioManager.setSpeakerphoneOn(false);
                audioManager.setMode(AudioManager.MODE_NORMAL);
            }
            JSObject res = new JSObject();
            res.put("ok", true);
            res.put("using", "none");
            call.resolve(res);
            return;
        }
        startManaging(call, isVideoCall);
    }

    @PluginMethod
    public void setSpeaker(PluginCall call) {
        boolean useSpeaker = call.getBoolean("useSpeaker", false);
        startManaging(call, useSpeaker);
    }

    private void unregisterCallback() {
        if (deviceCallback != null) {
            try { am().unregisterAudioDeviceCallback(deviceCallback); } catch (Exception ignored) {}
            deviceCallback = null;
        }
        mainHandler.removeCallbacksAndMessages(null);
    }

    @Override
    protected void handleOnDestroy() {
        routeActive = false;
        unregisterCallback();
        super.handleOnDestroy();
    }
}
