import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import db from './db.js';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    serviceAccount = JSON.parse(readFileSync('./firebase-service-account.json', 'utf8'));
  }
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
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

// ── Socket.IO Presence & Signaling ──────────────────────────────

// Map<userId, socketId>
const onlineUsers = new Map();
// Map<socketId, userId>
const socketToUser = new Map();

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
      // Broadcast to friends that user is online
      socket.broadcast.emit('user-status-changed', { userId, isOnline: true });

      // Save FCM token if provided
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
    }
  });

  // Call Initiation
  socket.on('call-request', async ({ targetId, callerData }) => {
    const callerId = socketToUser.get(socket.id);
    console.log(`[Signaling Server Log] Received 'call-request' from socket ${socket.id} (user ${callerId}) targeting user ${targetId}.`);
    const targetSocket = onlineUsers.get(targetId);
    
    if (targetSocket) {
      console.log(`[Signaling Server Log] Forwarding 'incoming-call' to target socket ${targetSocket} (user ${targetId}).`);
      io.to(targetSocket).emit('incoming-call', { 
        callerId,
        callerData // { username }
      });
    } else {
      console.log(`[Signaling Server Log] Target user ${targetId} is offline. Attempting push notification...`);
      // Try to send push notification
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
              body: `${callerData?.username || 'Someone'} is calling you!`
            },
            data: {
              callerId: callerId,
              action: 'incoming_call'
            },
            token: fcmToken
          };
          
          await admin.messaging().send(message);
          console.log(`[Signaling Server Log] Push notification sent successfully to ${targetId}`);
        } else {
          console.warn(`[Signaling Server Log] No FCM token found for user ${targetId}. Sending 'call-failed'.`);
          socket.emit('call-failed', { reason: 'User offline and no push token' });
        }
      } catch (err) {
        console.error(`[Signaling Server Log] Error sending push notification:`, err);
        socket.emit('call-failed', { reason: 'Failed to send push notification' });
      }
    }
  });

  socket.on('call-accept', ({ targetId }) => {
    const receiverId = socketToUser.get(socket.id);
    console.log(`[Signaling Server Log] Received 'call-accept' from socket ${socket.id} (user ${receiverId}) targeting user ${targetId}.`);
    const targetSocket = onlineUsers.get(targetId);
    if (targetSocket) {
      console.log(`[Signaling Server Log] Forwarding 'call-accepted' to target socket ${targetSocket} (user ${targetId}).`);
      io.to(targetSocket).emit('call-accepted', {
        targetId: receiverId
      });
    } else {
      console.warn(`[Signaling Server Log] Caller user ${targetId} is offline for accept notification.`);
    }
  });

  socket.on('call-decline', ({ targetId }) => {
    const declinerId = socketToUser.get(socket.id);
    console.log(`[Signaling Server Log] Received 'call-decline' from socket ${socket.id} (user ${declinerId}) targeting user ${targetId}.`);
    const targetSocket = onlineUsers.get(targetId);
    if (targetSocket) {
      console.log(`[Signaling Server Log] Forwarding 'call-declined' to target socket ${targetSocket} (user ${targetId}).`);
      io.to(targetSocket).emit('call-declined');
    }
  });

  // WebRTC Signaling
  socket.on('offer', ({ targetId, offer }) => {
    const fromId = socketToUser.get(socket.id);
    console.log(`[Signaling Server Log] Received 'offer' from socket ${socket.id} (user ${fromId}) targeting user ${targetId}.`);
    const targetSocket = onlineUsers.get(targetId);
    if (targetSocket) {
      console.log(`[Signaling Server Log] Forwarding 'offer' to target socket ${targetSocket} (user ${targetId}).`);
      io.to(targetSocket).emit('offer', { offer, from: fromId });
    } else {
      console.warn(`[Signaling Server Log] Target ${targetId} offline for 'offer'.`);
    }
  });

  socket.on('answer', ({ targetId, answer }) => {
    const fromId = socketToUser.get(socket.id);
    console.log(`[Signaling Server Log] Received 'answer' from socket ${socket.id} (user ${fromId}) targeting user ${targetId}.`);
    const targetSocket = onlineUsers.get(targetId);
    if (targetSocket) {
      console.log(`[Signaling Server Log] Forwarding 'answer' to target socket ${targetSocket} (user ${targetId}).`);
      io.to(targetSocket).emit('answer', { answer, from: fromId });
    } else {
      console.warn(`[Signaling Server Log] Target ${targetId} offline for 'answer'.`);
    }
  });

  socket.on('ice-candidate', ({ targetId, candidate }) => {
    const fromId = socketToUser.get(socket.id);
    console.log(`[Signaling Server Log] Received 'ice-candidate' from socket ${socket.id} (user ${fromId}) targeting user ${targetId}. Candidate: ${candidate.candidate.substring(0, 35)}...`);
    const targetSocket = onlineUsers.get(targetId);
    if (targetSocket) {
      io.to(targetSocket).emit('ice-candidate', { candidate, from: fromId });
    }
  });

  socket.on('end-call', ({ targetId }) => {
    const fromId = socketToUser.get(socket.id);
    console.log(`[Signaling Server Log] Received 'end-call' from socket ${socket.id} (user ${fromId}) targeting user ${targetId}.`);
    const targetSocket = onlineUsers.get(targetId);
    if (targetSocket) {
      io.to(targetSocket).emit('call-ended');
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
  console.log(`🚀 Signaling server running on port ${PORT}`);
});
