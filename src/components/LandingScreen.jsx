import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Video, ShieldCheck, Zap, Users, Smartphone, ArrowRight, Copy, Star, Globe, Lock } from 'lucide-react';
import useStore from '../store';
import './LandingScreen.css';

function LogoMark({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, background: 'var(--accent)',
      display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0
    }}>
      <Video size={size * 0.55} />
    </div>
  );
}

export default function LandingScreen() {
  const user = useStore((s) => s.user);
  const navigate = useNavigate();
  const primaryHref = user ? '/dashboard' : '/login';

  return (
    <div className="land">
      {/* Navigation */}
      <header className="land__nav">
        <a href="/" className="land__brand">
          <LogoMark size={28} />
          <span>CallVerse</span>
        </a>
        <nav className="land__links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#download">Download</a>
        </nav>
        <Link to={primaryHref} className="btn btn--primary btn--compact land__navCta">
          {user ? 'Open app' : 'Sign in'} <ArrowRight size={14} />
        </Link>
      </header>

      {/* Hero Section */}
      <section className="land__hero">
        <div className="land__heroCopy">
          <div className="land__pill">
            <ShieldCheck size={13} />
            <span>End-to-End Encrypted · Peer-to-Peer</span>
          </div>
          <h1 className="land__h1">
            Private calling,<br />made simple.
          </h1>
          <p className="land__sub">
            CallVerse connects you face-to-face with crystal-clear video and audio directly over WebRTC. 
            No tracking, no logs, and no phone numbers required.
          </p>
          <div className="land__ctas">
            <Link to={primaryHref} className="btn btn--primary btn--lg">
              {user ? 'Open Dashboard' : 'Start Calling Free'} <ArrowRight size={16} />
            </Link>
            <a href="#download" className="btn btn--secondary btn--lg">
              <Smartphone size={16} /> Download Android APK
            </a>
          </div>
          <div className="land__metaRow">
            <span><Lock size={13} /> DTLS-SRTP Encryption</span>
            <span><Globe size={13} /> Web &amp; Android</span>
            <span><Zap size={13} /> Zero Latency</span>
          </div>
        </div>

        {/* Hero Visual Mock */}
        <div className="land__visual">
          <div className="land__phone">
            <div className="land__phoneNotch" />
            <div className="land__callCard">
              <div className="land__callTop">
                <span className="land__liveDot" /> Connected · 04:21
              </div>
              <div className="land__avatarRow">
                <div className="land__avatar">A</div>
              </div>
              <div className="land__callerName">Amelia</div>
              <div className="land__encLine">
                <ShieldCheck size={12} /> Direct P2P Line
              </div>
              <div className="land__controls">
                <div className="lc lc--active"><Video size={16} /></div>
                <div className="lc"><Phone size={16} /></div>
                <div className="lc lc--end"><Phone size={16} style={{ transform: 'rotate(135deg)' }} /></div>
              </div>
            </div>
            <div className="land__chip chip1"><Star size={11} fill="var(--accent)" color="var(--accent)" /> Buddy Online</div>
            <div className="land__chip chip2"><ShieldCheck size={11} /> ~48ms Connect</div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="land__section">
        <div className="land__sectionHead">
          <span className="label">Capabilities</span>
          <h2 className="land__h2">Engineered for clarity and privacy.</h2>
        </div>
        <div className="land__grid">
          <div className="land__card">
            <div className="land__icon"><Lock size={18} /></div>
            <h3>End-to-End Encrypted</h3>
            <p>Media flows directly between devices over WebRTC with DTLS-SRTP. Calls are never stored on servers.</p>
          </div>
          <div className="land__card">
            <div className="land__icon"><Video size={18} /></div>
            <h3>HD Video &amp; Voice</h3>
            <p>Adaptive bitrate keeps calls smooth. Switch between speaker and earpiece seamlessly on Android.</p>
          </div>
          <div className="land__card">
            <div className="land__icon"><Users size={18} /></div>
            <h3>Friends, Not Numbers</h3>
            <p>Connect using unique @usernames or 24-hour invite codes. Keep your personal phone number private.</p>
          </div>
          <div className="land__card">
            <div className="land__icon"><Smartphone size={18} /></div>
            <h3>Native Android App</h3>
            <p>Lightweight APK with background lock-screen notifications, custom ringtones, and instant call pickup.</p>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how" className="land__section">
        <div className="land__sectionHead">
          <span className="label">Workflow</span>
          <h2 className="land__h2">Three taps to talk.</h2>
        </div>
        <div className="land__steps">
          <div className="land__step">
            <span className="land__stepNum">01</span>
            <h3>Create your handle</h3>
            <p>Sign in with email or Google and claim your unique, lowercase @username.</p>
          </div>
          <div className="land__step">
            <span className="land__stepNum">02</span>
            <h3>Share your invite code</h3>
            <p>Give your 24-hour invite code to your friends or family to link accounts.</p>
          </div>
          <div className="land__step">
            <span className="land__stepNum">03</span>
            <h3>Tap to connect</h3>
            <p>When the status dot turns green, tap voice or video to begin your direct call.</p>
          </div>
        </div>
      </section>

      {/* Download / CTA Box */}
      <section id="download" className="land__section">
        <div className="land__ctaCard">
          <LogoMark size={44} />
          <h2 className="land__ctaTitle">Ready when you are.</h2>
          <p className="land__ctaSub">
            Free forever for direct person-to-person calls. Install the Android APK or call directly from your browser.
          </p>
          <div className="land__ctas">
            <a href="/CallVerse-latest.apk" download className="btn btn--primary btn--lg">
              <Smartphone size={16} /> Download APK
            </a>
            <Link to={primaryHref} className="btn btn--secondary btn--lg">
              {user ? 'Open Web App' : 'Use in Browser'} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="land__ctaBadge mono">
            v1.0 · P2P WebRTC · Android &amp; Web
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="land__footer">
        <div>© 2026 CallVerse. End-to-end encrypted private calling.</div>
        <button onClick={() => navigate(primaryHref)} className="land__footLink">
          {user ? 'Dashboard →' : 'Sign in →'}
        </button>
      </footer>
    </div>
  );
}
