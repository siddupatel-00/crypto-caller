import db from './db.js';

async function run() {
  try {
    const res = await db.execute('SELECT id, username, fcm_token FROM users WHERE fcm_token IS NOT NULL');
    console.log('--- FCM Tokens in Database ---');
    if (res.rows.length === 0) {
      console.log('No users with FCM tokens found.');
    } else {
      for (const row of res.rows) {
        const token = row.fcm_token;
        const masked = token.substring(0, 15) + '... (Length: ' + token.length + ')';
        console.log(`User: ${row.username} (ID: ${row.id}) -> Token: ${masked}`);
      }
    }
    console.log('------------------------------');
  } catch (e) {
    console.error('Error querying DB:', e);
  }
}

run();
