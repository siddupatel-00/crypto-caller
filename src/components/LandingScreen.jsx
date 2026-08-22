import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Video, ShieldCheck, Zap, Users, Smartphone, ArrowRight, Copy, Star, Globe, Lock } from 'lucide-react';
import useStore from '../store';
import './LandingScreen.css';

function LogoMark({ size = 34 }) {
  return (
    <img src="/logo.svg" alt="CallVerse logo" width={size} height={size} style={{ width: size, height: size, display: 'block' }} />
  );
}

export default function LandingScreen() {
  const user = useStore((s) => s.user);
  const navigate = useNavigate();
  const primaryHref = user ? '/dashboard' : '/login';

  return (
    <div className="land">
      <div className="land__glow" aria-hidden="true">
        <span className="g1" /><span className="g2" /><span className="g3" />
      </div>

      <header className="land__nav">
        <a href="/" className="land__brand" aria-label="CallVerse home">
          <LogoMark />
          <span className="display">CallVerse</span>
        </a>
        <nav className="land__links mono" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#download">Download</a>
        </nav>
        <Link to={primaryHref} className="btn btn--primary land__navCta">
          {user ? 'Open app' : 'Sign in'} <ArrowRight size={15} />
        </Link>
      </header>

      {/* ===== Hero ===== */}
      <section className="land__hero">
        <div className="land__heroCopy animate-slideUp">
          <span className="land__pill"><Zap size={12} /> Free · Encrypted · Peer-to-peer</span>
          <h1 className="display land__h1">
            Calls that feel<br /><span className="grad-text">present.</span>
          </h1>
          <p className="land__sub">
            CallVerse connects you face-to-face with crystal-clear video and voice over a direct
            peer-to-peer line. No servers in the middle of your conversation. No data harvested. Ever.
          </p>
          <div className="land__ctas">
            <Link to={primaryHref} className="btn btn--primary btn--lg">
              {user ? 'Open CallVerse' : 'Start calling free'} <ArrowRight size={16} />
            </Link>
            <a href="#download" className="btn btn--secondary btn--lg"><Smartphone size={16} /> Get the APK</a>
          </div>
          <div className="land__metaRow mono">
            <span><Lock size={12} /> End-to-end encrypted</span>
            <span><Globe size={12} /> Works on web &amp; Android</span>
            <span><Copy size={12} /> One-tap invite codes</span>
          </div>
        </div>

        <div className="land__visual animate-scaleUp" aria-hidden="true">
          <div className="land__phone">
            <div className="land__phoneNotch" />
            <div className="land__callCard">
              <div className="land__callTop mono"><span className="land__liveDot" /> connected · 04:21</div>
              <div className="land__avatarRow">
                <div className="land__avatar a1">A</div>
                <div className="land__avatarRing r1" />
              </div>
              <p className="land__callerName">Amelia</p>
              <p className="mono land__encLine"><ShieldCheck size={11} /> E2E encrypted · P2P</p>
              <div className="land__controls">
                <button className="lc on" tabIndex={-1}><Video size={17} /></button>
                <button className="lc" tabIndex={-1}><Phone size={17} /></button>
                <button className="lc lc--end" tabIndex={-1}>✕</button>
              </div>
            </div>
            <div className="land__chip chip1 mono"><Star size={10} fill="#EC4899" color="#EC4899" /> buddy online</div>
            <div className="land__chip chip2 mono"><ShieldCheck size={10} /> ~48ms connect</div>
          </div>
        </div>
      </section>

      {/* ===== Features ===== */}
      <section id="features" className="land__section">
        <p className="label">Why CallVerse</p>
        <h2 className="display land__h2">Private by design,<br />simple by choice.</h2>
        <div className="land__grid">
          <article className="land__card">
            <div className="land__icon"><ShieldCheck size={20} /></div>
            <h3>End-to-end encrypted</h3>
            <p>Media flows directly between devices over WebRTC with DTLS-SRTP. Your calls are never stored or routed through our servers.</p>
          </article>
          <article className="land__card">
            <div className="land__icon land__icon--pink"><Phone size={20} /></div>
            <h3>HD video &amp; voice</h3>
            <p>Adaptive quality keeps calls smooth on any network — switch between voice and video mid-call, flip cameras, and route audio to speaker or earpiece.</p>
          </article>
          <article className="land__card">
            <div className="land__icon"><Users size={20} /></div>
            <h3>Friends, not phone books</h3>
            <p>Add people by username or a 24-hour invite code. Star your closest contacts as buddies and they always rise to the top.</p>
          </article>
          <article className="land__card">
            <div className="land__icon land__icon--pink"><Smartphone size={20} /></div>
            <h3>Built for Android</h3>
            <p>A lightweight APK with native ringtone support, push notifications for incoming calls, and deep links that open calls instantly.</p>
          </article>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section id="how" className="land__section land__section--tight">
        <p className="label">How it works</p>
        <h2 className="display land__h2">Three taps to talk.</h2>
        <ol className="land__steps">
          <li>
            <span className="mono">01</span>
            <div><h3>Create your handle</h3><p>Sign up with email or Google and pick a unique @username.</p></div>
          </li>
          <li>
            <span className="mono">02</span>
            <div><h3>Share your invite code</h3><p>A rotating 24-hour code lets friends find you — no phone number needed.</p></div>
          </li>
          <li>
            <span className="mono">03</span>
            <div><h3>Tap voice or video</h3><p>When the dot turns green, your friend is one tap away. That's it.</p></div>
          </li>
        </ol>
      </section>

      {/* ===== Download / CTA ===== */}
      <section id="download" className="land__cta">
        <LogoMark size={56} />
        <h2 className="display">Ready when you are.</h2>
        <p>Free forever for person-to-person calls. Install the Android APK or call straight from your browser.</p>
        <div className="land__ctas land__ctas--center">
          <a href="/CallVerse-latest.apk" download className="btn btn--primary btn--lg"><Smartphone size={16} /> Download APK</a>
          <Link to={primaryHref} className="btn btn--secondary btn--lg">{user ? 'Open app' : 'Use in browser'} <ArrowRight size={16} /></Link>
        </div>
        <p className="mono land__tiny">v1.0 · WebRTC · DTLS-SRTP encryption</p>
      </section>

      <footer className="land__footer">
        <span className="mono">© 2026 CallVerse — private calling, crafted.</span>
        <button onClick={() => navigate(primaryHref)} className="land__footLink mono">Sign in →</button>
      </footer>
    </div>
  );
}
