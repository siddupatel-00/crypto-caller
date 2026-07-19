import React, { useState, useEffect, useRef } from 'react';
import { SERVER_URL } from '../utils/socket';
import socket from '../utils/socket';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, Volume2, VolumeX, PhoneOff, PhoneCall, Lock, Phone, SwitchCamera } from 'lucide-react';
import useWebRTC from '../hooks/useWebRTC';
import useStore from '../store';
import { ringtoneSynth } from '../utils/ringtone';
import { Capacitor } from '@capacitor/core';
import './CallScreen.css';

function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function CallScreen() {
  const { targetId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  
  const queryParams = new URLSearchParams(location.search);
  const isIncoming = queryParams.get('incoming') === 'true';
  const callType = queryParams.get('type') || 'video';
  const callerName = queryParams.get('callerName') || 'Someone';
  const callId = queryParams.get('callId') || null;

  const [duration, setDuration] = useState(0);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const ringtoneEnabled = useStore(state => state.ringtoneEnabled);

  const {
    callStatus, isMuted, isVideoOn, isLoudspeakerOn, callEndReason,
    initCall, acceptCall, declineCall, endCall, toggleMute, toggleVideo, toggleSpeaker,
    flipCamera, localVideoRef, remoteVideoRef, localStream, remoteStream,
  } = useWebRTC(targetId, isIncoming, callType, callId);

  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimeoutRef = useRef(null);

  const resetControlsTimeout = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (callStatus === 'connected') {
        setControlsVisible(false);
      }
    }, 4000);
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [callStatus]);

  // Auto-init for outgoing calls, or auto-accept for push notification taps
  const autoAccept = queryParams.get('autoAccept') === 'true';
  const hasAutoAccepted = useRef(false);
  useEffect(() => {
    if (!isIncoming && callStatus === 'idle') {
      initCall();
    } else if (isIncoming && autoAccept && callStatus === 'ringing' && !hasAutoAccepted.current) {
      const doAccept = () => {
        hasAutoAccepted.current = true;
        console.log('[CallScreen] Auto-accepting call. Socket connected:', socket.connected);
        acceptCall();
      };

      if (socket.connected) {
        doAccept();
      } else {
        console.log('[CallScreen] Socket not connected yet. Waiting for connection before auto-accept...');
        const checkInterval = setInterval(() => {
          if (socket.connected) {
            clearInterval(checkInterval);
            console.log('[CallScreen] Socket connected! Now auto-accepting.');
            setTimeout(doAccept, 300); // Small delay to let register complete
          }
        }, 100);
        return () => clearInterval(checkInterval);
      }
    }
  }, [isIncoming, callStatus, initCall, acceptCall, autoAccept]);

  const hasLoggedHistory = useRef(false);

  // Timer & History logging
  useEffect(() => {
    if (callStatus === 'connected') {
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(prev => prev + 1), 1000);
    } else if (callStatus === 'ended') {
      if (timerRef.current) clearInterval(timerRef.current);
      
      // Log history if we were the caller (to avoid duplicate logs)
      if (!isIncoming && !hasLoggedHistory.current) {
        hasLoggedHistory.current = true;
        fetch(`${SERVER_URL}/api/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callerId: user.id, receiverId: targetId, duration, status: duration > 0 ? 'completed' : callEndReason })
        }).catch(console.error);
      }
      setTimeout(() => navigate('/dashboard'), 2000);
    }

    return () => clearInterval(timerRef.current);
  }, [callStatus]); // Removed duration from deps to avoid re-triggering, handled by ref

  const ringtoneVolume = useStore(state => state.ringtoneVolume);
  const ringTimeout = useStore(state => state.ringTimeout);
  const selectedRingtone = useStore(state => state.selectedRingtone);

  // Auto ring timeout
  useEffect(() => {
    if (callStatus === 'ringing' || callStatus === 'connecting') {
      const timer = setTimeout(() => {
        if (isIncoming) {
          declineCall('not answered');
        } else {
          endCall('not answered');
        }
        navigate('/dashboard');
        alert(`Call timed out after ${ringTimeout} seconds.`);
      }, ringTimeout * 1000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [callStatus, ringTimeout, isIncoming, declineCall, endCall, navigate]);

  // Ringtone playback — single consolidated effect
  useEffect(() => {
    if (callStatus === 'ringing' && ringtoneEnabled) {
      // Receiver side: play incoming ringtone (only on web; native Android plays via CallMessagingService)
      if (!Capacitor.isNativePlatform()) {
        ringtoneSynth.play(selectedRingtone, ringtoneVolume);
      }
    } else if (callStatus === 'connecting' && ringtoneEnabled) {
      // Caller side: play ringback on ALL platforms (native doesn't play this automatically)
      ringtoneSynth.play('ringback', ringtoneVolume);
    } else {
      // Any other state (negotiating, connected, ended): stop all playback
      ringtoneSynth.stop();
    }
    return () => {
      // Cleanup on unmount or state change
      ringtoneSynth.stop();
    };
  }, [callStatus, selectedRingtone, ringtoneVolume, ringtoneEnabled]);

  console.log(`[Signaling Log] CallScreen mounted. targetId=${targetId}, isIncoming=${isIncoming}, callType=${callType}, callerName=${callerName}`);

  const handleEndCall = () => {
    console.log(`[Signaling Log] End Call button pressed.`);
    endCall();
  };
  const handleAccept = () => {
    console.log(`[Signaling Log] User B pressed Accept call button.`);
    acceptCall();
  };
  const handleDecline = () => {
    console.log(`[Signaling Log] User B pressed Decline call button.`);
    declineCall();
    navigate('/dashboard');
  };

  const showRemoteVideo = callType === 'video' && remoteStream;
  const showRemoteAudioOnly = callType === 'voice' && remoteStream;
  const showLocalVideo = callType === 'video' && callStatus !== 'idle' && callStatus !== 'ringing' && callStatus !== 'ended';
  const showLocalAudioOnly = callType === 'voice' && callStatus !== 'idle' && callStatus !== 'ringing' && callStatus !== 'ended' && localStream;

  // Bind streams to video elements dynamically when elements are rendered
  useEffect(() => {
    if (showLocalVideo && localVideoRef.current && localStream) {
      console.log('[Media Debug] Binding localStream to local video element');
      localVideoRef.current.srcObject = localStream;
    }
  }, [showLocalVideo, localStream]);

  useEffect(() => {
    if (showLocalAudioOnly && localVideoRef.current && localStream) {
      console.log('[Media Debug] Binding localStream to local audio element');
      localVideoRef.current.srcObject = localStream;
    }
  }, [showLocalAudioOnly, localStream]);

  useEffect(() => {
    if (showRemoteVideo && remoteVideoRef.current && remoteStream) {
      console.log('[Media Debug] Binding remoteStream to remote video element');
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [showRemoteVideo, remoteStream]);

  useEffect(() => {
    if (showRemoteAudioOnly && remoteVideoRef.current && remoteStream) {
      console.log('[Media Debug] Binding remoteStream to remote audio element');
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [showRemoteAudioOnly, remoteStream]);

  return (
    <div 
      className="call-screen" 
      onMouseMove={resetControlsTimeout}
      onTouchStart={resetControlsTimeout}
      onClick={resetControlsTimeout}
    >
      {/* Remote Video Area */}
      <div className="call-remote-video-container">
        {showRemoteVideo ? (
          <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline />
        ) : (
          <div className="call-remote-placeholder">
            <div className={`call-avatar call-avatar--large ${callStatus === 'connecting' || callStatus === 'ringing' || callStatus === 'negotiating' ? 'call-avatar--pulsing' : ''}`}>
              <span className="call-avatar__initials">?</span>
              {(callStatus === 'connecting' || callStatus === 'ringing' || callStatus === 'negotiating') && (
                <>
                  <div className="call-avatar__ring call-avatar__ring--1" />
                  <div className="call-avatar__ring call-avatar__ring--2" />
                  <div className="call-avatar__ring call-avatar__ring--3" />
                </>
              )}
            </div>
            <p className="call-status-text">
              {callStatus === 'ringing' ? `Incoming ${callType === 'voice' ? 'Voice' : 'Video'} Call...` :
               (callStatus === 'connecting' || callStatus === 'negotiating') ? 'Connecting...' :
               callStatus === 'ended' ? 'Call Ended' : ''}
            </p>
          </div>
        )}
      </div>

      {showRemoteAudioOnly && (
        <audio ref={remoteVideoRef} autoPlay />
      )}

      {/* Local Video PiP */}
      {showLocalVideo && (
        <div className={`call-local-video-container ${!isVideoOn ? 'call-local-video-container--no-video' : ''}`}>
          {isVideoOn ? (
            <video ref={localVideoRef} className="call-local-video" autoPlay playsInline muted />
          ) : (
            <div className="call-avatar call-avatar--small">
              <span className="call-avatar__initials">You</span>
            </div>
          )}
        </div>
      )}

      {showLocalAudioOnly && (
        <audio ref={localVideoRef} muted />
      )}

      {/* Top Bar */}
      <div className="call-top-bar glass">
        <div className="call-top-bar__left">
          <div className="call-encryption-badge">
            <Lock size={12} /><span>E2E Encrypted</span>
          </div>
        </div>
        <div className="call-top-bar__center">
          {callStatus === 'connected' && <span className="call-timer">{formatDuration(duration)}</span>}
        </div>
        <div className="call-top-bar__right"></div>
      </div>

      {/* Incoming Call Modal */}
      {callStatus === 'ringing' && (
        <div className="call-start-overlay">
          <div className="call-start-content glass-card animate-slideUp">
            <div className="call-ended-icon" style={{ background: 'var(--primary)', color: 'white' }}>
              <Phone size={32} className="animate-pulse" />
            </div>
            <h2 className="call-ended-title">{callerName} is calling...</h2>
            <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
              <button className="call-start-btn" style={{ background: 'var(--success)', flex: 1 }} onClick={handleAccept}>
                <PhoneCall size={24} />
                <span>Answer</span>
              </button>
              <button className="call-start-btn" style={{ background: 'var(--danger)', flex: 1 }} onClick={handleDecline}>
                <PhoneOff size={24} />
                <span>Decline</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Screen */}
      {callStatus === 'ended' && (
        <div className="call-ended-overlay">
          <div className="call-ended-content glass-card">
            <div className="call-ended-icon"><PhoneOff size={32} /></div>
            <h2 className="call-ended-title">Call Ended</h2>
            <p className="call-ended-duration">Duration: {formatDuration(duration)}</p>
          </div>
        </div>
      )}

      {/* Control Bar */}
      {(callStatus === 'connecting' || callStatus === 'negotiating' || callStatus === 'connected') && (
        <div className={`call-controls ${controlsVisible ? 'call-controls--visible' : 'call-controls--hidden'}`}>
          <div className="call-controls__bar glass animate-slideUp">
            <button className={`call-control-btn ${isMuted ? 'call-control-btn--active' : ''}`} onClick={toggleMute}>
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button className={`call-control-btn ${!isVideoOn ? 'call-control-btn--active' : ''}`} onClick={toggleVideo}>
              {isVideoOn ? <Video size={22} /> : <VideoOff size={22} />}
            </button>
            {callType === 'video' && (
              <button className="call-control-btn" onClick={flipCamera}>
                <SwitchCamera size={22} />
              </button>
            )}
            <button className={`call-control-btn ${!isLoudspeakerOn ? 'call-control-btn--active' : ''}`} onClick={toggleSpeaker}>
              {!isLoudspeakerOn ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>
            <button className="call-control-btn call-control-btn--end" onClick={handleEndCall}>
              <PhoneOff size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
