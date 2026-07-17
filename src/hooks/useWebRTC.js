import { useState, useRef, useEffect, useCallback } from 'react';
import socket from '../utils/socket';
import useStore from '../store';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export default function useWebRTC(targetId, isIncoming = false, initialCallType = 'video') {
  const user = useStore((state) => state.user);
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callStatus, setCallStatus] = useState(isIncoming ? 'ringing' : 'idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(initialCallType !== 'voice');
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [callEndReason, setCallEndReason] = useState('completed');

  const peerConnection = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);

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

        socket.emit('ice-candidate', {
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
      if (pc.connectionState === 'connected') {
        console.log('[WebRTC Debug] ConnectionState is connected! Updating callStatus to connected.');
        setCallStatus('connected');
      } else if (pc.connectionState === 'failed') {
        console.error('[WebRTC Debug] Peer Connection failed.');
        diagnoseFailure(pc);
      }
    };

    pc.onsignalingstatechange = () => {
      console.log(`[WebRTC Debug] Signaling State Changed: ${pc.signalingState}`);
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

  const startMedia = async (type = 'video') => {
    console.log(`[WebRTC Debug] Requesting local media stream: type=${type}`);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'voice' ? false : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
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

    console.log('[WebRTC Debug] Sending call-request to signaling server for targetId:', targetId);
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
      socket.emit('offer', { targetId, offer: peerConnection.current.localDescription });
    } catch (error) {
      console.error('[WebRTC Debug] Error creating/sending offer:', error);
    }
  }, [targetId]);

  // Target answers call
  const acceptCall = useCallback(async () => {
    console.log('[WebRTC Debug] Accepting incoming call...');
    setCallStatus('connecting');
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

    console.log('[WebRTC Debug] Sending call-accept to signaling server for caller:', targetId);
    socket.emit('call-accept', { targetId });
  }, [targetId, createPeerConnection, initialCallType]);

  const declineCall = useCallback((reason = 'declined') => {
    console.log('[WebRTC Debug] Declining call. Reason:', reason);
    socket.emit('call-decline', { targetId });
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
      console.log('[WebRTC Debug] Sending answer to signaling server for target:', targetId);
      socket.emit('answer', { targetId, answer: peerConnection.current.localDescription });
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
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
      }
    }
  }, []);

  const toggleSpeaker = useCallback(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
      setIsSpeakerOff(remoteVideoRef.current.muted);
    }
  }, []);

  const endCall = useCallback((reason = 'missed') => {
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
    socket.emit('end-call', { targetId });
  }, [targetId]);

  useEffect(() => {
    if (!targetId || !user) return;

    // Listeners
    socket.on('call-accepted', () => {
      console.log('[WebRTC Debug] Received call-accepted event on client.');
      proceedWithOffer();
    });

    socket.on('call-declined', () => {
      console.log('[WebRTC Debug] Received call-declined event on client.');
      setCallEndReason('declined');
      setCallStatus('ended');
      alert('Call was declined or user is busy.');
    });

    socket.on('call-failed', (data) => {
      console.warn('[WebRTC Debug] Received call-failed event on client:', data.reason);
      setCallEndReason('missed');
      setCallStatus('ended');
      alert(data.reason || 'Call failed');
    });

    socket.on('offer', (data) => {
      console.log('[WebRTC Debug] Received offer event on client.');
      handleOffer(data.offer);
    });
    
    socket.on('answer', (data) => {
      console.log('[WebRTC Debug] Received answer event on client.');
      handleAnswer(data.answer);
    });
    
    socket.on('ice-candidate', (data) => {
      handleICECandidate(data.candidate);
    });
    
    socket.on('call-ended', () => {
      console.log('[WebRTC Debug] Received call-ended event on client.');
      if (peerConnection.current) peerConnection.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
      setCallEndReason(prev => prev === 'completed' ? 'missed' : prev); // If they didn't answer, it's missed
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
    localStream, remoteStream, callStatus, isMuted, isVideoOn, isSpeakerOff, callEndReason,
    initCall, acceptCall, declineCall, endCall, toggleMute, toggleVideo, toggleSpeaker,
    localVideoRef, remoteVideoRef
  };
}
