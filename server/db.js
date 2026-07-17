import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function initSchema() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        invite_code TEXT UNIQUE NOT NULL,
        code_expires_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS friends (
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending', 'accepted')) NOT NULL DEFAULT 'pending',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (user_id, friend_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS call_history (
        id TEXT PRIMARY KEY,
        caller_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        duration INTEGER DEFAULT 0,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Add new columns if they don't exist
    try { await db.execute("ALTER TABLE friends ADD COLUMN alias TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE friends ADD COLUMN is_buddy INTEGER DEFAULT 0;"); } catch (e) {}
    try { await db.execute("ALTER TABLE call_history ADD COLUMN status TEXT DEFAULT 'completed';"); } catch (e) {}

    console.log('⚡ Turso Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Turso schema:', error);
  }
}

initSchema();

export default db;
