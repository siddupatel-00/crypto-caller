import React, { useState } from 'react';
import { SERVER_URL } from '../utils/socket';
import { Phone, Mail, Lock, User, Globe } from 'lucide-react';
import useStore from '../store';
import { 
  auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  signInWithPopup,
  googleProvider 
} from '../firebase';
import './AuthScreen.css';

export default function AuthScreen() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  
  const setUser = useStore((state) => state.setUser);

  const syncWithBackend = async (firebaseUser, chosenUsername = '') => {
    try {
      const res = await fetch(`${SERVER_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: firebaseUser.uid, 
          username: chosenUsername || firebaseUser.displayName || '',
          email: firebaseUser.email 
        }),
      });
      const data = await res.json();
      if (data.id) {
        // Set welcome status in localStorage for DashboardScreen to consume
        localStorage.setItem('welcome_type', data.isNewUser ? 'popup' : 'toast');
        setUser(data);
      }
    } catch (err) {
      console.error('Backend sync failed:', err);
      alert('Could not sync user with backend server.');
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    if (isRegistering && username.trim().length < 3) {
      alert('Username must be at least 3 characters.');
      return;
    }

    setLoading(true);
    try {
      if (isRegistering) {
        // Sign Up
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await syncWithBackend(userCredential.user, username);
      } else {
        // Sign In
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await syncWithBackend(userCredential.user);
      }
    } catch (err) {
      console.error(err);
      let msg = err.message;
      if (err.code === 'auth/email-already-in-use') msg = 'Email already in use.';
      if (err.code === 'auth/invalid-credential') msg = 'Invalid email or password.';
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await syncWithBackend(result.user);
    } catch (err) {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user') {
        alert(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      alert('Please enter your email address first.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      alert('Password reset link sent to your email!');
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  return (
    <div className="auth-screen">
      <div className="home-bg-orb home-bg-orb--1" />
      <div className="home-bg-orb home-bg-orb--3" />
      
      <div className="auth-card glass-card animate-slideUp">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Phone size={28} />
          </div>
          <h1>CallVerse</h1>
        </div>
        
        <p className="auth-subtitle">
          {isRegistering ? 'Create a secure account' : 'Sign in to your account'}
        </p>
        
        <form onSubmit={handleAuth} className="auth-form">
          {/* Username (Only for Sign Up) */}
          {isRegistering && (
            <div className="input-group">
              <User size={18} className="input-icon" />
              <input
                type="text"
                className="auth-input-field"
                placeholder="Username (e.g. alex)"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                disabled={loading}
                maxLength={20}
                required
              />
            </div>
          )}

          {/* Email */}
          <div className="input-group">
            <Mail size={18} className="input-icon" />
            <input
              type="email"
              className="auth-input-field"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Password */}
          <div className="input-group">
            <Lock size={18} className="input-icon" />
            <input
              type="password"
              className="auth-input-field"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Forgot Password */}
          {!isRegistering && (
            <button 
              type="button" 
              className="forgot-pass-btn" 
              onClick={handleForgotPassword}
              disabled={loading}
            >
              Forgot Password?
            </button>
          )}

          <button 
            type="submit" 
            className="home-btn home-btn--primary auth-btn"
            disabled={loading}
          >
            {loading ? 'Processing...' : isRegistering ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">
          <span>OR</span>
        </div>

        <button 
          onClick={handleGoogleSignIn} 
          className="google-btn"
          disabled={loading}
        >
          <Globe size={18} />
          Continue with Google
        </button>

        <p className="auth-toggle-text">
          {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button 
            onClick={() => setIsRegistering(!isRegistering)}
            className="auth-toggle-link"
            disabled={loading}
          >
            {isRegistering ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}
