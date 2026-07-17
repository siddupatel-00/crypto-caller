import { io } from 'socket.io-client';

const socket = io('https://crypto-caller.onrender.com', {
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('Successfully connected to production socket server!');
  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout waiting for connection.');
  process.exit(1);
}, 10000);
