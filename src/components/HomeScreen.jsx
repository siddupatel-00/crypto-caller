import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Shield, Zap, Infinity } from 'lucide-react';
import './HomeScreen.css';

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const features = [
  {
    icon: Shield,
    title: 'End-to-End Encrypted',
    description: 'Your calls are fully private with E2E encryption.',
  },
  {
    icon: Zap,
    title: 'Ultra Low Data',
    description: 'Optimized codecs that use minimal bandwidth.',
  },
  {
    icon: Infinity,
    title: 'Unlimited & Free',
    description: 'No limits, no subscriptions, no hidden fees.',
  },
];

export default function HomeScreen() {
  const [roomCode, setRoomCode] = useState('');
  const navigate = useNavigate();

  const handleJoinCall = () => {
    const trimmed = roomCode.trim().toUpperCase();
    if (trimmed.length >= 4 && trimmed.length <= 6) {
      navigate(`/call/${trimmed}`);
    }
  };

  const handleCreateRoom = () => {
    const code = generateRoomCode();
    navigate(`/call/${code}`);
  };

  const handleInputChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length <= 6) {
      setRoomCode(value);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleJoinCall();
    }
  };

  return (
    <div className="home-screen">
      <div className="home-bg-orb home-bg-orb--1" />
      <div className="home-bg-orb home-bg-orb--2" />
      <div className="home-bg-orb home-bg-orb--3" />

      <div className="home-content">
        <div className="home-logo animate-float">
          <div className="home-logo__icon">
            <Phone size={32} strokeWidth={2.5} />
          </div>
        </div>

        <h1 className="home-title">
          Call<span className="home-title__accent">Verse</span>
        </h1>

        <p className="home-tagline">
          Crystal clear calls. Zero cost. Total privacy.
        </p>

        <div className="home-features">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="feature-card glass-card"
              style={{ animationDelay: `${index * 0.1 + 0.3}s` }}
            >
              <div className="feature-card__icon">
                <feature.icon size={22} />
              </div>
              <h3 className="feature-card__title">{feature.title}</h3>
              <p className="feature-card__desc">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="home-actions glass-card">
          <div className="home-input-group">
            <input
              type="text"
              className="home-input"
              placeholder="Enter room code"
              value={roomCode}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              maxLength={6}
              aria-label="Room code"
            />
            <button
              className="home-btn home-btn--primary"
              onClick={handleJoinCall}
              disabled={roomCode.trim().length < 4}
            >
              Join Call
            </button>
          </div>

          <div className="home-divider">
            <span className="home-divider__line" />
            <span className="home-divider__text">or</span>
            <span className="home-divider__line" />
          </div>

          <button
            className="home-btn home-btn--secondary"
            onClick={handleCreateRoom}
          >
            Create Room
          </button>
        </div>

        <p className="home-footer">
          Powered by WebRTC &middot; Peer-to-peer &middot; No servers store your data
        </p>
      </div>
    </div>
  );
}
