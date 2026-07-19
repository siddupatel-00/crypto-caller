const fs = require('fs');
let code = fs.readFileSync('server/index.js', 'utf8');

const newBlock = `// ── Socket.IO Presence & Signaling ──────────────────────────────

// Map<userId, socketId>
const onlineUsers = new Map();
// Map<socketId, userId>
const socketToUser = new Map();
// Map<callId, { callId, callerId, targetId, callerData, status, timestamp, timeoutId }>
const activeCalls = new Map();

io.on('connection', (socket) => {
  
  socket.on('register', async (data) => {
    let userId = null;
    let fcmToken = null;

    if (typeof data === 'string') {
      userId = data;
    } else if (data && data.userId) {
      userId = data.userId;
      fcmToken = data.fcmToken;
    }

    if (userId) {
      onlineUsers.set(userId, socket.id);
      socketToUser.set(socket.id, userId);
      socket.broadcast.emit('user-status-changed', { userId, isOnline: true });

      if (fcmToken) {
        try {
          await db.execute({
            sql: 'UPDATE users SET fcm_token = ? WHERE id = ?',
            args: [fcmToken, userId]
          });
        } catch (e) {
          console.error('Failed to save FCM token:', e);
        }
      }

      // Sync pending active calls for this user
      for (const [callId, call] of activeCalls.entries()) {
        if (call.targetId === userId && call.status === 'ringing' && (Date.now() - call.timestamp < 30000)) {
          console.log(\`[Signaling Server Log] Syncing pending active call \${callId} to reconnected user \${userId}\`);
          socket.emit('incoming-call', {
            callId: call.callId,
            callerId: call.callerId,
            callerData: call.callerData
          });
        }
      }
    }
  });

  socket.on('update-fcm-token', async (fcmToken) => {
    const userId = socketToUser.get(socket.id);
    if (userId && fcmToken) {
      try {
        await db.execute({
          sql: 'UPDATE users SET fcm_token = ? WHERE id = ?',
          args: [fcmToken, userId]
        });
      } catch (e) {
        console.error('Failed to update FCM token dynamically:', e);
      }
    }
  });

  // Call Initiation
  socket.on('call-request', async ({ targetId, callerData }) => {
    const callerId = socketToUser.get(socket.id);
    const callId = uuidv4();
    console.log(\`[Signaling Server Log] call-request \${callId} from \${callerId} to \${targetId}.\`);
    
    const callObj = {
      callId,
      callerId,
      targetId,
      callerData,
      status: 'ringing',
      timestamp: Date.now()
    };
    
    // Auto-expire after 30 seconds
    callObj.timeoutId = setTimeout(() => {
      const c = activeCalls.get(callId);
      if (c && c.status === 'ringing') {
        c.status = 'missed';
        activeCalls.delete(callId);
        const cSocket = onlineUsers.get(callerId);
        if (cSocket) io.to(cSocket).emit('call-missed', { callId });
      }
    }, 30000);
    
    activeCalls.set(callId, callObj);
    
    // Notify caller that call was registered
    socket.emit('call-initiated', { callId });

    const targetSocket = onlineUsers.get(targetId);
    if (targetSocket) {
      io.to(targetSocket).emit('incoming-call', { callId, callerId, callerData });
    }

    try {
      const userRes = await db.execute({
        sql: 'SELECT fcm_token FROM users WHERE id = ?',
        args: [targetId]
      });
      const fcmToken = userRes.rows[0]?.fcm_token;
      
      if (fcmToken) {
        const message = {
          notification: {
            title: 'Incoming Call',
            body: \`\${callerData?.username || 'Someone'} is calling you!\`
          },
          data: {
            callId: callId,
            callerId: callerId,
            callType: callerData?.type || 'video',
            action: 'incoming_call'
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'calls',
              sound: 'default',
              clickAction: 'CALL_ACTION'
            }
          },
          token: fcmToken
        };
        await getMessaging().send(message);
      } else if (!targetSocket) {
        socket.emit('call-failed', { callId, reason: 'User offline and no push token' });
      }
    } catch (err) {
      console.error(\`[Signaling Server Log] Error sending push notification:\`, err);
    }
  });

  socket.on('call-accept', ({ callId }) => {
    const call = activeCalls.get(callId);
    if (call) {
      clearTimeout(call.timeoutId);
      call.status = 'accepted';
      const targetSocket = onlineUsers.get(call.callerId);
      if (targetSocket) {
        io.to(targetSocket).emit('call-accepted', { callId, targetId: call.targetId });
      }
    }
  });

  socket.on('call-decline', ({ callId }) => {
    const call = activeCalls.get(callId);
    if (call) {
      clearTimeout(call.timeoutId);
      call.status = 'declined';
      activeCalls.delete(callId);
      const targetSocket = onlineUsers.get(call.callerId);
      if (targetSocket) {
        io.to(targetSocket).emit('call-declined', { callId });
      }
    }
  });

  socket.on('offer', ({ callId, offer }) => {
    const call = activeCalls.get(callId);
    if (call) {
      const targetSocket = onlineUsers.get(call.targetId);
      if (targetSocket) {
        io.to(targetSocket).emit('offer', { callId, offer, from: call.callerId });
      }
    }
  });

  socket.on('answer', ({ callId, answer }) => {
    const call = activeCalls.get(callId);
    if (call) {
      const targetSocket = onlineUsers.get(call.callerId);
      if (targetSocket) {
        io.to(targetSocket).emit('answer', { callId, answer, from: call.targetId });
      }
    }
  });

  socket.on('ice-candidate', ({ callId, targetId, candidate }) => {
    const targetSocket = onlineUsers.get(targetId);
    if (targetSocket) {
      io.to(targetSocket).emit('ice-candidate', { callId, candidate, from: socketToUser.get(socket.id) });
    }
  });

  socket.on('end-call', ({ callId }) => {
    const call = activeCalls.get(callId);
    if (call) {
      clearTimeout(call.timeoutId);
      activeCalls.delete(callId);
      const fromId = socketToUser.get(socket.id);
      const otherUser = fromId === call.callerId ? call.targetId : call.callerId;
      const targetSocket = onlineUsers.get(otherUser);
      if (targetSocket) {
        io.to(targetSocket).emit('call-ended', { callId });
      }
    }
  });

  socket.on('disconnect', () => {
    const userId = socketToUser.get(socket.id);
    if (userId) {
      onlineUsers.delete(userId);
      socketToUser.delete(socket.id);
      io.emit('user-status-changed', { userId, isOnline: false });
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(\`🚀 Signaling server running on port \${PORT}\`);
});
`;

const replaceIndex = code.indexOf('// ── Socket.IO Presence & Signaling ──────────────────────────────');
code = code.substring(0, replaceIndex) + newBlock;
fs.writeFileSync('server/index.js', code);
