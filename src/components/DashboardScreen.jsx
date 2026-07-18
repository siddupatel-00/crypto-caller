import React, { useState, useEffect } from 'react';
import { SERVER_URL } from '../utils/socket';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Clock, Users, Phone, LogOut, Check, X, Copy, Sparkles, Smile, Settings, Video, Star, Trash2, Edit2, Calendar } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import useStore from '../store';
import socket from '../utils/socket';
import { auth, signOut } from '../firebase';
import { ringtoneSynth } from '../utils/ringtone';
import './DashboardScreen.css';

export default function DashboardScreen() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const ringTimeout = useStore((state) => state.ringTimeout);
  const setRingTimeout = useStore((state) => state.setRingTimeout);
  const ringtoneEnabled = useStore((state) => state.ringtoneEnabled);
  const setRingtoneEnabled = useStore((state) => state.setRingtoneEnabled);
  const selectedRingtone = useStore((state) => state.selectedRingtone);
  const setSelectedRingtone = useStore((state) => state.setSelectedRingtone);
  const ringtoneVolume = useStore((state) => state.ringtoneVolume);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('friends');
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [addInput, setAddInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // Welcome States
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [welcomeToast, setWelcomeToast] = useState('');

  // Friend Profile Modal
  const [editAlias, setEditAlias] = useState('');

  const fetchFriends = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/friends/${user.id}`);
      const data = await res.json();
      setFriends(data.friends || []);
      setRequests(data.requests || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/history/${user.id}`);
      const data = await res.json();
      setHistory(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const sortedFriends = React.useMemo(() => {
    return [...friends].sort((a, b) => {
      // 1. Buddies first
      if (a.is_buddy && !b.is_buddy) return -1;
      if (!a.is_buddy && b.is_buddy) return 1;
      // 2. Online status next
      if (a.isOnline === b.isOnline) {
        return (a.alias || a.username).localeCompare(b.alias || b.username);
      }
      return a.isOnline ? -1 : 1;
    }).filter(f => {
      if (!searchQuery) return true;
      const s = searchQuery.toLowerCase();
      return (f.alias?.toLowerCase().includes(s) || f.username.toLowerCase().includes(s));
    });
  }, [friends, searchQuery]);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    // Trigger Welcome Prompts
    const welcomeType = localStorage.getItem('welcome_type');
    if (welcomeType === 'popup') {
      setShowWelcomePopup(true);
    } else if (welcomeType === 'toast') {
      setWelcomeToast(`Welcome back, ${user.username}! 👋`);
      setTimeout(() => setWelcomeToast(''), 4000);
    }
    localStorage.removeItem('welcome_type');

    socket.connect();
    socket.emit('register', user.id);

    fetchFriends();
    fetchHistory();

    socket.on('friend-request', fetchFriends);
    socket.on('friends-updated', fetchFriends);
    socket.on('user-status-changed', fetchFriends);
    
    socket.on('incoming-call', (data) => {
      console.log(`[Signaling Log] [User B] Received 'incoming-call' event! data:`, data);
      console.log(`[Signaling Log] [User B] Navigating to Call screen: /call/${data.callerId}?incoming=true...`);
      navigate(`/call/${data.callerId}?incoming=true&callerName=${data.callerData.username}&type=${data.callerData.type || 'video'}`);
    });

    return () => {
      socket.off('friend-request');
      socket.off('friends-updated');
      socket.off('user-status-changed');
      socket.off('incoming-call');
      ringtoneSynth.stop();
    };
  }, [user]);

  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (!addInput.trim()) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, target: addInput }),
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else {
        alert('Friend request sent!');
        setAddInput('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcceptRequest = async (friendId) => {
    try {
      await fetch(`${SERVER_URL}/api/friends/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, friendId }),
      });
      fetchFriends();
    } catch (e) {
      console.error(e);
    }
  };

  const startCall = (friendId, type) => {
    navigate(`/call/${friendId}?type=${type}`);
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(user.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      logout();
      navigate('/');
    } catch (e) {
      console.error(e);
    }
  };

  const togglePreview = (tone) => {
    if (isPreviewPlaying) {
      ringtoneSynth.stop();
      setIsPreviewPlaying(false);
    } else {
      ringtoneSynth.play(tone, ringtoneVolume);
      setIsPreviewPlaying(true);
    }
  };

  const updateAlias = async () => {
    if (!selectedFriend) return;
    try {
      await fetch(`${SERVER_URL}/api/friends/alias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, friendId: selectedFriend.id, alias: editAlias }),
      });
      setSelectedFriend(prev => ({ ...prev, alias: editAlias }));
      fetchFriends();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleBuddy = async () => {
    if (!selectedFriend) return;
    const newBuddyStatus = !selectedFriend.is_buddy;
    try {
      await fetch(`${SERVER_URL}/api/friends/buddy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, friendId: selectedFriend.id, isBuddy: newBuddyStatus }),
      });
      setSelectedFriend(prev => ({ ...prev, is_buddy: newBuddyStatus }));
      fetchFriends();
    } catch (e) {
      console.error(e);
    }
  };

  const removeFriend = async () => {
    if (!selectedFriend) return;
    if (!window.confirm(`Are you sure you want to remove ${selectedFriend.alias || selectedFriend.username}?`)) return;
    try {
      await fetch(`${SERVER_URL}/api/friends`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, friendId: selectedFriend.id }),
      });
      setSelectedFriend(null);
      fetchFriends();
    } catch (e) {
      console.error(e);
    }
  };

  // Calculate lifetime talk time for a specific friend
  const getLifetimeTalkTime = (friendId) => {
    const totalSeconds = history
      .filter(h => h.other_user === (friends.find(f => f.id === friendId)?.username || ''))
      .reduce((sum, call) => sum + (call.duration || 0), 0);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  return (
    <div className="dashboard-layout">
      {/* Welcome Toast Notification */}
      {welcomeToast && (
        <div className="welcome-toast glass animate-slideUp">
          <Smile size={18} className="toast-icon" />
          <span>{welcomeToast}</span>
        </div>
      )}

      {/* First-time Welcome Popup */}
      {showWelcomePopup && (
        <div className="welcome-popup-overlay">
          <div className="welcome-popup-content glass-card animate-scaleUp">
            <div className="welcome-popup-badge">
              <Sparkles size={24} />
            </div>
            <h2>Welcome to CallVerse! 🚀</h2>
            <p>Your privacy-first, high-quality, lightweight calling app is ready.</p>
            <div className="welcome-steps">
              <div className="step-row">
                <span className="step-num">1</span>
                <p>Share your <strong>24-hour Invite Code</strong> with friends to connect.</p>
              </div>
              <div className="step-row">
                <span className="step-num">2</span>
                <p>Wait for them to accept, or accept incoming requests in the dashboard.</p>
              </div>
              <div className="step-row">
                <span className="step-num">3</span>
                <p>Click "Call" when they are online to connect instantly!</p>
              </div>
            </div>
            <button className="home-btn home-btn--primary welcome-get-started-btn" onClick={() => setShowWelcomePopup(false)}>
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar glass">
        <div className="sidebar-header">
          <div className="user-profile">
            <div className="user-avatar">{user?.username?.charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <h3>{user?.username}</h3>
              <span className="user-status">Online</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === 'friends' ? 'active' : ''}`}
            onClick={() => setActiveTab('friends')}
          >
            <Users size={20} />
            Friends
            {requests.length > 0 && <span className="badge">{requests.length}</span>}
          </button>
          <button 
            className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Clock size={20} />
            Call History
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={20} />
            Settings
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="content-area">
          {activeTab === 'friends' && (
            <div className="friends-view animate-fadeIn">
              
              {/* Friends Header: Add & Search */}
              <div className="friends-header-actions glass-card" style={{ marginBottom: '24px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <form className="add-friend-form" onSubmit={handleAddFriend} style={{ display: 'flex', gap: '12px', width: '100%' }}>
                  <input 
                    type="text" 
                    placeholder="Add by username or 24h code..." 
                    value={addInput}
                    onChange={(e) => setAddInput(e.target.value)}
                    style={{ flex: 1, padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}
                  />
                  <button 
                    type="submit" 
                    className="home-btn home-btn--primary"
                    style={{
                      background: addInput.trim() ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)',
                      color: addInput.trim() ? '#fff' : '#888',
                      transition: 'all 0.3s ease',
                      whiteSpace: 'nowrap',
                      padding: '0 20px'
                    }}
                  >
                    <UserPlus size={18} />
                    <span className="hide-on-mobile">Add Friend</span>
                  </button>
                </form>
                
                <div className="search-bar" style={{ display: 'flex', position: 'relative' }}>
                  <input 
                    type="text" 
                    placeholder="Search your friends..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      color: '#fff',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>
              {requests.length > 0 && (
                <div className="requests-section">
                  <h2>Pending Requests</h2>
                  <div className="list-container">
                    {requests.map(req => (
                      <div key={req.id} className="list-item glass-card">
                        <div className="item-info">
                          <div className="user-avatar small">{req.username.charAt(0).toUpperCase()}</div>
                          <span>{req.username}</span>
                        </div>
                        <div className="item-actions">
                          <button className="action-btn accept" onClick={() => handleAcceptRequest(req.id)}>
                            <Check size={18} />
                          </button>
                          <button className="action-btn decline">
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h2>Your Friends</h2>
              {sortedFriends.length === 0 ? (
                <div className="empty-state">
                  <Users size={48} />
                  <p>No friends yet. Add someone to start calling!</p>
                </div>
              ) : (
                <div className="list-container">
                  {sortedFriends.map(friend => (
                    <div key={friend.id} className="list-item glass-card">
                      <div 
                        className="item-info" 
                        style={{ cursor: 'pointer' }} 
                        onClick={() => navigate(`/friend/${friend.id}`, { state: { friend, history } })}
                      >
                        <div className="user-avatar small relative">
                          {(friend.alias || friend.username).charAt(0).toUpperCase()}
                          <span className={`status-dot ${friend.isOnline ? 'online' : 'offline'}`} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {friend.is_buddy ? <Star size={14} fill="#FCD34D" color="#FCD34D" /> : null}
                            {friend.alias || friend.username}
                          </span>
                          {friend.alias && <span style={{ fontSize: '11px', color: '#666' }}>@{friend.username}</span>}
                        </div>
                      </div>
                      <div className="call-actions">
                        <button 
                          className="call-btn voice-btn" 
                          disabled={!friend.isOnline}
                          onClick={() => startCall(friend.id, 'voice')}
                          title="Voice Call"
                        >
                          <Phone size={18} />
                        </button>
                        <button 
                          className="call-btn video-btn" 
                          disabled={!friend.isOnline}
                          onClick={() => startCall(friend.id, 'video')}
                          title="Video Call"
                        >
                          <Video size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-view animate-fadeIn">
              <h2>Call History (Last 7 Days)</h2>
              {history.length === 0 ? (
                <div className="empty-state">
                  <Clock size={48} />
                  <p>No call history found.</p>
                </div>
              ) : (
                <div className="list-container">
                  {history.map(call => (
                    <div key={call.id} className="list-item glass-card history-item">
                      <div className="item-info">
                        <div className={`call-icon ${call.type}`}>
                          {call.type === 'incoming' ? <Phone size={16} /> : <Phone size={16} style={{ transform: 'rotate(135deg)' }} />}
                        </div>
                        <div className="history-details">
                          <span className="history-name">{call.other_user_alias || call.other_user}</span>
                          <span className={`history-status ${call.status !== 'completed' ? 'history-status-missed' : ''}`}>
                            {call.status === 'completed' 
                              ? (call.type === 'incoming' ? 'Incoming Call' : 'Outgoing Call')
                              : call.status === 'declined' ? 'Declined'
                              : call.status === 'missed' ? 'Missed Call'
                              : 'Not Answered'}
                            {call.status === 'completed' && ` • ${Math.floor(call.duration / 60)}m ${call.duration % 60}s`}
                          </span>
                        </div>
                      </div>
                      <span className="history-time">{formatDistanceToNow(new Date(call.timestamp * 1000), { addSuffix: true })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="settings-view animate-fadeIn glass-card" style={{ padding: '32px', maxWidth: '600px', margin: '0 auto' }}>
              <h2 style={{ marginBottom: '24px', fontSize: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>Settings</h2>
              
              {/* Profile & Invite Section */}
              <div className="settings-section" style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '16px', color: 'var(--primary-light)', marginBottom: '16px' }}>Profile & Invite</h3>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ color: '#a0a0a0', fontSize: '13px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Your 24h Invite Code</p>
                  <div 
                    onClick={copyInviteCode}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px',
                      cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                  >
                    <span style={{ fontSize: '18px', letterSpacing: '2px', fontFamily: 'monospace', color: 'var(--primary-light)' }}>{user?.invite_code}</span>
                    {copied ? <Check size={20} className="text-success" /> : <Copy size={20} color="#a0a0a0" />}
                  </div>
                  <p style={{ color: '#666', fontSize: '12px', marginTop: '12px' }}>Share this code with your friends so they can add you.</p>
                </div>
              </div>

              {/* Call Preferences */}
              <div className="settings-section" style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '16px', color: 'var(--primary-light)', marginBottom: '16px' }}>Call Preferences</h3>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#fff', fontWeight: '500' }}>Ring Timeout</label>
                    <p style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>How long your phone rings before a call ends.</p>
                    <select 
                      value={ringTimeout} 
                      onChange={(e) => setRingTimeout(parseInt(e.target.value, 10))}
                      style={{
                        padding: '12px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)',
                        color: '#fff', border: '1px solid rgba(255,255,255,0.1)', width: '100%', outline: 'none'
                      }}
                    >
                      <option value={15} style={{background: '#111'}}>15 Seconds</option>
                      <option value={30} style={{background: '#111'}}>30 Seconds (Default)</option>
                      <option value={45} style={{background: '#111'}}>45 Seconds</option>
                      <option value={60} style={{background: '#111'}}>60 Seconds</option>
                    </select>
                  </div>

                  <div style={{ paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '12px', marginBottom: '16px' }}>
                      <input 
                        type="checkbox" 
                        checked={ringtoneEnabled} 
                        onChange={(e) => {
                          setRingtoneEnabled(e.target.checked);
                          if (!e.target.checked) {
                            ringtoneSynth.stop();
                            setIsPreviewPlaying(false);
                          }
                        }}
                        style={{ width: '20px', height: '20px', accentColor: 'var(--primary)' }}
                      />
                      <span style={{ color: '#fff', fontWeight: '500' }}>Enable Incoming Ringtone</span>
                    </label>
                    
                    {ringtoneEnabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingLeft: '32px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '8px', color: '#a0a0a0', fontSize: '13px' }}>Sound Preset</label>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <select 
                              value={selectedRingtone} 
                              onChange={(e) => {
                                setSelectedRingtone(e.target.value);
                                if (isPreviewPlaying) ringtoneSynth.play(e.target.value, ringtoneVolume);
                              }}
                              style={{
                                padding: '10px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)',
                                color: '#fff', border: '1px solid rgba(255,255,255,0.1)', flex: 1, outline: 'none'
                              }}
                            >
                              <option value="marimba" style={{background: '#111'}}>Classic Marimba</option>
                              <option value="whatsapp" style={{background: '#111'}}>WhatsApp Bell</option>
                              <option value="signal" style={{background: '#111'}}>Signal Chime</option>
                              <option value="telegram" style={{background: '#111'}}>Telegram Trill</option>
                              <option value="bells" style={{background: '#111'}}>Echo Bells</option>
                              <option value="pulse" style={{background: '#111'}}>Digital Pulse</option>
                              <option value="zen" style={{background: '#111'}}>Zen Bowl</option>
                              <option value="cyber" style={{background: '#111'}}>Cyber Tech</option>
                            </select>
                            <button 
                              onClick={() => togglePreview(selectedRingtone)}
                              style={{
                                padding: '0 20px', borderRadius: '10px',
                                background: isPreviewPlaying ? 'rgba(239, 68, 68, 0.2)' : 'rgba(108, 99, 255, 0.2)',
                                color: isPreviewPlaying ? '#ef4444' : 'var(--primary-light)',
                                border: `1px solid ${isPreviewPlaying ? 'rgba(239, 68, 68, 0.4)' : 'rgba(108, 99, 255, 0.4)'}`,
                                cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s'
                              }}
                            >
                              {isPreviewPlaying ? 'Stop' : 'Play'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '8px', color: '#a0a0a0', fontSize: '13px' }}>Volume</label>
                          <input 
                            type="range" 
                            min="0" max="1" step="0.1" 
                            value={ringtoneVolume}
                            onChange={(e) => {
                              const vol = parseFloat(e.target.value);
                              useStore.getState().setRingtoneVolume(vol);
                              ringtoneSynth.setVolume(vol);
                            }}
                            style={{ width: '100%', accentColor: 'var(--primary)' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <button 
                  onClick={handleSignOut}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 24px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    width: '100%',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <LogOut size={18} />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
