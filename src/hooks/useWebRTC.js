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
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turns:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
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
  const callEndedRef = useRef(false);
  const pendingCandidatesRef = useRef([]);
  const pendingOfferRef = useRef(null);
  const speakerPrefRef = useRef(initialCallType !== 'voice');

  const drainPendingCandidates = async (pcInstance) => {
    const pc = pcInstance || peerConnection.current;
    if (!pc || !pc.remoteDescription) return;
    console.log(`[WebRTC Debug] Draining ${pendingCandidatesRef.current.length} pending ICE candidates.`);
    while (pendingCandidatesRef.current.length > 0) {
      const cand = pendingCandidatesRef.current.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.error('[WebRTC Debug] Error adding queued ICE candidate:', err);
      }
    }
  };

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
        // Audio is now actually flowing — re-assert the chosen output route,
        // because WebView/Android tends to reset routing when playback starts.
        if (Capacitor.isNativePlatform()) {
          AudioRoute.setSpeaker({ useSpeaker: speakerPrefRef.current }).catch(e => console.error('[AudioRoute] re-assert failed:', e));
        }
        // Log WebRTC parameters upon successful connection
        console.log('[WebRTC Debug] Connection established. Logging Peer parameters:');
        console.log('- Senders:', pc.getSenders().map(s => `track:${s.track ? s.track.kind : 'null'} active:${s.track ? s.track.enabled : 'false'}`));
        console.log('- Receivers:', pc.getReceivers().map(r => `track:${r.track ? r.track.kind : 'null'} active:${r.track ? r.track.enabled : 'false'}`));
        console.log('- Transceivers:', pc.getTransceivers().map(t => `mid:${t.mid} direction:${t.direction} currentDirection:${t.currentDirection}`));
      } else if (pc.iceConnectionState === 'disconnected') {
        console.warn('[WebRTC Debug] ICE Connection transiently disconnected. Waiting for recovery or failure...');
      } else if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC Debug] ICE Connection failed: state=${pc.iceConnectionState}. Diagnose stopping point...`);
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
      console.log('[WebRTC Debug] ontrack fired! Remote track details:', event.track.kind, event.track.label);
      const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      console.log('[WebRTC Debug] Remote Stream tracks:', stream.getTracks().map(t => `${t.kind}:${t.label} (enabled:${t.enabled})`));
      
      const clonedStream = new MediaStream(stream.getTracks());
      setRemoteStream(clonedStream);
      setCallStatus('connected');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        const playPromise = remoteVideoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => console.warn('[WebRTC Debug] Auto-play error:', e));
        }
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

  // Keep remote audio output in sync whenever speaker preference changes (web)
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || Capacitor.isNativePlatform()) return;
    if (typeof el.setSinkId === 'function' && remoteStream) {
      // re-apply sink when remoteStream changes or speaker toggles
      (async () => {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const outs = devices.filter(d => d.kind === 'audiooutput');
          if (!outs.length) return;
          let targetId = 'default';
          if (isLoudspeakerOn) {
            targetId = outs.find(d => d.label.toLowerCase().includes('speaker'))?.deviceId || 'default';
          } else {
            targetId = outs.find(d => d.label.toLowerCase().includes('earpiece'))?.deviceId || outs[0]?.deviceId || 'default';
          }
          await el.setSinkId(targetId);
        } catch {}
      })();
    }
  }, [isLoudspeakerOn, remoteStream]);

  const startMedia = async (type = 'video', forceFacingMode = null) => {
    console.log(`[WebRTC Debug] Requesting local media stream: type=${type}`);
    try {
      const mode = forceFacingMode || facingMode;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
        const playPromise = localVideoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => console.warn('[WebRTC Debug] Local Auto-play error:', e));
        }
      }
      return stream;
    } catch (e) {
      console.error('[WebRTC Debug] Local media acquisition failed (getUserMedia error):', e);
      return null;
    }
  };

  const handleOffer = useCallback(async (offer) => {
    if (!peerConnection.current) {
      console.warn('[WebRTC Debug] handleOffer buffered: No peer connection active yet.');
      pendingOfferRef.current = offer;
      return;
    }
    try {
      console.log('[WebRTC Debug] Received Remote Offer. Setting remote description...');
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
      await drainPendingCandidates(peerConnection.current);
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
      await drainPendingCandidates(peerConnection.current);
    } catch (error) {
      console.error('[WebRTC Debug] Error setting remote answer:', error);
    }
  }, []);

  const handleICECandidate = useCallback(async (candidate) => {
    if (!peerConnection.current || !peerConnection.current.remoteDescription) {
      console.log('[WebRTC Debug] Remote description not set yet or peer connection missing. Queueing ICE candidate.');
      pendingCandidatesRef.current.push(candidate);
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

  // Caller initiates call
  const initCall = useCallback(async () => {
    if (callEndedRef.current) {
      console.log('[WebRTC Debug] initCall blocked: call already ended.');
      return;
    }
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
    if (callEndedRef.current) {
      console.log('[WebRTC Debug] acceptCall blocked: call already ended.');
      return;
    }
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

    if (pendingOfferRef.current) {
      console.log('[WebRTC Debug] Processing buffered pending offer after peerConnection initialization.');
      const bufferedOffer = pendingOfferRef.current;
      pendingOfferRef.current = null;
      handleOffer(bufferedOffer);
    }

    if (Capacitor.isNativePlatform()) {
      Ringtone.stopRingtone().catch(e => console.error(e));
      AudioRoute.setCommunicationMode({ enabled: true, isVideoCall: initialCallType !== 'voice' }).catch(e => console.error(e));
    }

    const emitAccept = () => {
      console.log('[WebRTC Debug] Sending call-accept to signaling server. callId:', activeCallIdRef.current, 'socket.connected:', socket.connected);
      logClientSignal('call-accept', 'EMIT');
      socket.emit('call-accept', { callId: activeCallIdRef.current });
    };

    // Wait for socket to be connected AND registered before emitting call-accept
    if (socket.connected && socket._registeredAck) {
      emitAccept();
    } else {
      console.log('[WebRTC Debug] Waiting for socket connection and registration before emitting call-accept...');
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds max
      const interval = setInterval(() => {
        attempts++;
        if (socket.connected && socket._registeredAck) {
          clearInterval(interval);
          emitAccept();
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          console.error('[WebRTC Debug] Timed out waiting for socket registration. Emitting anyway.');
          emitAccept();
        }
      }, 100);
    }
  }, [targetId, createPeerConnection, initialCallType, handleOffer]);

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

  const toggleSpeaker = useCallback(async () => {
    const newState = !isLoudspeakerOn;
    speakerPrefRef.current = newState;
    // Optimistically update UI
    setIsLoudspeakerOn(newState);

    // Native Android route via AudioManager
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await AudioRoute.setSpeaker({ useSpeaker: newState });
        // The plugin reports the route it actually locked in — trust that, not hope.
        const actualSpeaker = res?.using === 'speaker';
        if (res?.ok === false) {
          console.warn('[AudioRoute] setSpeaker failed, reverting UI');
          setIsLoudspeakerOn(!newState);
        } else if (actualSpeaker !== newState) {
          setIsLoudspeakerOn(actualSpeaker);
        }
        console.log(`[AudioRoute] Switched to ${res?.using || 'unknown'} (requested ${newState ? 'SPEAKER' : 'EARPIECE'})`);
      } catch (e) {
        console.error('[AudioRoute] setSpeaker failed:', e);
        // revert on failure
        setIsLoudspeakerOn(!newState);
      }
      return;
    }

    // Web fallback: try to route remote audio element via setSinkId (Chrome/Edge)
    const el = remoteVideoRef.current;
    if (el && typeof el.setSinkId === 'function') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outs = devices.filter(d => d.kind === 'audiooutput');
        // Heuristic: default = loudspeaker on most desktops; first non-default often earpiece on mobiles
        let targetId = 'default';
        if (outs.length) {
          if (newState) {
            targetId = outs.find(d => d.label.toLowerCase().includes('speaker'))?.deviceId
                    || outs.find(d => d.deviceId === 'default')?.deviceId || 'default';
          } else {
            targetId = outs.find(d => d.label.toLowerCase().includes('earpiece'))?.deviceId
                    || outs.find(d => d.deviceId !== 'default')?.deviceId || 'default';
          }
        }
        await el.setSinkId(targetId);
        console.log(`[Web Audio] setSinkId -> ${targetId} (loudspeaker=${newState})`);
      } catch (e) {
        console.warn('[Web Audio] setSinkId failed, using volume fallback:', e);
      }
    } else {
      console.log(`[Web Audio] Speaker toggle ${newState ? 'ON' : 'OFF'} (no setSinkId support — volume routing only)`);
    }
  }, [isLoudspeakerOn]);

  const flipCamera = useCallback(async () => {
    if (!localStreamRef.current || !peerConnection.current) return;
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: newFacingMode },
      });
      
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) throw new Error('No video track');
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      
      if (oldVideoTrack) {
        localStreamRef.current.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      
      localStreamRef.current.addTrack(newVideoTrack);
      // preserve enabled state
      newVideoTrack.enabled = isVideoOn;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        try { await localVideoRef.current.play(); } catch {}
      }

      // Replace track on the peer connection
      const videoSender = peerConnection.current.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(newVideoTrack);
      }
      // stop extra tracks from newStream (keep only video)
      newStream.getAudioTracks().forEach(t => t.stop());
      setFacingMode(newFacingMode);
    } catch (e) {
      console.error('[WebRTC Debug] Failed to flip camera:', e);
    }
  }, [facingMode, isVideoOn]);

  const endCall = useCallback((reason = 'missed') => {
    // Prevent double-ending and block future re-initiation
    if (callEndedRef.current) return;
    callEndedRef.current = true;

    console.log('[WebRTC Debug] endCall called. Reason:', reason);

    // Emit hangup BEFORE clearing callId so server gets the correct ID
    socket.emit('end-call', { callId: activeCallIdRef.current });

    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    // Remove all event handlers to prevent callbacks after close
    if (peerConnection.current) {
      peerConnection.current.onicecandidate = null;
      peerConnection.current.ontrack = null;
      peerConnection.current.oniceconnectionstatechange = null;
      peerConnection.current.onconnectionstatechange = null;
      peerConnection.current.onsignalingstatechange = null;
      peerConnection.current.onicecandidateerror = null;
      peerConnection.current.onicegatheringstatechange = null;
      peerConnection.current.close();
      peerConnection.current = null;
    }

    // Stop all local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setCallEndReason(reason);
    setCallStatus('ended');

    pendingCandidatesRef.current = [];
    pendingOfferRef.current = null;

    // Clear call identity
    setActiveCallId(null);
    activeCallIdRef.current = null;

    if (Capacitor.isNativePlatform()) {
      Ringtone.stopRingtone().catch(e => console.error(e));
      AudioRoute.setCommunicationMode({ enabled: false, isVideoCall: false }).catch(e => console.error(e));
    }
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
      callEndedRef.current = true;
      if (Capacitor.isNativePlatform()) {
        Ringtone.stopRingtone().catch(e => console.error(e));
      }
      if (peerConnection.current) {
        peerConnection.current.onicecandidate = null;
        peerConnection.current.ontrack = null;
        peerConnection.current.oniceconnectionstatechange = null;
        peerConnection.current.onconnectionstatechange = null;
        peerConnection.current.close();
        peerConnection.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
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
      callEndedRef.current = true;
      if (peerConnection.current) {
        peerConnection.current.onicecandidate = null;
        peerConnection.current.ontrack = null;
        peerConnection.current.oniceconnectionstatechange = null;
        peerConnection.current.onconnectionstatechange = null;
        peerConnection.current.close();
        peerConnection.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      setCallEndReason('declined');
      setCallStatus('ended');
    });

    socket.on('call-failed', (data) => {
      console.warn('[WebRTC Debug] Received call-failed event on client:', data.reason);
      callEndedRef.current = true;
      if (peerConnection.current) {
        peerConnection.current.onicecandidate = null;
        peerConnection.current.ontrack = null;
        peerConnection.current.oniceconnectionstatechange = null;
        peerConnection.current.onconnectionstatechange = null;
        peerConnection.current.close();
        peerConnection.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      setCallEndReason('missed');
      setCallStatus('ended');
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
      callEndedRef.current = true;
      if (Capacitor.isNativePlatform()) {
        Ringtone.stopRingtone().catch(e => console.error(e));
        AudioRoute.setCommunicationMode({ enabled: false, isVideoCall: false }).catch(e => console.error(e));
      }
      if (peerConnection.current) {
        peerConnection.current.onicecandidate = null;
        peerConnection.current.ontrack = null;
        peerConnection.current.oniceconnectionstatechange = null;
        peerConnection.current.onconnectionstatechange = null;
        peerConnection.current.close();
        peerConnection.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
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

      // Emit definitive hangup if not already ended
      if (!callEndedRef.current) {
        callEndedRef.current = true;
        socket.emit('end-call', { callId: activeCallIdRef.current });
      }

      // Stop all local media tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }

      // Null all event handlers and close peer connection
      if (peerConnection.current) {
        peerConnection.current.onicecandidate = null;
        peerConnection.current.ontrack = null;
        peerConnection.current.oniceconnectionstatechange = null;
        peerConnection.current.onconnectionstatechange = null;
        peerConnection.current.onsignalingstatechange = null;
        peerConnection.current.onicecandidateerror = null;
        peerConnection.current.onicegatheringstatechange = null;
        peerConnection.current.close();
        peerConnection.current = null;
      }

      // Clear stats interval
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }

      pendingCandidatesRef.current = [];
      pendingOfferRef.current = null;
    };
  }, [targetId, user, proceedWithOffer, handleOffer, handleAnswer, handleICECandidate]);

  return {
    localStream, remoteStream, callStatus, isMuted, isVideoOn, isLoudspeakerOn, callEndReason,
    initCall, acceptCall, declineCall, endCall, toggleMute, toggleVideo, toggleSpeaker,
    flipCamera, localVideoRef, remoteVideoRef
  };
}
