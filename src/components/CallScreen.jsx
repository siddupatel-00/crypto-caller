import React, { useState, useEffect, useRef } from 'react';
import { SERVER_URL } from '../utils/socket';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, Volume2, VolumeX, PhoneOff, PhoneCall, Lock, Phone } from 'lucide-react';
import useWebRTC from '../hooks/useWebRTC';
import useStore from '../store';
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

  const [duration, setDuration] = useState(0);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const ringtoneEnabled = useStore(state => state.ringtoneEnabled);

  const {
    callStatus, isMuted, isVideoOn, isSpeakerOff, callEndReason,
    initCall, acceptCall, declineCall, endCall, toggleMute, toggleVideo, toggleSpeaker,
    localVideoRef, remoteVideoRef, remoteStream,
  } = useWebRTC(targetId, isIncoming, callType);

  // Auto-init for outgoing calls
  useEffect(() => {
    if (!isIncoming && callStatus === 'idle') {
      initCall();
    }
  }, [isIncoming, callStatus, initCall]);

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

  // Auto ring timeout & Ringtone playback
  useEffect(() => {
    if (callStatus === 'ringing' || callStatus === 'connecting') {
      if (ringtoneEnabled && audioRef.current) {
        audioRef.current.volume = ringtoneVolume;
        audioRef.current.play().catch(e => console.log('Autoplay prevented', e));
      }
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
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      };
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [callStatus, ringTimeout, isIncoming, declineCall, endCall, navigate, ringtoneEnabled]);

  const handleEndCall = () => endCall();
  const handleAccept = () => acceptCall();
  const handleDecline = () => {
    declineCall();
    navigate('/dashboard');
  };

  const showRemoteVideo = callStatus === 'connected' && remoteStream;
  const showLocalVideo = callStatus !== 'idle' && callStatus !== 'ringing' && callStatus !== 'ended';

  return (
    <div className="call-screen">
      {/* Remote Video Area */}
      <div className="call-remote-video-container">
        {showRemoteVideo ? (
          <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline />
        ) : (
          <div className="call-remote-placeholder">
            <div className={`call-avatar call-avatar--large ${callStatus === 'connecting' || callStatus === 'ringing' ? 'call-avatar--pulsing' : ''}`}>
              <span className="call-avatar__initials">?</span>
              {(callStatus === 'connecting' || callStatus === 'ringing') && (
                <>
                  <div className="call-avatar__ring call-avatar__ring--1" />
                  <div className="call-avatar__ring call-avatar__ring--2" />
                  <div className="call-avatar__ring call-avatar__ring--3" />
                </>
              )}
            </div>
            <p className="call-status-text">
              {callStatus === 'ringing' ? `Incoming ${callType === 'voice' ? 'Voice' : 'Video'} Call...` :
               callStatus === 'connecting' ? 'Connecting...' :
               callStatus === 'ended' ? 'Call Ended' : 'Ready'}
            </p>
          </div>
        )}
      </div>

      <audio ref={audioRef} src="https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg" loop />

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
      {(callStatus === 'connecting' || callStatus === 'connected') && (
        <div className="call-controls">
          <div className="call-controls__bar glass animate-slideUp">
            <button className={`call-control-btn ${isMuted ? 'call-control-btn--active' : ''}`} onClick={toggleMute}>
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button className={`call-control-btn ${!isVideoOn ? 'call-control-btn--active' : ''}`} onClick={toggleVideo}>
              {isVideoOn ? <Video size={22} /> : <VideoOff size={22} />}
            </button>
            <button className={`call-control-btn ${isSpeakerOff ? 'call-control-btn--active' : ''}`} onClick={toggleSpeaker}>
              {isSpeakerOff ? <VolumeX size={22} /> : <Volume2 size={22} />}
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
