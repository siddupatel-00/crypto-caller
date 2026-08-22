import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';
import useStore from '../store';
import socket from '../utils/socket';

const Ringtone = registerPlugin('Ringtone');

export default function usePushNotifications() {
  const user = useStore(state => state.user);
  const navigate = useNavigate();

  // Register listeners exactly once, with proper cleanup
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    const listeners = [
      PushNotifications.addListener('registration', (token) => {
        console.log('FCM Push registration success, token: ' + token.value);
        useStore.getState().setFcmToken(token.value);
        const currentUser = useStore.getState().user;
        if (currentUser?.id) {
          Ringtone.setCurrentUser({ userId: currentUser.id }).catch(console.error);
        }
        socket._callverseFcmToken = token.value;
        if (socket.connected && currentUser) {
          socket.emit('update-fcm-token', token.value);
        }
      }),
      PushNotifications.addListener('registrationError', (error) => {
        console.error('Error on registration: ', JSON.stringify(error));
      }),
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const data = notification?.data || {};
        const currentUserId = useStore.getState().user?.id;

        if (data.callerId && currentUserId && data.callerId === currentUserId) {
          console.log('Ignoring push notification from self');
          return;
        }

        if (data.action === 'missed_call') {
          console.log('Missed call notification received in foreground:', data);
          return;
        }

        console.log('Push received in foreground:', notification);
      }),
      PushNotifications.addListener('pushNotificationActionPerformed', async (notification) => {
        console.log('Push action performed: ', notification);
        const data = notification?.notification?.data || {};
        const currentUserId = useStore.getState().user?.id;

        if (data.callerId && currentUserId && data.callerId === currentUserId) {
          console.log('Ignoring push action from self');
          return;
        }

        if (data.action === 'call_answer' && data.callId) {
          if (socket.connected) {
            socket.emit('call-accept', { callId: data.callId });
          }
          navigate(`/call/${data.callerId}?incoming=true&callId=${data.callId}&type=${data.callType || 'video'}&callerName=${data.callerName || 'Someone'}&autoAccept=true&t=${Date.now()}`);
          return;
        }

        if (data.action === 'call_decline' && data.callId) {
          if (socket.connected) {
            socket.emit('call-decline', { callId: data.callId });
          }
          return;
        }

        if (data.action === 'incoming_call' && data.callId) {
          navigate(`/call/${data.callerId}?incoming=true&callId=${data.callId}&type=${data.callType || 'video'}&callerName=${data.callerName || 'Someone'}&t=${Date.now()}`);
          return;
        }

        if (data.action === 'missed_call') {
          navigate('/history');
        }
      }),
    ];

    return () => {
      listeners.forEach(l => l.remove());
    };
  }, [navigate]);

  // Request permissions / create channels when a user logs in
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (user?.id) {
      Ringtone.setCurrentUser({ userId: user.id }).catch(console.error);
    }

    (async () => {
      try {
        const permStatus = await PushNotifications.requestPermissions();
        if (permStatus.receive !== 'granted') {
          console.log('Push notification permission denied');
          return;
        }
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
          await PushNotifications.createChannel({
            id: 'missed_calls',
            name: 'Missed Calls',
            description: 'Notifications for missed calls',
            importance: 3,
            visibility: 1,
            vibration: false,
          });
        }
      } catch (e) {
        console.error('Error requesting push permissions', e);
      }
    })();
  }, [user]);
}
