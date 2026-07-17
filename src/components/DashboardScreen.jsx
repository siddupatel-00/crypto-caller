import React, { useState, useEffect } from 'react';
import { SERVER_URL } from '../utils/socket';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Clock, Users, Phone, LogOut, Check, X, Copy, Sparkles, Smile, Settings, Video, Star, Trash2, Edit2, Calendar } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import useStore from '../store';
import socket from '../utils/socket';
import { auth, signOut } from '../firebase';
import './DashboardScreen.css';

export default function DashboardScreen() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const ringTimeout = useStore((state) => state.ringTimeout);
  const setRingTimeout = useStore((state) => state.setRingTimeout);
  const ringtoneEnabled = useStore((state) => state.ringtoneEnabled);
  const setRingtoneEnabled = useStore((state) => state.setRingtoneEnabled);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('friends');
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [addInput, setAddInput] = useState('');
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
      // 1. Online vs Offline
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      // 2. Buddy vs Non-Buddy
      if (a.is_buddy && !b.is_buddy) return -1;
      if (!a.is_buddy && b.is_buddy) return 1;
      // 3. Alphabetical
      return (a.alias || a.username).localeCompare(b.alias || b.username);
    });
  }, [friends]);

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
      navigate(`/call/${data.callerId}?incoming=true&callerName=${data.callerData.username}&type=${data.callerData.type || 'video'}`);
    });

    return () => {
      socket.off('friend-request');
      socket.off('friends-updated');
      socket.off('user-status-changed');
      socket.off('incoming-call');
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

        <div className="invite-section">
          <p className="invite-label">Your 24h Invite Code</p>
          <div className="invite-code-box" onClick={copyInviteCode}>
            <span>{user?.invite_code}</span>
            {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
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

        <button className="logout-btn" onClick={handleSignOut}>
          <LogOut size={18} />
          Sign Out
        </button>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="main-header glass-card">
          <form className="add-friend-form" onSubmit={handleAddFriend}>
            <input 
              type="text" 
              placeholder="Add by username or 24h code..." 
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
            />
            <button type="submit" className="home-btn home-btn--primary">
              <UserPlus size={18} />
              Add Friend
            </button>
          </form>
        </header>

        <div className="content-area">
          {activeTab === 'friends' && (
            <div className="friends-view animate-fadeIn">
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
            <div className="settings-view animate-fadeIn glass-card" style={{ padding: '24px' }}>
              <h2>Settings</h2>
              <div style={{ marginTop: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#a0a0a0' }}>Ring Timeout</label>
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>Choose how long your phone should ring before a call automatically ends or declines.</p>
                <select 
                  value={ringTimeout} 
                  onChange={(e) => setRingTimeout(parseInt(e.target.value, 10))}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.3)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    width: '100%',
                    maxWidth: '300px'
                  }}
                >
                  <option value={15}>15 Seconds</option>
                  <option value={30}>30 Seconds (Default)</option>
                  <option value={45}>45 Seconds</option>
                  <option value={60}>60 Seconds</option>
                </select>
              </div>

              <div style={{ marginTop: '30px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#a0a0a0' }}>Ringtone</label>
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>Play a sound when receiving an incoming call or waiting for someone to answer.</p>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px', marginBottom: '16px' }}>
                  <input 
                    type="checkbox" 
                    checked={ringtoneEnabled} 
                    onChange={(e) => setRingtoneEnabled(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#00C853' }}
                  />
                  <span>Enable Ringtone</span>
                </label>
                
                {ringtoneEnabled && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#a0a0a0', fontSize: '14px' }}>Ringtone Volume</label>
                    <input 
                      type="range" 
                      min="0" max="1" step="0.1" 
                      value={useStore((state) => state.ringtoneVolume)}
                      onChange={(e) => useStore.getState().setRingtoneVolume(parseFloat(e.target.value))}
                      style={{ width: '100%', maxWidth: '300px', accentColor: '#00C853' }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
