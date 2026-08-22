import React, { useState } from 'react';
import { SERVER_URL } from '../utils/socket';
import { Mail, Lock, User, ArrowRight, Sparkles } from 'lucide-react';
import useStore from '../store';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithPopup, googleProvider } from '../firebase';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import './AuthScreen.css';

export default function AuthScreen(){
  const [isRegistering,setIsRegistering]=useState(false);
  const [isResetting,setIsResetting]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [username,setUsername]=useState('');
  const [loading,setLoading]=useState(false);
  const [authError,setAuthError]=useState('');
  const [authSuccess,setAuthSuccess]=useState('');
  const setUser=useStore(s=>s.setUser);
  const clear=()=>{setAuthError('');setAuthSuccess('');};
  const syncWithBackend=async(firebaseUser,chosen='')=>{
    try{
      const res=await fetch(`${SERVER_URL}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:firebaseUser.uid||firebaseUser.id,username:chosen||firebaseUser.displayName||'',email:firebaseUser.email})});
      const data=await res.json(); if(data.id){localStorage.setItem('welcome_type',data.isNewUser?'popup':'toast'); setUser(data);}
    }catch{setAuthError('Could not sync with server.')}
  };
  const handleAuth=async(e)=>{
    e.preventDefault(); clear();
    if(!email||!password) return; if(isRegistering && username.trim().length<3){setAuthError('Username must be at least 3 characters.');return;}
    setLoading(true);
    try{
      if(isRegistering){const c=await createUserWithEmailAndPassword(auth,email,password); await syncWithBackend(c.user,username);}
      else{const c=await signInWithEmailAndPassword(auth,email,password); await syncWithBackend(c.user);}
    }catch(err){let m=err.message; if(err.code==='auth/email-already-in-use') m='Email already in use.'; if(err.code==='auth/invalid-credential') m='Invalid email or password.'; setAuthError(m);}
    finally{setLoading(false);}
  };
  const handleGoogle=async()=>{
    clear(); setLoading(true);
    try{
      if(Capacitor.isNativePlatform()){const r=await FirebaseAuthentication.signInWithGoogle(); if(r?.credential?.idToken){const cred=GoogleAuthProvider.credential(r.credential.idToken); const c=await signInWithCredential(auth,cred); await syncWithBackend(c.user);} else if(r?.user) await syncWithBackend(r.user);}
      else{const r=await signInWithPopup(auth,googleProvider); if(r?.user) await syncWithBackend(r.user);}
    }catch(err){ if(err.code!=='auth/popup-closed-by-user' && err.message!=='canceled'){ let m=err.message||'Google Sign-In failed.'; if(err.code==='auth/unauthorized-domain') m='Domain not authorized in Firebase Console.'; setAuthError(m);}}
    finally{setLoading(false);}
  };
  const handleForgot=async(e)=>{
    e.preventDefault(); clear(); const clean=email.trim(); if(!clean){setAuthError('Please enter your email address.');return;}
    setLoading(true); try{await sendPasswordResetEmail(auth,clean); setAuthSuccess('Reset link sent — check inbox and spam.');}catch(err){let m=err.message; if(err.code==='auth/user-not-found') m='No account found with this email.'; if(err.code==='auth/invalid-email') m='Please enter a valid email.'; setAuthError(m);} finally{setLoading(false);}
  };

  return (
    <div className="auth">
      <div className="auth__left">
        <div className="auth__brand">
          <div className="auth__wordmark">
            <a href="/" aria-label="Back to home"><img src="/logo.png" alt="" style={{width:28,height:28,objectFit:'contain'}} onError={e=>e.currentTarget.style.display='none'} /></a>
            <span className="display">CallVerse</span>
            <span className="mono auth__mono">— 2026</span>
          </div>
          <div className="auth__rule" />
        </div>

        <div className="auth__hero">
          <p className="label" style={{marginBottom:16}}>Private calling, crafted</p>
          <h1 className="display auth__h1">Calls that<br/><span className="grad-text">feel present.</span></h1>
          <p className="auth__sub">End-to-end encrypted. Peer-to-peer. No data harvested. Built for people who care about how things feel.</p>
          <div className="auth__stats">
            <div><span className="display auth__num">~48ms</span><span className="mono">median connect</span></div>
            <div className="auth__vline" />
            <div><span className="display auth__num">E2E</span><span className="mono">encrypted</span></div>
            <div className="auth__vline" />
            <div><span className="display auth__num">P2P</span><span className="mono">WebRTC</span></div>
          </div>
        </div>

        <div className="auth__footer mono">⚡ Powered by WebRTC · End-to-End Encrypted</div>
      </div>

      <div className="auth__right">
        <div className="auth__card">
          <a href="/" className="mono auth__back">← Back</a>
          <div className="auth__cardHead">
            <div className="auth__eyebrow"><Sparkles size={12}/><span className="mono">{isResetting ? 'Reset' : isRegistering ? 'Create account' : 'Welcome back'}</span></div>
            <h2 className="auth__title">{isResetting ? 'Reset password' : isRegistering ? 'Create your account' : 'Sign in'}</h2>
            <p className="auth__desc">{isResetting ? 'We’ll send a reset link to your email.' : isRegistering ? '3 fields. 30 seconds. You’re in.' : 'Enter your credentials to continue.'}</p>
          </div>

          {authError && <div className="auth__alert auth__alert--error">{authError}</div>}
          {authSuccess && <div className="auth__alert auth__alert--success">{authSuccess}</div>}

          {isResetting ? (
            <form onSubmit={handleForgot} className="auth__form">
              <label className="field"><span className="label">Email</span><div className="field__wrap"><Mail size={14}/><input type="email" placeholder="you@domain.com" value={email} onChange={e=>setEmail(e.target.value)} disabled={loading} required /></div></label>
              <button type="submit" className="btn btn--primary" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'} <ArrowRight size={14}/></button>
              <button type="button" className="btn btn--ghost" onClick={()=>{clear();setIsResetting(false);}}>Back to sign in</button>
            </form>
          ) : (
            <form onSubmit={handleAuth} className="auth__form">
              {isRegistering && <label className="field"><span className="label">Username</span><div className="field__wrap"><User size={14}/><input type="text" placeholder="alex" value={username} onChange={e=>setUsername(e.target.value.replace(/[^a-zA-Z0-9]/g,''))} disabled={loading} maxLength={20} required /><span className="field__suffix mono">@{username || '—'}</span></div></label>}
              <label className="field"><span className="label">Email</span><div className="field__wrap"><Mail size={14}/><input type="email" placeholder="you@domain.com" value={email} onChange={e=>setEmail(e.target.value)} disabled={loading} required /></div></label>
              <label className="field"><span className="label">Password</span><div className="field__wrap"><Lock size={14}/><input type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} disabled={loading} required /></div></label>
              {!isRegistering && <button type="button" className="auth__link" onClick={()=>{clear();setIsResetting(true);}}>Forgot password?</button>}
              <button type="submit" className="btn btn--primary" disabled={loading}>{loading ? 'Please wait…' : isRegistering ? 'Create account' : 'Sign in'} <ArrowRight size={14}/></button>
            </form>
          )}

          {!isResetting && (
            <>
              <div className="auth__divider"><span className="hr" /><span className="mono">or</span><span className="hr" /></div>
              <button onClick={handleGoogle} className="btn btn--secondary" disabled={loading}>
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{flexShrink:0}}>
                  <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                  <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41.4 34.9 44 30 44 24c0-1.3-.1-2.7-.4-3.9z"/>
                </svg>
                Continue with Google
              </button>
              <p className="auth__toggle mono">{isRegistering ? 'Already have an account?' : "Don't have an account?"} <button onClick={()=>{clear();setIsRegistering(v=>!v);}} className="auth__link" style={{display:'inline'}}>{isRegistering ? 'Sign in' : 'Sign up'}</button></p>
            </>
          )}
          <p className="mono auth__tiny">By continuing you agree to our Terms & Privacy — peer-to-peer, nothing stored.</p>
        </div>
      </div>
    </div>
  );
}
