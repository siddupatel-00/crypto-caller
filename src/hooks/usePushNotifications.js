import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import useStore from '../store';

export default function usePushNotifications() {
  const user = useStore(state => state.user);

  useEffect(() => {
    // We only want to set up Push Notifications on actual native devices, not web browsers
    if (Capacitor.isNativePlatform()) {
      registerPush();
    }
  }, [user]); // re-run if user changes so we can attach token to user id if needed locally

  const registerPush = async () => {
    try {
      // Request permission
      const permStatus = await PushNotifications.requestPermissions();

      if (permStatus.receive === 'granted') {
        // Register with Apple / Google to receive push via APNS/FCM
        await PushNotifications.register();
        
        // Create high-priority notification channel for Android 8.0+
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

    // On success, we get an FCM token
    PushNotifications.addListener('registration', (token) => {
      console.log('FCM Push registration success, token: ' + token.value);
      // Store token globally so we can send it to the backend upon socket connect
      useStore.getState().setFcmToken(token.value);
      
      // If socket is already connected (Dashboard mounted before token arrived), send it immediately!
      const { socket } = require('../utils/socket');
      const currentUser = useStore.getState().user;
      if (socket.connected && currentUser) {
        socket.emit('update-fcm-token', token.value);
      }
    });

    // On error
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Error on registration: ', JSON.stringify(error));
    });

    // Show us the notification payload if the app is open on our device
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received: ', notification);
      // If we are in the app, maybe we don't need to do anything since WebSockets handle it.
      // Or we can show a local toast.
    });

    // Method called when tapping on a notification
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push action performed: ', notification);
      const data = notification.notification.data;
      // If the data contains caller information, we could navigate to the call screen
      // For now, tapping the notification opens the app, and WebSockets will immediately 
      // sync the incoming call state if it's still ringing!
    });
  };
}
