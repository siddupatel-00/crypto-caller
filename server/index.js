import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import db from './db.js';
import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    serviceAccount = JSON.parse(readFileSync('./firebase-service-account.json', 'utf8'));
  }
  
  initializeApp({
    credential: cert(serviceAccount)
  });
  console.log('Firebase Admin initialized successfully');
} catch (e) {
  console.error('Failed to initialize Firebase Admin. Push notifications will not work.', e);
}

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// ── Utils ────────────────────────────────────────────────────────
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Cleanup old history (older than 7 days)
setInterval(async () => {
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
  try {
    await db.execute({
      sql: 'DELETE FROM call_history WHERE timestamp < ?',
      args: [sevenDaysAgo]
    });
  } catch (e) {
    console.error('History cleanup error', e);
  }
}, 60 * 60 * 1000); // run every hour

// ── API Routes ──────────────────────────────────────────────────

// Auth: Login or Signup via Firebase UID
app.post('/api/login', async (req, res) => {
  const { id, username, email } = req.body;
  if (!id) return res.status(400).json({ error: 'User ID required' });

  try {
    const userRes = await db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [id]
    });
    let user = userRes.rows[0];
    let isNewUser = false;
    
    if (!user) {
      isNewUser = true;
      const finalUsername = username ? username.trim().toLowerCase() : email.split('@')[0].toLowerCase();
      
      user = {
        id,
        username: finalUsername,
        invite_code: generateInviteCode(),
        code_expires_at: Date.now() + ONE_DAY_MS
      };
      await db.execute({
        sql: 'INSERT INTO users (id, username, invite_code, code_expires_at) VALUES (?, ?, ?, ?)',
        args: [user.id, user.username, user.invite_code, user.code_expires_at]
      });
    } else {
      // Check if invite code expired
      if (Date.now() > user.code_expires_at) {
        const newCode = generateInviteCode();
        const newExpiry = Date.now() + ONE_DAY_MS;
        await db.execute({
          sql: 'UPDATE users SET invite_code = ?, code_expires_at = ? WHERE id = ?',
          args: [newCode, newExpiry, user.id]
        });
        user.invite_code = newCode;
        user.code_expires_at = newExpiry;
      }
    }

    res.json({ ...user, isNewUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add friend by username or invite code
app.post('/api/friends/request', async (req, res) => {
  const { userId, target } = req.body; // target is username or invite code
  if (!userId || !target) return res.status(400).json({ error: 'Missing fields' });

  const normalizedTarget = target.trim().toLowerCase();
  
  try {
    const targetRes = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ? OR invite_code = ?',
      args: [normalizedTarget, target.trim().toUpperCase()]
    });
    const targetUser = targetRes.rows[0];

    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.id === userId) return res.status(400).json({ error: 'Cannot add yourself' });

    await db.execute({
      sql: 'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
      args: [userId, targetUser.id, 'pending']
    });
    
    // Notify target user via socket if online
    const targetSocket = onlineUsers.get(targetUser.id);
    if (targetSocket) {
      io.to(targetSocket).emit('friend-request', { from: userId });
    }

    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Request already exists or already friends' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Accept friend request
app.post('/api/friends/accept', async (req, res) => {
  const { userId, friendId } = req.body;
  
  try {
    await db.batch([
      {
        sql: "UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?",
        args: [friendId, userId]
      },
      {
        sql: "INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')",
        args: [userId, friendId]
      }
    ], "write");

    // Notify both
    const s1 = onlineUsers.get(userId);
    const s2 = onlineUsers.get(friendId);
    if (s1) io.to(s1).emit('friends-updated');
    if (s2) io.to(s2).emit('friends-updated');
    res.json({ success: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get Friends
app.get('/api/friends/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const friendsRes = await db.execute({
      sql: `
        SELECT u.id, u.username, f.status, f.alias, f.is_buddy, f.created_at 
        FROM friends f 
        JOIN users u ON f.friend_id = u.id 
        WHERE f.user_id = ? OR (f.friend_id = ? AND f.status = 'pending')
      `,
      args: [userId, userId]
    });
    
    const friends = friendsRes.rows;
    // Format to separate accepted and pending
    const accepted = [];
    const pendingIncoming = [];
    
    friends.forEach(f => {
      if (f.status === 'accepted') {
        // Add online status
        f.isOnline = onlineUsers.has(f.id);
        accepted.push(f);
      } else if (f.status === 'pending') {
        // It's incoming because we joined where friend_id = userId
        pendingIncoming.push(f);
      }
    });
    
    // Need another query for actual incoming requests because of the table design
    const incomingRes = await db.execute({
      sql: `
        SELECT u.id, u.username 
        FROM friends f 
        JOIN users u ON f.user_id = u.id 
        WHERE f.friend_id = ? AND f.status = 'pending'
      `,
      args: [userId]
    });
    const incoming = incomingRes.rows;

    res.json({ friends: accepted, requests: incoming });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update Alias
app.post('/api/friends/alias', async (req, res) => {
  const { userId, friendId, alias } = req.body;
  try {
    await db.execute({
      sql: 'UPDATE friends SET alias = ? WHERE user_id = ? AND friend_id = ?',
      args: [alias, userId, friendId]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Toggle Buddy
app.post('/api/friends/buddy', async (req, res) => {
  const { userId, friendId, isBuddy } = req.body;
  try {
    await db.execute({
      sql: 'UPDATE friends SET is_buddy = ? WHERE user_id = ? AND friend_id = ?',
      args: [isBuddy ? 1 : 0, userId, friendId]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Remove Friend
app.delete('/api/friends', async (req, res) => {
  const { userId, friendId } = req.body;
  try {
    await db.execute({
      sql: 'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      args: [userId, friendId, friendId, userId]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get History
app.get('/api/history/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const historyRes = await db.execute({
      sql: `
        SELECT h.id, h.duration, h.timestamp, h.status,
               u.username as other_user,
               f.alias as other_user_alias,
               CASE WHEN h.caller_id = ? THEN 'outgoing' ELSE 'incoming' END as type
        FROM call_history h
        JOIN users u ON (CASE WHEN h.caller_id = ? THEN h.receiver_id ELSE h.caller_id END) = u.id
        LEFT JOIN friends f ON (f.user_id = ? AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = ?)
        WHERE h.caller_id = ? OR h.receiver_id = ?
        ORDER BY h.timestamp DESC
      `,
      args: [userId, userId, userId, userId, userId, userId]
    });
    
    res.json(historyRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save Call
app.post('/api/history', async (req, res) => {
  const { callerId, receiverId, duration, status } = req.body;
  const id = uuidv4();
  try {
    await db.execute({
      sql: 'INSERT INTO call_history (id, caller_id, receiver_id, duration, status) VALUES (?, ?, ?, ?, ?)',
      args: [id, callerId, receiverId, duration, status || 'completed']
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Call Lifecycle API ──────────────────────────────────────────

app.get('/api/calls/validate/:callId', (req, res) => {
  const call = activeCalls.get(req.params.callId);
  if (!call) return res.json({ status: 'EXPIRED' });
  res.json({ status: call.status.toUpperCase(), call });
});

app.post('/api/calls/decline', (req, res) => {
  const { callId } = req.body;
  if (!callId) return res.status(400).json({ error: 'Missing callId' });
  
  const call = activeCalls.get(callId);
  if (call) {
    clearTimeout(call.timeoutId);
    activeCalls.delete(callId);
    
    // Notify caller that call was declined instantly
    const callerSocket = onlineUsers.get(call.callerId);
    if (callerSocket) {
      io.to(callerSocket).emit('call-declined', { callId });
    }
  }
  res.json({ success: true });
});

// ── Socket.IO Presence & Signaling ──────────────────────────────

// Map<userId, socketId>
const onlineUsers = new Map();
// Map<socketId, userId>
const socketToUser = new Map();
// Map<callId, { callId, callerId, targetId, callerData, status, timestamp, timeoutId }>
const activeCalls = new Map();

io.on('connection', (socket) => {
  
  const logSignal = (event, direction, callId, extra = '') => {
    const userId = socketToUser.get(socket.id) || 'unknown';
    console.log(`[${new Date().toISOString()}] [Server] [${direction}] ${event} | Socket: ${socket.id} | User: ${userId} | Call: ${callId} ${extra}`);
  };

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
          logSignal('incoming-call', 'EMIT', callId, `target: ${userId}`);
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
    logSignal('call-request', 'RECV', callId, `target: ${targetId} | type: ${callerData?.type}`);
    
    // Ensure only one active call per receiver
    for (const [existingCallId, call] of activeCalls.entries()) {
      if (call.targetId === targetId && call.status === 'ringing') {
        socket.emit('call-failed', { callId, reason: 'User is busy' });
        return;
      }
    }
    
    const callObj = {
      callId,
      callerId,
      targetId,
      callerData,
      status: 'ringing',
      timestamp: Date.now()
    };
    
    // Auto-expire after 30 seconds
    callObj.timeoutId = setTimeout(async () => {
      const c = activeCalls.get(callId);
      if (c && c.status === 'ringing') {
        c.status = 'missed';
        activeCalls.delete(callId);
        const cSocket = onlineUsers.get(callerId);
        if (cSocket) io.to(cSocket).emit('call-missed', { callId });

        // Send cancel push
        try {
          const userRes = await db.execute({ sql: 'SELECT fcm_token FROM users WHERE id = ?', args: [targetId] });
          const fcmToken = userRes.rows[0]?.fcm_token;
          if (fcmToken) {
            await getMessaging().send({
              data: { action: 'cancel_call', callId: callId },
              android: { priority: 'high' },
              token: fcmToken
            });
          }
        } catch (e) { console.error(e); }
      }
    }, 30000);
    
    activeCalls.set(callId, callObj);
    
    // Notify caller that call was registered
    socket.emit('call-initiated', { callId });

    const sendFcmMessage = async (targetUserId, payloadData) => {
      try {
        const userRes = await db.execute({
          sql: 'SELECT fcm_token FROM users WHERE id = ?',
          args: [targetUserId]
        });
        const fcmToken = userRes.rows[0]?.fcm_token;
        if (fcmToken) {
          await getMessaging().send({
            data: payloadData,
            android: { priority: 'high' },
            token: fcmToken
          });
          return true;
        }
      } catch (err) {
        console.error(`[Signaling Server Log] Error sending push notification:`, err);
      }
      return false;
    };

    const targetSocket = onlineUsers.get(targetId);
    if (targetSocket) {
      logSignal('incoming-call', 'EMIT', callId, `target socket: ${targetSocket}`);
      io.to(targetSocket).emit('incoming-call', { callId, callerId, callerData });
    }

    const pushSent = await sendFcmMessage(targetId, {
      callId: callId,
      callerId: callerId,
      callerName: callerData?.username || 'Someone',
      callType: callerData?.type || 'video',
      timestamp: String(Date.now()),
      action: 'incoming_call'
    });

    if (!pushSent && !targetSocket) {
      socket.emit('call-failed', { callId, reason: 'User offline and no push token' });
    }
  });

  socket.on('call-accept', ({ callId }) => {
    logSignal('call-accept', 'RECV', callId);
    const call = activeCalls.get(callId);
    if (call) {
      clearTimeout(call.timeoutId);
      call.status = 'accepted';
      const targetSocket = onlineUsers.get(call.callerId);
      if (targetSocket) {
        logSignal('call-accepted', 'EMIT', callId, `target socket: ${targetSocket}`);
        io.to(targetSocket).emit('call-accepted', { callId, targetId: call.targetId });
      }
      // Instantly kill the native ringtone on the receiver's phone just in case it's still ringing
      sendFcmMessage(call.targetId, { action: 'cancel_call', callId }).catch(console.error);
    } else {
      socket.emit('call-failed', { callId, reason: 'Call expired or cancelled by caller' });
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
    logSignal('offer', 'RECV', callId);
    const call = activeCalls.get(callId);
    if (call) {
      const targetSocket = onlineUsers.get(call.targetId);
      if (targetSocket) {
        logSignal('offer', 'EMIT', callId, `target socket: ${targetSocket}`);
        io.to(targetSocket).emit('offer', { callId, offer, from: call.callerId });
      }
    }
  });

  socket.on('answer', ({ callId, answer }) => {
    logSignal('answer', 'RECV', callId);
    const call = activeCalls.get(callId);
    if (call) {
      const targetSocket = onlineUsers.get(call.callerId);
      if (targetSocket) {
        logSignal('answer', 'EMIT', callId, `target socket: ${targetSocket}`);
        io.to(targetSocket).emit('answer', { callId, answer, from: call.targetId });
      }
    }
  });

  socket.on('ice-candidate', ({ callId, targetId, candidate }) => {
    logSignal('ice-candidate', 'RECV', callId, `candidate for: ${targetId}`);
    const targetSocket = onlineUsers.get(targetId);
    if (targetSocket) {
      logSignal('ice-candidate', 'EMIT', callId, `target socket: ${targetSocket}`);
      io.to(targetSocket).emit('ice-candidate', { callId, candidate, from: socketToUser.get(socket.id) });
    }
  });

  socket.on('end-call', async ({ callId }) => {
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

      // If call was still ringing, send cancel push
      if (call.status === 'ringing' && fromId === call.callerId) {
        try {
          const userRes = await db.execute({ sql: 'SELECT fcm_token FROM users WHERE id = ?', args: [otherUser] });
          const fcmToken = userRes.rows[0]?.fcm_token;
          if (fcmToken) {
            await getMessaging().send({
              data: { action: 'cancel_call', callId: callId },
              android: { priority: 'high' },
              token: fcmToken
            });
          }
        } catch (e) { console.error(e); }
      }
    }
  });

  socket.on('disconnect', () => {
    const userId = socketToUser.get(socket.id);
    if (userId) {
      logSignal('disconnect', 'RECV', 'N/A', `Starting 15s grace period`);
      socketToUser.delete(socket.id);
      
      // Give the user a grace period to reconnect (e.g. app coming to foreground)
      setTimeout(() => {
        // If the user hasn't reconnected with a new socket
        if (onlineUsers.get(userId) === socket.id || !onlineUsers.has(userId)) {
          logSignal('disconnect-timeout', 'PROC', 'N/A', `Grace period expired. Dropping calls for ${userId}`);
          // End any active calls involving this user
          for (const [callId, call] of activeCalls.entries()) {
            if (call.callerId === userId || call.targetId === userId) {
              clearTimeout(call.timeoutId);
              activeCalls.delete(callId);
              const otherId = call.callerId === userId ? call.targetId : call.callerId;
              const otherSocket = onlineUsers.get(otherId);
              if (otherSocket) io.to(otherSocket).emit('call-ended', { callId });
            }
          }
          
          if (onlineUsers.get(userId) === socket.id) {
            onlineUsers.delete(userId);
          }
          io.emit('user-status-changed', { userId, isOnline: false });
        } else {
          logSignal('disconnect-reconnected', 'PROC', 'N/A', `User ${userId} reconnected during grace period.`);
        }
      }, 15000);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Signaling server running on port ${PORT}`);
});
