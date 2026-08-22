import React, { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import AuthScreen from './components/AuthScreen';
import LandingScreen from './components/LandingScreen';
import DashboardScreen from './components/DashboardScreen';
import CallScreen from './components/CallScreen';
import FriendProfileScreen from './components/FriendProfileScreen';
import SplashScreen from './components/SplashScreen';
import useStore from './store';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { SERVER_URL } from './utils/socket';
import socket from './utils/socket';
import usePushNotifications from './hooks/usePushNotifications';
import { Capacitor, registerPlugin } from '@capacitor/core';
import './App.css';

const Ringtone = registerPlugin('Ringtone');

function App() {
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  const theme = useStore((state) => state.theme);
  const [authLoading, setAuthLoading] = useState(true);
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  // Initialize Push Notifications
  usePushNotifications();
  const navigate = useNavigate();

  // Apply Theme
  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  // Connect socket as soon as we have a user — this must happen here (App-level)
  // because deep links can open /call/:targetId directly, skipping DashboardScreen.
  useEffect(() => {
    if (user) {
      if (Capacitor.isNativePlatform()) {
        Ringtone.setCurrentUser({ userId: user.id }).catch(console.error);
      }
      socket._callverseUserId = user.id;
      socket._callverseFcmToken = useStore.getState().fcmToken;
      if (!socket.connected) {
        socket.connect();
      } else {
        socket.emit('register', { userId: user.id, fcmToken: useStore.getState().fcmToken });
      }
    }
  }, [user]);

  // Global incoming-call listener
  useEffect(() => {
    const handleIncomingCall = (data) => {
      console.log('[App] Global incoming-call received:', data);
      if (data?.callerId && user?.id && data.callerId === user.id) {
        console.log('[App] Ignoring self incoming-call');
        return;
      }
      if (!window.location.pathname.startsWith(`/call/${data.callerId}`)) {
        navigate(`/call/${data.callerId}?incoming=true&callerName=${data.callerData?.username || 'Someone'}&type=${data.callerData?.type || 'video'}&callId=${data.callId}`);
      }
    };
    socket.on('incoming-call', handleIncomingCall);
    return () => socket.off('incoming-call', handleIncomingCall);
  }, [navigate, user]);

  // Deep Links & Back Button
  useEffect(() => {
    import('@capacitor/app').then(({ App: CapacitorApp }) => {
      CapacitorApp.addListener('appUrlOpen', data => {
        if (data.url.startsWith('callverse://call/')) {
          const url = new URL(data.url);
          navigate(url.pathname + url.search);
        }
      });
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (window.location.pathname.startsWith('/call/')) {
          navigate('/dashboard', { replace: true });
        } else if (window.location.pathname === '/dashboard' || window.location.pathname === '/') {
          CapacitorApp.exitApp();
        } else if (canGoBack) {
          window.history.back();
        } else {
          CapacitorApp.exitApp();
        }
      });
    }).catch(console.error);
  }, [navigate]);

  // Restore session
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && !user) {
        try {
          const res = await fetch(`${SERVER_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: firebaseUser.uid,
              username: firebaseUser.displayName || '',
              email: firebaseUser.email
            }),
          });
          const data = await res.json();
          if (data.id) {
            setUser(data);
          }
        } catch (err) {
          console.error('Auto-login failed:', err);
        }
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Wait for both auth check and splash animation
  if (authLoading || !splashDone) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return (
    <div className="app">
      <Routes>
        <Route 
          path="/" 
          element={user ? <Navigate to="/dashboard" /> : <LandingScreen />} 
        />
        <Route 
          path="/login" 
          element={user ? <Navigate to="/dashboard" /> : <AuthScreen />} 
        />
        <Route 
          path="/dashboard" 
          element={user ? <DashboardScreen initialTab="friends" /> : <Navigate to="/" />} 
        />
        <Route 
          path="/addfriend" 
          element={user ? <DashboardScreen initialTab="add-friend" /> : <Navigate to="/" />} 
        />
        <Route 
          path="/settings" 
          element={user ? <DashboardScreen initialTab="settings" /> : <Navigate to="/" />} 
        />
        <Route 
          path="/history" 
          element={user ? <DashboardScreen initialTab="history" /> : <Navigate to="/" />} 
        />
        <Route 
          path="/friend/:friendId" 
          element={user ? <FriendProfileScreen /> : <Navigate to="/" />} 
        />
        <Route 
          path="/call/:targetId" 
          element={user ? <CallScreen /> : <Navigate to="/" />} 
        />
      </Routes>
    </div>
  );
}

export default App;
