import { io } from 'socket.io-client';

export const SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export default socket;
