import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import useStore from '../store';
import socket from '../utils/socket';

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
      if (socket.connected && useStore.getState().user) {
        socket.emit('update-fcm-token', token.value);
      }
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Error on registration: ', JSON.stringify(error));
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      // Notification received while app is in foreground — suppress it.
      // The DashboardScreen's incoming-call socket listener handles in-app calls.
      console.log('Push received in foreground (suppressed): ', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', async (notification) => {
      console.log('Push action performed: ', notification);
      const data = notification.notification.data;

      if (data && data.action === 'incoming_call' && data.callId) {
        // User tapped the notification — navigate to the call screen
        // No autoAccept: user will answer/decline in the app UI
        navigate(`/call/${data.callerId}?incoming=true&callId=${data.callId}&type=${data.callType || 'video'}&callerName=${data.callerName || 'Someone'}`);
      }
    });
  };
}
