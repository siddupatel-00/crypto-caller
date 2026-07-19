import { useState, useRef, useEffect, useCallback } from 'react';
import socket from '../utils/socket';
import useStore from '../store';
import { Capacitor, registerPlugin } from '@capacitor/core';

const AudioRoute = registerPlugin('AudioRoute');
const Ringtone = registerPlugin('Ringtone');

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

if (import.meta.env.VITE_TURN_URL && import.meta.env.VITE_TURN_USERNAME && import.meta.env.VITE_TURN_CREDENTIAL) {
  ICE_SERVERS.iceServers.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL
  });
}

export default function useWebRTC(targetId, isIncoming = false, initialCallType = 'video', passedCallId = null) {
  const user = useStore((state) => state.user);
  const [activeCallId, setActiveCallId] = useState(passedCallId);
  const activeCallIdRef = useRef(passedCallId);
  useEffect(() => { activeCallIdRef.current = activeCallId; }, [activeCallId]);
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callStatus, setCallStatus] = useState(isIncoming ? 'ringing' : 'idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(initialCallType !== 'voice');
  const [isLoudspeakerOn, setIsLoudspeakerOn] = useState(initialCallType !== 'voice');
  const [facingMode, setFacingMode] = useState('user');
  const [callEndReason, setCallEndReason] = useState('completed');

  const logClientSignal = (event, direction, extra = '') => {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [Client] [${direction}] ${event} | Socket: ${socket.id} | User: ${user?.id} | Call: ${activeCallIdRef.current} ${extra}`);
  };

  const peerConnection = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const statsIntervalRef = useRef(null);

  const createPeerConnection = useCallback(() => {
    console.log('[WebRTC Debug] Creating RTCPeerConnection with servers:', ICE_SERVERS);
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candStr = event.candidate.candidate;
        let candType = 'unknown';
        if (candStr.includes('typ host')) candType = 'host';
        else if (candStr.includes('typ srflx')) candType = 'srflx (STUN)';
        else if (candStr.includes('typ relay')) candType = 'relay (TURN)';

        console.log(`[WebRTC Debug] Generated Local ICE Candidate: type=${candType}, candidate=${candStr}`);
        logClientSignal('ice-candidate', 'EMIT', `type: ${candType}`);

        socket.emit('ice-candidate', {
          callId: activeCallIdRef.current,
          targetId,
          candidate: event.candidate,
        });
      } else {
        console.log('[WebRTC Debug] Local ICE Candidate gathering completed (null candidate received).');
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC Debug] ICE Gathering State Changed: ${pc.iceGatheringState}`);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC Debug] ICE Connection State Changed: ${pc.iceConnectionState}`);
      logClientSignal('iceConnectionState', 'STATE', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallStatus('connected');
        // Log WebRTC parameters upon successful connection
        console.log('[WebRTC Debug] Connection established. Logging Peer parameters:');
        console.log('- Senders:', pc.getSenders().map(s => `track:${s.track ? s.track.kind : 'null'} active:${s.track ? s.track.enabled : 'false'}`));
        console.log('- Receivers:', pc.getReceivers().map(r => `track:${r.track ? r.track.kind : 'null'} active:${r.track ? r.track.enabled : 'false'}`));
        console.log('- Transceivers:', pc.getTransceivers().map(t => `mid:${t.mid} direction:${t.direction} currentDirection:${t.currentDirection}`));
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC Debug] ICE Connection failed or disconnected: state=${pc.iceConnectionState}. Diagnose stopping point...`);
        diagnoseFailure(pc);
        endCall();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Debug] Peer Connection State Changed: ${pc.connectionState}`);
      logClientSignal('connectionState', 'STATE', pc.connectionState);
      if (pc.connectionState === 'connected') {
        console.log('[WebRTC Debug] ConnectionState is connected! Updating callStatus to connected.');
        setCallStatus('connected');
        
        // Start periodic RTCPeerConnection.getStats() logging
        if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = setInterval(async () => {
          if (peerConnection.current && peerConnection.current.connectionState === 'connected') {
            try {
              const stats = await peerConnection.current.getStats();
              stats.forEach(report => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                  console.log(`[WebRTC Stats] Active Candidate Pair: Local=${report.localCandidateId} Remote=${report.remoteCandidateId}, Current RTT=${report.currentRoundTripTime}s`);
                }
              });
            } catch (err) {
              console.warn('[WebRTC Stats] Error fetching stats', err);
            }
          }
        }, 5000);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        if (pc.connectionState === 'failed') {
          console.error('[WebRTC Debug] Peer Connection failed.');
          diagnoseFailure(pc);
        }
        if (statsIntervalRef.current) {
          clearInterval(statsIntervalRef.current);
          statsIntervalRef.current = null;
        }
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          endCall();
        }
      }
    };

    pc.onsignalingstatechange = () => {
      console.log(`[WebRTC Debug] Signaling State Changed: ${pc.signalingState}`);
      logClientSignal('signalingState', 'STATE', pc.signalingState);
    };

    pc.onicecandidateerror = (event) => {
      console.error(`[WebRTC Debug] ICE Candidate Error: url=${event.url}, errorCode=${event.errorCode}, errorText=${event.errorText}`);
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      console.log('[WebRTC Debug] ontrack fired! Remote track details:', event.track.kind, event.track.label);
      console.log('[WebRTC Debug] Remote Stream tracks:', stream.getTracks().map(t => `${t.kind}:${t.label} (enabled:${t.enabled})`));
      setRemoteStream(stream);
      setCallStatus('connected');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch(e => console.warn('[WebRTC Debug] Auto-play error:', e));
      }
    };

    peerConnection.current = pc;
    return pc;
  }, [targetId]);

  const diagnoseFailure = (pc) => {
    if (!pc) {
      console.log('[WebRTC Diagnostic] Call failed: No RTCPeerConnection was created.');
      return;
    }
    
    console.log('[WebRTC Diagnostic] Investigating call failure point...');
    console.log(`- Local media stream: ${localStreamRef.current ? '✅ Obtained' : '❌ NOT obtained'}`);
    console.log(`- Signaling State: ${pc.signalingState} (Expected: stable)`);
    console.log(`- ICE Gathering State: ${pc.iceGatheringState}`);
    console.log(`- ICE Connection State: ${pc.iceConnectionState}`);
    
    if (!localStreamRef.current) {
      console.error('[WebRTC Diagnostic FAILURE STEP] Stopped at: media attachment (Local camera/microphone could not be accessed).');
    } else if (pc.signalingState !== 'stable') {
      console.error('[WebRTC Diagnostic FAILURE STEP] Stopped at: SDP exchange (Offer/Answer handshake did not complete successfully).');
    } else if (pc.iceGatheringState === 'new') {
      console.error('[WebRTC Diagnostic FAILURE STEP] Stopped at: ICE gathering (No ICE candidates were generated; check local network permissions).');
    } else if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
      console.error('[WebRTC Diagnostic FAILURE STEP] Stopped at: ICE connectivity (Failed to establish peer-to-peer network route. A TURN server is likely required).');
    } else {
      console.error('[WebRTC Diagnostic FAILURE STEP] Stopped at: media attachment (Network connected, but remote audio/video tracks were not received).');
    }
  };

  const startMedia = async (type = 'video', forceFacingMode = null) => {
    console.log(`[WebRTC Debug] Requesting local media stream: type=${type}`);
    try {
      const mode = forceFacingMode || facingMode;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'voice' ? false : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: mode },
      });
      
      console.log('[WebRTC Debug] getUserMedia() successfully returned stream! Tracks:');
      stream.getTracks().forEach(track => {
        console.log(`  - Local Track: kind=${track.kind}, label="${track.label}", enabled=${track.enabled}, readyState=${track.readyState}`);
      });
      setIsVideoOn(type !== 'voice');

      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(e => console.warn('[WebRTC Debug] Auto-play error:', e));
      }
      return stream;
    } catch (e) {
      console.error('[WebRTC Debug] Local media acquisition failed (getUserMedia error):', e);
      return null;
    }
  };

  // Caller initiates call
  const initCall = useCallback(async () => {
    console.log('[WebRTC Debug] Initiating Call...');
    setCallStatus('connecting');
    const stream = await startMedia(initialCallType);
    if (!stream) {
      console.error('[WebRTC Debug] Failed to start call: media stream not available.');
      return setCallStatus('ended');
    }

    const pc = createPeerConnection();
    console.log('[WebRTC Debug] Passing local tracks to peerConnection.addTrack():');
    stream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, stream);
      console.log(`  - Added local track: kind=${track.kind}, id=${track.id} via sender.id=${sender.id}`);
    });

    if (Capacitor.isNativePlatform()) {
      Ringtone.stopRingtone().catch(e => console.error(e));
      AudioRoute.setCommunicationMode({ enabled: true, isVideoCall: initialCallType !== 'voice' }).catch(e => console.error(e));
    }

    console.log('[WebRTC Debug] Sending call-request to signaling server for targetId:', targetId);
    logClientSignal('call-request', 'EMIT', `target: ${targetId}`);
    socket.emit('call-request', { targetId, callerData: { username: user.username, type: initialCallType } });
  }, [targetId, user, createPeerConnection, initialCallType]);

  // Caller creates offer AFTER target accepts
  const proceedWithOffer = useCallback(async () => {
    if (!peerConnection.current) {
      console.warn('[WebRTC Debug] proceedWithOffer aborted: No peer connection active.');
      return;
    }
    try {
      console.log('[WebRTC Debug] Creating offer...');
      const offer = await peerConnection.current.createOffer();
      console.log('[WebRTC Debug] Setting local description (Offer)...');
      await peerConnection.current.setLocalDescription(offer);
      console.log('[WebRTC Debug] Sending offer to signaling server for target:', targetId);
      logClientSignal('offer', 'EMIT', `target: ${targetId}`);
      socket.emit('offer', { callId: activeCallIdRef.current, offer: peerConnection.current.localDescription });
    } catch (error) {
      console.error('[WebRTC Debug] Error creating/sending offer:', error);
    }
  }, [targetId]);

  // Target answers call
  const acceptCall = useCallback(async () => {
    console.log('[WebRTC Debug] Accepting incoming call...');
    setCallStatus('negotiating');
    const stream = await startMedia(initialCallType);
    if (!stream) {
      console.error('[WebRTC Debug] Failed to accept call: media stream not available.');
      return setCallStatus('ended');
    }

    const pc = createPeerConnection();
    console.log('[WebRTC Debug] Passing local tracks to peerConnection.addTrack():');
    stream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, stream);
      console.log(`  - Added local track: kind=${track.kind}, id=${track.id} via sender.id=${sender.id}`);
    });

    if (Capacitor.isNativePlatform()) {
      Ringtone.stopRingtone().catch(e => console.error(e));
      AudioRoute.setCommunicationMode({ enabled: true, isVideoCall: initialCallType !== 'voice' }).catch(e => console.error(e));
    }

    console.log('[WebRTC Debug] Sending call-accept to signaling server...');
    logClientSignal('call-accept', 'EMIT');
    socket.emit('call-accept', { callId: activeCallIdRef.current });
  }, [targetId, createPeerConnection, initialCallType]);

  const declineCall = useCallback((reason = 'declined') => {
    console.log('[WebRTC Debug] Declining call. Reason:', reason);
    
    if (Capacitor.isNativePlatform()) {
      Ringtone.stopRingtone().catch(e => console.error(e));
    }
    
    logClientSignal('call-decline', 'EMIT', reason);
    socket.emit('call-decline', { callId: activeCallIdRef.current, reason });
    setCallEndReason(reason);
    setCallStatus('ended');
  }, [targetId]);

  const handleOffer = useCallback(async (offer) => {
    if (!peerConnection.current) {
      console.warn('[WebRTC Debug] handleOffer aborted: No peer connection active.');
      return;
    }
    try {
      console.log('[WebRTC Debug] Received Remote Offer. Setting remote description...');
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('[WebRTC Debug] Creating answer...');
      const answer = await peerConnection.current.createAnswer();
      console.log('[WebRTC Debug] Setting local description (Answer)...');
      await peerConnection.current.setLocalDescription(answer);
      console.log('[WebRTC Debug] Sending answer to signaling server...');
      logClientSignal('answer', 'EMIT');
      socket.emit('answer', { callId: activeCallIdRef.current, answer: peerConnection.current.localDescription });
    } catch (error) {
      console.error('[WebRTC Debug] Error handling offer/creating answer:', error);
    }
  }, [targetId]);

  const handleAnswer = useCallback(async (answer) => {
    if (!peerConnection.current) {
      console.warn('[WebRTC Debug] handleAnswer aborted: No peer connection active.');
      return;
    }
    try {
      console.log('[WebRTC Debug] Received Remote Answer. Setting remote description...');
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('[WebRTC Debug] Error setting remote answer:', error);
    }
  }, []);

  const handleICECandidate = useCallback(async (candidate) => {
    if (!peerConnection.current) {
      console.warn('[WebRTC Debug] handleICECandidate aborted: No peer connection active.');
      return;
    }
    try {
      const candStr = candidate.candidate;
      let candType = 'unknown';
      if (candStr.includes('typ host')) candType = 'host';
      else if (candStr.includes('typ srflx')) candType = 'srflx (STUN)';
      else if (candStr.includes('typ relay')) candType = 'relay (TURN)';

      console.log(`[WebRTC Debug] Applying Remote ICE Candidate: type=${candType}, candidate=${candStr}`);
      await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('[WebRTC Debug] Error applying remote ICE candidate:', error);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    setIsVideoOn(prev => {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !prev);
      }
      return !prev;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsLoudspeakerOn(prev => {
      const newState = !prev;
      if (Capacitor.isNativePlatform()) {
        AudioRoute.setSpeaker({ useSpeaker: newState }).catch(e => console.error(e));
      }
      return newState;
    });
  }, []);

  const flipCamera = useCallback(async () => {
    if (!localStreamRef.current || !peerConnection.current) return;
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: newFacingMode },
      });
      
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      
      if (oldVideoTrack) {
        localStreamRef.current.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      
      localStreamRef.current.addTrack(newVideoTrack);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      // Replace track on the peer connection
      const videoSender = peerConnection.current.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(newVideoTrack);
      }
    } catch (e) {
      console.error('[WebRTC Debug] Failed to flip camera:', e);
      // Revert state if failed
      setFacingMode(facingMode);
    }
  }, [facingMode]);

  const endCall = useCallback((reason = 'missed') => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setCallEndReason(reason);
    setCallStatus('ended');
    
    if (Capacitor.isNativePlatform()) {
      AudioRoute.setCommunicationMode({ enabled: false, isVideoCall: false }).catch(e => console.error(e));
    }
    
    socket.emit('end-call', { callId: activeCallIdRef.current });
  }, [targetId]);

  useEffect(() => {
    if (!targetId || !user) return;

    // Listeners
    socket.on('call-initiated', (data) => {
      console.log('[WebRTC Debug] Received call-initiated with callId:', data.callId);
      logClientSignal('call-initiated', 'RECV', data.callId);
      setActiveCallId(data.callId);
    });
    socket.on('call-missed', () => {
      console.log('[WebRTC Debug] Call missed/timed out by server.');
      if (Capacitor.isNativePlatform()) {
        Ringtone.stopRingtone().catch(e => console.error(e));
      }
      if (peerConnection.current) peerConnection.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      setCallEndReason('missed');
      setCallStatus('ended');
    });
    socket.on('call-accepted', () => {
      console.log('[WebRTC Debug] Received call-accepted event on client.');
      logClientSignal('call-accepted', 'RECV');
      setCallStatus('negotiating');
      proceedWithOffer();
    });

    socket.on('call-declined', () => {
      console.log('[WebRTC Debug] Received call-declined event on client.');
      if (peerConnection.current) peerConnection.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      setCallEndReason('declined');
      setCallStatus('ended');
      alert('Call was declined or user is busy.');
    });

    socket.on('call-failed', (data) => {
      console.warn('[WebRTC Debug] Received call-failed event on client:', data.reason);
      if (peerConnection.current) peerConnection.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      setCallEndReason('missed');
      setCallStatus('ended');
      alert(data.reason || 'Call failed');
    });

    socket.on('offer', (data) => {
      console.log('[WebRTC Debug] Received offer event on client.');
      logClientSignal('offer', 'RECV');
      handleOffer(data.offer);
    });
    
    socket.on('answer', (data) => {
      console.log('[WebRTC Debug] Received answer event on client.');
      logClientSignal('answer', 'RECV');
      handleAnswer(data.answer);
    });
    
    socket.on('ice-candidate', (data) => {
      logClientSignal('ice-candidate', 'RECV');
      handleICECandidate(data.candidate);
    });
    
    socket.on('call-ended', () => {
      console.log('[WebRTC Debug] Received call-ended event on client.');
      if (Capacitor.isNativePlatform()) {
        Ringtone.stopRingtone().catch(e => console.error(e));
        AudioRoute.setCommunicationMode({ enabled: false, isVideoCall: false }).catch(e => console.error(e));
      }
      if (peerConnection.current) peerConnection.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      setCallEndReason(prev => prev === 'completed' ? 'missed' : prev);
      setCallStatus('ended');
    });

    return () => {
      socket.off('call-accepted');
      socket.off('call-declined');
      socket.off('call-failed');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('call-ended');
      socket.off('call-initiated');
      socket.off('call-missed');
      
      // Ensure camera/mic is turned off when leaving the screen
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (peerConnection.current) {
        peerConnection.current.close();
      }
    };
  }, [targetId, user, proceedWithOffer, handleOffer, handleAnswer, handleICECandidate]);

  return {
    localStream, remoteStream, callStatus, isMuted, isVideoOn, isLoudspeakerOn, callEndReason,
    initCall, acceptCall, declineCall, endCall, toggleMute, toggleVideo, toggleSpeaker,
    flipCamera, localVideoRef, remoteVideoRef
  };
}
