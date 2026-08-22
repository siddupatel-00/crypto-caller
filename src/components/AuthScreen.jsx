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
            <img src="/logo.png" alt="" style={{width:28,height:28,objectFit:'contain'}} onError={e=>e.currentTarget.style.display='none'} />
            <span className="display">CallVerse</span>
            <span className="mono auth__mono">— 2026</span>
          </div>
          <div className="auth__rule" />
        </div>

        <div className="auth__hero">
          <p className="label" style={{marginBottom:16}}>Private calling, crafted</p>
          <h1 className="display auth__h1">Calls that<br/><em>feel</em> present.</h1>
          <p className="auth__sub">End-to-end encrypted. Peer-to-peer. No data harvested. Built for people who care about how things feel.</p>
          <div className="auth__stats">
            <div><span className="display auth__num">~48ms</span><span className="mono">median connect</span></div>
            <div className="auth__vline" />
            <div><span className="display auth__num">E2E</span><span className="mono">encrypted</span></div>
            <div className="auth__vline" />
            <div><span className="display auth__num">P2P</span><span className="mono">WebRTC</span></div>
          </div>
        </div>

        <div className="auth__footer mono">UI · 01 — No orbs. No glass. Just type, hairlines, and intent.</div>
      </div>

      <div className="auth__right">
        <div className="auth__card">
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
                <span style={{width:16,height:16,borderRadius:4,background:'#fff',display:'grid',placeItems:'center',fontSize:10,fontWeight:800,color:'#111'}}>G</span>
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
