import { io } from 'socket.io-client';

export const SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

// Re-register on every reconnection so the server maps the new socket ID to the user.
// Without this, after an APK background/foreground cycle, Socket.IO gets a new socket ID
// but the server still maps the user to the OLD dead socket, so all signaling events
// (call-accepted, offer, answer, ice-candidate) go to a socket that no longer exists.
socket.on('connect', () => {
  console.log(`[Socket.IO] Connected with socket ID: ${socket.id}`);
  if (socket._callverseUserId) {
    console.log(`[Socket.IO] Re-registering user ${socket._callverseUserId} after reconnect`);
    socket.emit('register', { userId: socket._callverseUserId, fcmToken: socket._callverseFcmToken });
  }
});

socket.on('disconnect', (reason) => {
  console.log(`[Socket.IO] Disconnected. Reason: ${reason}`);
});

export default socket;
