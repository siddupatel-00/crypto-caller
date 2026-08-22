import React, { useEffect, useRef, useState } from 'react';
import './SplashScreen.css';

export default function SplashScreen({ onComplete }) {
  const [phase, setPhase] = useState('logo'); // logo -> expand -> complete
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(false);
  const timersRef = useRef([]);
  const intervalRef = useRef(null);

  useEffect(() => {
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setPhase('complete');
      setTimeout(() => onComplete?.(), 300);
    };

    // Phase 1: Logo animation (0-800ms), then progress bar
    timersRef.current.push(setTimeout(() => {
      setPhase('expand');
      let p = 0;
      intervalRef.current = setInterval(() => {
        p += Math.random() * 15 + 5;
        if (p >= 100) {
          p = 100;
          clearInterval(intervalRef.current);
          setProgress(p);
          timersRef.current.push(setTimeout(finish, 350));
          return;
        }
        setProgress(p);
      }, 80);
    }, 800));

    // Fallback: never let the splash hang
    timersRef.current.push(setTimeout(finish, 4000));

    return () => {
      timersRef.current.forEach(clearTimeout);
      clearInterval(intervalRef.current);
    };
  }, [onComplete]);

  return (
    <div className="splash-screen" data-phase={phase}>
      <div className="splash-bg">
        <div className="splash-orb orb-1" />
        <div className="splash-orb orb-2" />
        <div className="splash-orb orb-3" />
      </div>

      <div className="splash-content">
        <div className="splash-logo-wrapper">
          <div className="splash-logo">
            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="splashGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8B5CF6" />
                  <stop offset="50%" stopColor="#A855F7" />
                  <stop offset="100%" stopColor="#EC4899" />
                </linearGradient>
              </defs>
              <path 
                d="M18 10C18 7.79 19.79 6 22 6H42C44.21 6 46 7.79 46 10V34C46 36.21 44.21 38 42 38H22C19.79 38 18 36.21 18 34V10Z" 
                stroke="url(#splashGradient)" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
              <path 
                d="M32 16C32 13.79 33.79 12 36 12H38" 
                stroke="url(#splashGradient)" 
                strokeWidth="2.5" 
                strokeLinecap="round"
              />
              <circle cx="32" cy="32" r="6" stroke="url(#splashGradient)" strokeWidth="2.5" />
              <path 
                d="M24 32C24 29.79 25.79 28 28 28H30" 
                stroke="url(#splashGradient)" 
                strokeWidth="2.5" 
                strokeLinecap="round"
              />
<path
                d="M36 32C36 34.21 34.21 36 32 36H30"
                stroke="url(#splashGradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M50 22C50 20.34 51.34 19 53 19H55" 
                stroke="url(#splashGradient)" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                opacity="0.6"
              />
              <path 
                d="M50 30C50 28.34 51.34 27 53 27H56" 
                stroke="url(#splashGradient)" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                opacity="0.4"
              />
            </svg>
          </div>
          <div className="splash-ring" />
          <div className="splash-ring ring-2" />
          <div className="splash-ring ring-3" />
        </div>

        <h1 className="splash-title">CallVerse</h1>
        <p className="splash-subtitle">Secure peer-to-peer calling</p>

        <div className="splash-progress">
          <div className="splash-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <p className="splash-loading-text">
          {phase === 'logo' ? 'Initializing...' : phase === 'expand' ? 'Connecting...' : 'Ready'}
        </p>
      </div>
    </div>
  );
}