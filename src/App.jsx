import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AuthScreen from './components/AuthScreen';
import DashboardScreen from './components/DashboardScreen';
import CallScreen from './components/CallScreen';
import FriendProfileScreen from './components/FriendProfileScreen';
import useStore from './store';
import './App.css';

function App() {
  const user = useStore((state) => state.user);

  return (
    <div className="app">
      <Routes>
        <Route 
          path="/" 
          element={user ? <Navigate to="/dashboard" /> : <AuthScreen />} 
        />
        <Route 
          path="/dashboard" 
          element={user ? <DashboardScreen /> : <Navigate to="/" />} 
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
