import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'fs';
import db from './db.js';
import dotenv from 'dotenv';
dotenv.config();

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = JSON.parse(readFileSync('./firebase-service-account.json', 'utf8'));
}

initializeApp({
  credential: cert(serviceAccount)
});
console.log('Firebase Admin initialized successfully.');

async function run() {
  try {
    const res = await db.execute('SELECT fcm_token FROM users WHERE username = ?', ['siddu']);
    if (res.rows.length === 0 || !res.rows[0].fcm_token) {
      console.log('No token found for siddu');
      return;
    }
    const token = res.rows[0].fcm_token;
    
    console.log('Attempting push notification...');
    const message = {
      notification: {
        title: 'Diagnostic Test',
        body: `Testing modular Firebase Admin`
      },
      data: {
        callerId: 'test_id',
        action: 'incoming_call'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'calls',
          sound: 'default'
        }
      },
      token: token
    };
    
    try {
      const response = await getMessaging().send(message);
      console.log('Firebase Admin Response (SUCCESS), Message ID:', response);
    } catch (pushErr) {
      console.error('Firebase Admin Response (ERROR):', pushErr);
    }
    
  } catch (e) {
    console.error('Error in test:', e);
  }
}

run();
