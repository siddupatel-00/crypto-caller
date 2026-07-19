const fs = require('fs');
let code = fs.readFileSync('src/hooks/useWebRTC.js', 'utf8');

// Replace signature to include passedCallId
code = code.replace(
  "export default function useWebRTC(targetId, isIncoming = false, initialCallType = 'video') {",
  "export default function useWebRTC(targetId, isIncoming = false, initialCallType = 'video', passedCallId = null) {"
);

// Insert activeCallId state
code = code.replace(
  "  const user = useStore((state) => state.user);",
  "  const user = useStore((state) => state.user);\n  const [activeCallId, setActiveCallId] = useState(passedCallId);\n  const activeCallIdRef = useRef(passedCallId);\n  useEffect(() => { activeCallIdRef.current = activeCallId; }, [activeCallId]);"
);

// Fix createPeerConnection socket.emit for ice-candidate
code = code.replace(
  "        socket.emit('ice-candidate', {",
  "        socket.emit('ice-candidate', {\n          callId: activeCallIdRef.current,"
);

// Fix initCall
code = code.replace(
  "    socket.emit('call-request', { targetId, callerData: { username: user.username, type: initialCallType } });",
  "    socket.emit('call-request', { targetId, callerData: { username: user.username, type: initialCallType } });"
);

// Fix proceedWithOffer
code = code.replace(
  "      socket.emit('offer', { targetId, offer: peerConnection.current.localDescription });",
  "      socket.emit('offer', { callId: activeCallIdRef.current, offer: peerConnection.current.localDescription });"
);

// Fix acceptCall
code = code.replace(
  "    socket.emit('call-accept', { targetId });",
  "    socket.emit('call-accept', { callId: activeCallIdRef.current });"
);

// Fix declineCall
code = code.replace(
  "    socket.emit('call-decline', { targetId });",
  "    socket.emit('call-decline', { callId: activeCallIdRef.current });"
);

// Fix handleOffer -> createAnswer
code = code.replace(
  "      socket.emit('answer', { targetId, answer: peerConnection.current.localDescription });",
  "      socket.emit('answer', { callId: activeCallIdRef.current, answer: peerConnection.current.localDescription });"
);

// Fix endCall
code = code.replace(
  "    socket.emit('end-call', { targetId });",
  "    socket.emit('end-call', { callId: activeCallIdRef.current });"
);

// Update listeners
code = code.replace(
  "    // Listeners",
  "    // Listeners\n    socket.on('call-initiated', (data) => {\n      console.log('[WebRTC Debug] Received call-initiated with callId:', data.callId);\n      setActiveCallId(data.callId);\n    });\n    socket.on('call-missed', () => {\n      console.log('[WebRTC Debug] Call missed/timed out by server.');\n      setCallEndReason('missed');\n      setCallStatus('ended');\n    });"
);

code = code.replace(
  "      socket.off('call-ended');",
  "      socket.off('call-ended');\n      socket.off('call-initiated');\n      socket.off('call-missed');"
);

fs.writeFileSync('src/hooks/useWebRTC.js', code);
