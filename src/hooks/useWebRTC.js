import { useState, useRef, useEffect, useCallback } from 'react';
import socket from '../utils/socket';
import useStore from '../store';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { 
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    { 
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
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
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          targetId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      setRemoteStream(stream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallStatus('connected');
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        endCall();
      }
    };

    peerConnection.current = pc;
    return pc;
  }, [targetId]);

  const startMedia = async (type = 'video') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'voice' ? false : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      
      setIsVideoOn(type !== 'voice');

      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (e) {
      console.error('Media error', e);
      return null;
    }
  };

  // Caller initiates call
  const initCall = useCallback(async () => {
    setCallStatus('connecting');
    const stream = await startMedia(initialCallType);
    if (!stream) return setCallStatus('ended');

    const pc = createPeerConnection();
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // Signal intent to call
    socket.emit('call-request', { targetId, callerData: { username: user.username, type: initialCallType } });
  }, [targetId, user, createPeerConnection, initialCallType]);

  // Caller creates offer AFTER target accepts
  const proceedWithOffer = useCallback(async () => {
    if (!peerConnection.current) return;
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    socket.emit('offer', { targetId, offer: peerConnection.current.localDescription });
  }, [targetId]);

  // Target answers call
  const acceptCall = useCallback(async () => {
    setCallStatus('connecting');
    const stream = await startMedia(initialCallType);
    if (!stream) return setCallStatus('ended');

    const pc = createPeerConnection();
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    socket.emit('call-accept', { targetId });
  }, [targetId, createPeerConnection, initialCallType]);

  const declineCall = useCallback((reason = 'declined') => {
    socket.emit('call-decline', { targetId });
    setCallEndReason(reason);
    setCallStatus('ended');
  }, [targetId]);

  const handleOffer = useCallback(async (offer) => {
    try {
      if (!peerConnection.current) return;
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      socket.emit('answer', { targetId, answer: peerConnection.current.localDescription });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }, [targetId]);

  const handleAnswer = useCallback(async (answer) => {
    try {
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }, []);

  const handleICECandidate = useCallback(async (candidate) => {
    try {
      if (peerConnection.current) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
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
      proceedWithOffer();
    });

    socket.on('call-declined', () => {
      setCallEndReason('declined');
      setCallStatus('ended');
      alert('Call was declined or user is busy.');
    });

    socket.on('call-failed', (data) => {
      setCallEndReason('missed');
      setCallStatus('ended');
      alert(data.reason || 'Call failed');
    });

    socket.on('offer', (data) => handleOffer(data.offer));
    socket.on('answer', (data) => handleAnswer(data.answer));
    socket.on('ice-candidate', (data) => handleICECandidate(data.candidate));
    
    socket.on('call-ended', () => {
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
