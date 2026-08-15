import React, { useState } from 'react';
import { SERVER_URL } from '../utils/socket';
import { Phone, Mail, Lock, User, Globe } from 'lucide-react';
import useStore from '../store';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { 
  auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  signInWithPopup,
  googleProvider 
} from '../firebase';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import './AuthScreen.css';

export default function AuthScreen() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  
  const setUser = useStore((state) => state.setUser);

  const clearMessages = () => {
    setAuthError('');
    setAuthSuccess('');
  };

  const syncWithBackend = async (firebaseUser, chosenUsername = '') => {
    try {
      const res = await fetch(`${SERVER_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: firebaseUser.uid || firebaseUser.id, 
          username: chosenUsername || firebaseUser.displayName || firebaseUser.name || '',
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
      setAuthError('Could not sync user with backend server.');
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    clearMessages();
    if (!email || !password) return;
    if (isRegistering && username.trim().length < 3) {
      setAuthError('Username must be at least 3 characters.');
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
      setAuthError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    clearMessages();
    setLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // Native Google Sign-In via Google Play Services on Android
        const result = await FirebaseAuthentication.signInWithGoogle();
        if (result?.credential?.idToken) {
          const credential = GoogleAuthProvider.credential(result.credential.idToken);
          const userCredential = await signInWithCredential(auth, credential);
          await syncWithBackend(userCredential.user);
        } else if (result?.user) {
          await syncWithBackend(result.user);
        }
      } else {
        // Standard Web Popup
        const result = await signInWithPopup(auth, googleProvider);
        if (result && result.user) {
          await syncWithBackend(result.user);
        }
      }
    } catch (err) {
      console.error('Google Sign-In error:', err);
      if (err.code !== 'auth/popup-closed-by-user' && err.message !== 'canceled') {
        let msg = err.message || 'Google Sign-In failed.';
        if (err.code === 'auth/unauthorized-domain') {
          msg = 'Domain not authorized. Please ensure your domain is added in Firebase Console.';
        }
        setAuthError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    clearMessages();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setAuthError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setAuthSuccess('Password reset link sent! Please check your inbox and spam folder.');
    } catch (err) {
      console.error(err);
      let msg = err.message;
      if (err.code === 'auth/user-not-found') msg = 'No account found with this email address.';
      if (err.code === 'auth/invalid-email') msg = 'Please enter a valid email address.';
      if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Please try again in a few minutes.';
      setAuthError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="home-bg-orb home-bg-orb--1" />
      <div className="home-bg-orb home-bg-orb--3" />
      
      <div className="auth-card glass-card animate-slideUp">
        <div className="auth-logo">
          <img src="/logo.png" alt="CallVerse Logo" className="auth-logo-img" style={{ width: '64px', height: '64px', objectFit: 'contain', marginBottom: '12px' }} />
          <h1>CallVerse</h1>
        </div>
        
        <p className="auth-subtitle">
          {isResetting ? 'Reset your password' : isRegistering ? 'Create a secure account' : 'Sign in to your account'}
        </p>

        {authError && <div className="auth-error-msg">{authError}</div>}
        {authSuccess && <div className="auth-success-msg">{authSuccess}</div>}
        
        {isResetting ? (
          <form onSubmit={handleForgotPassword} className="auth-form">
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
            <button 
              type="submit" 
              className="home-btn home-btn--primary auth-btn"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <button 
              type="button" 
              className="auth-toggle-link"
              onClick={() => { clearMessages(); setIsResetting(false); }}
              disabled={loading}
              style={{ marginTop: '16px', display: 'block', width: '100%', textAlign: 'center' }}
            >
              Back to Sign In
            </button>
          </form>
        ) : (
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
                onClick={() => { clearMessages(); setIsResetting(true); }}
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
        )}

        {!isResetting && (
          <>
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
                onClick={() => { clearMessages(); setIsRegistering(!isRegistering); }}
                className="auth-toggle-link"
                disabled={loading}
              >
                {isRegistering ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
