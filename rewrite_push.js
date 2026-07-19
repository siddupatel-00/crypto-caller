const fs = require('fs');
let code = fs.readFileSync('src/hooks/usePushNotifications.js', 'utf8');

const newCode = `import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import useStore from '../store';
import { SERVER_URL } from '../utils/socket';

export default function usePushNotifications() {
  const user = useStore(state => state.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      registerPush();
    }
  }, [user]);

  const registerPush = async () => {
    try {
      const permStatus = await PushNotifications.requestPermissions();
      if (permStatus.receive === 'granted') {
        await PushNotifications.register();
        
        if (Capacitor.getPlatform() === 'android') {
          await PushNotifications.createChannel({
            id: 'calls',
            name: 'Incoming Calls',
            description: 'Notifications for incoming calls',
            importance: 5,
            visibility: 1,
            vibration: true,
          });

          await PushNotifications.registerActionTypes({
            types: [
              {
                id: 'CALL_ACTION',
                actions: [
                  { id: 'accept', title: 'Accept', foreground: true },
                  { id: 'decline', title: 'Decline', foreground: true, destructive: true }
                ]
              }
            ]
          });
        }
      } else {
        console.log('Push notification permission denied');
      }
    } catch (e) {
      console.error('Error requesting push permissions', e);
    }

    PushNotifications.addListener('registration', (token) => {
      console.log('FCM Push registration success, token: ' + token.value);
      useStore.getState().setFcmToken(token.value);
      const { socket } = require('../utils/socket');
      const currentUser = useStore.getState().user;
      if (socket.connected && currentUser) {
        socket.emit('update-fcm-token', token.value);
      }
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Error on registration: ', JSON.stringify(error));
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received: ', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', async (notification) => {
      console.log('Push action performed: ', notification);
      const data = notification.notification.data;
      const actionId = notification.actionId; // 'accept', 'decline', or 'tap'

      if (data && data.action === 'incoming_call' && data.callId) {
        
        if (actionId === 'decline') {
          try {
            await fetch(\`\${SERVER_URL}/api/calls/decline\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callId: data.callId })
            });
            // We just let it silently background/stay there
          } catch(e) { console.error('Decline error', e); }
          return;
        }

        // For accept or normal tap, validate first
        try {
          const res = await fetch(\`\${SERVER_URL}/api/calls/validate/\${data.callId}\`);
          const statusData = await res.json();
          if (statusData.status === 'RINGING' || statusData.status === 'ACTIVE') {
            navigate(\`/call/\${data.callerId}?incoming=true&callId=\${data.callId}&type=\${data.callType || 'video'}\`);
          } else {
            alert(\`Call ended (\${statusData.status})\`);
            // Toaster or alert works better here than navigating
          }
        } catch(e) {
          console.error('Validation error', e);
        }
      }
    });
  };
}
`;

fs.writeFileSync('src/hooks/usePushNotifications.js', newCode);
