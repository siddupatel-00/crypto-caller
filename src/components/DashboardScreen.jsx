import React, { useState, useEffect, useRef } from 'react';
import { SERVER_URL } from '../utils/socket';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Clock, Users, Phone, LogOut, Check, X, Copy, Sparkles, Smile, Settings, Video, Star, Trash2, Edit2, Calendar, RotateCw, Sun, Moon, Palette } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import useStore from '../store';
import socket from '../utils/socket';
import { auth, signOut } from '../firebase';
import { ringtoneSynth } from '../utils/ringtone';
import { Capacitor, registerPlugin } from '@capacitor/core';
import './DashboardScreen.css';

const Ringtone = registerPlugin('Ringtone');

export default function DashboardScreen({ initialTab = 'friends' }) {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const ringTimeout = useStore((state) => state.ringTimeout);
  const setRingTimeout = useStore((state) => state.setRingTimeout);
  const ringtoneEnabled = useStore((state) => state.ringtoneEnabled);
  const setRingtoneEnabled = useStore((state) => state.setRingtoneEnabled);
  const theme = useStore((state) => state.theme);
  const selectedRingtone = useStore((state) => state.selectedRingtone);
  const setSelectedRingtone = useStore((state) => state.setSelectedRingtone);
  const ringtoneVolume = useStore((state) => state.ringtoneVolume);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const [activeTab, setActiveTab] = useState(initialTab);

  // Pull-to-refresh state & refs
  const mainContentRef = useRef(null);
  const contentAreaRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const canPull = useRef(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Load from local storage for instant perceived load (SWR pattern)
  const [friends, setFriends] = useState(() => JSON.parse(localStorage.getItem('cache_friends') || '[]'));
  const [requests, setRequests] = useState(() => JSON.parse(localStorage.getItem('cache_requests') || '[]'));
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem('cache_history') || '[]'));
  const [historyFilter, setHistoryFilter] = useState('all');
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
      localStorage.setItem('cache_friends', JSON.stringify(data.friends || []));
      localStorage.setItem('cache_requests', JSON.stringify(data.requests || []));
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/history/${user.id}`);
      const data = await res.json();
      setHistory(data || []);
      localStorage.setItem('cache_history', JSON.stringify(data || []));
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

  const filteredHistory = React.useMemo(() => {
    return history.filter(call => {
      const type = (call.type || '').toLowerCase().trim();
      const status = (call.status || '').toLowerCase().trim();
      const filter = (historyFilter || '').toLowerCase().trim();

      if (filter === 'all') return true;
      if (filter === 'missed') return type === 'incoming' && status !== 'completed';
      if (filter === 'incoming') return type === 'incoming' && status === 'completed';
      if (filter === 'outgoing') return type === 'outgoing' && status === 'completed';
      
      // Failsafe: if nothing matches, return false so it doesn't show everything
      return false;
    });
  }, [history, historyFilter]);

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

    socket._callverseUserId = user.id;


    fetchFriends();
    fetchHistory();

    socket.on('friend-request', fetchFriends);
    socket.on('friends-updated', fetchFriends);
    socket.on('user-status-changed', fetchFriends);
    
    socket.on('incoming-call', (data) => {
      console.log(`[Signaling Log] [User B] Received 'incoming-call' event! data:`, data);
      console.log(`[Signaling Log] [User B] Navigating to Call screen: /call/${data.callerId}?incoming=true...`);
      navigate(`/call/${data.callerId}?incoming=true&callerName=${data.callerData?.username || 'Someone'}&type=${data.callerData?.type || 'video'}&callId=${data.callId}&t=${Date.now()}`);
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
    const t = Date.now();
    try {
      sessionStorage.removeItem(`call_ended_${friendId}`);
      sessionStorage.removeItem(`call_done_${friendId}`);
    } catch (e) {}
    navigate(`/call/${friendId}?type=${type}&t=${t}`);
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

  const handleTouchStart = (e) => {
    if (isRefreshing) return;
    const scrollTop = (mainContentRef.current?.scrollTop || 0) + (contentAreaRef.current?.scrollTop || 0);
    if (scrollTop <= 0) {
      canPull.current = true;
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
    } else {
      canPull.current = false;
    }
  };

  const handleTouchMove = (e) => {
    if (!canPull.current || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const deltaY = currentY - touchStartY.current;
    const deltaX = currentX - touchStartX.current;

    // Check if horizontal swipe dominates
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return;
    }

    const scrollTop = (mainContentRef.current?.scrollTop || 0) + (contentAreaRef.current?.scrollTop || 0);
    if (scrollTop <= 0 && deltaY > 0) {
      // Smooth logarithmic / damping curve for pull distance
      const distance = Math.min(deltaY * 0.45, 80);
      setPullDistance(distance);
      setIsPulling(true);
    } else {
      if (pullDistance > 0) {
        setPullDistance(0);
        setIsPulling(false);
      }
    }
  };

  const handleTouchEnd = async () => {
    if (!canPull.current || isRefreshing) return;
    canPull.current = false;
    setIsPulling(false);

    if (pullDistance >= 60) {
      setIsRefreshing(true);
      setPullDistance(52);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(15); } catch (e) {}
      }
      try {
        await Promise.all([fetchFriends(), fetchHistory()]);
      } catch (err) {
        console.error('Pull to refresh error:', err);
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 300);
      }
    } else {
      setPullDistance(0);
    }
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
            onClick={() => navigate('/dashboard')}
          >
            <Users size={20} />
            Friends
            {requests.length > 0 && <span className="badge">{requests.length}</span>}
          </button>
          <button 
            className={`nav-item ${activeTab === 'add-friend' ? 'active' : ''}`}
            onClick={() => navigate('/addfriend')}
          >
            <UserPlus size={20} />
            Add Friend
          </button>
          <button 
            className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => navigate('/history')}
          >
            <Clock size={20} />
            Call History
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('/settings')}
          >
            <Settings size={20} />
            Settings
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main 
        className="main-content"
        ref={mainContentRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Pull to Refresh Indicator */}
        <div 
          className={`pull-to-refresh-container ${isRefreshing ? 'refreshing' : ''} ${isPulling ? 'pulling' : ''}`}
          style={{
            transform: `translateY(${isRefreshing ? 16 : Math.max(0, pullDistance - 36)}px)`,
            opacity: isRefreshing ? 1 : Math.min(Math.max(0, (pullDistance - 10) / 40), 1),
            pointerEvents: 'none'
          }}
        >
          <div className="pull-to-refresh-indicator glass">
            <RotateCw 
              size={16} 
              className={`ptr-icon ${isRefreshing ? 'ptr-spinning' : ''}`}
              style={{
                transform: isRefreshing ? undefined : `rotate(${pullDistance * 5}deg)`
              }}
            />
            <span className="ptr-text">
              {isRefreshing 
                ? 'Refreshing...' 
                : pullDistance >= 60 
                ? 'Release to refresh' 
                : 'Pull to refresh'}
            </span>
          </div>
        </div>

        <div 
          className="content-area"
          ref={contentAreaRef}
          style={{
            transform: (pullDistance > 0 || isRefreshing) 
              ? `translateY(${isRefreshing ? 28 : Math.min(pullDistance * 0.45, 36)}px)` 
              : 'translateY(0px)',
            transition: isPulling ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)'
          }}
        >
          {activeTab === 'friends' && (
            <div className="friends-view animate-fadeIn">
              
              {/* Friends Header: Search & Theme Toggle */}
              <div className="friends-header-actions glass-card" style={{ marginBottom: '24px', padding: '12px 16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div className="search-bar" style={{ display: 'flex', position: 'relative', flex: 1 }}>
                  <input 
                    type="text" 
                    placeholder="Search your friends..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '14px'
                    }}
                  />
                </div>
                
                {/* Quick Theme Selector Button */}
                <button
                  type="button"
                  onClick={() => {
                    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'bw' : 'dark';
                    useStore.getState().setTheme(next);
                  }}
                  title={`Current Theme: ${theme.toUpperCase()} (Click to toggle)`}
                  className="theme-quick-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  {theme === 'light' ? <Sun size={18} color="#f59e0b" /> : theme === 'bw' ? <Palette size={18} /> : <Moon size={18} color="#8b83ff" />}
                  <span style={{ textTransform: 'capitalize' }}>{theme}</span>
                </button>
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
                          {friend.alias && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>@{friend.username}</span>}
                        </div>
                      </div>
                      <div className="call-actions">
                        <button 
                          className={`call-btn voice-btn ${!friend.isOnline ? 'offline' : ''}`} 
                          onClick={() => startCall(friend.id, 'voice')}
                          title="Voice Call"
                        >
                          <Phone size={18} />
                        </button>
                        <button 
                          className={`call-btn video-btn ${!friend.isOnline ? 'offline' : ''}`} 
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

          {activeTab === 'add-friend' && (
            <div className="add-friend-view animate-fadeIn glass-card" style={{ padding: '32px', maxWidth: '600px', margin: '0 auto' }}>
              <h2 style={{ marginBottom: '24px', fontSize: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>Add Friend</h2>
              <div style={{ background: 'var(--card-inner-bg)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>Enter your friend's exact username or their 24-hour invite code to send a request.</p>
                
                <form className="add-friend-form" onSubmit={(e) => {
                  handleAddFriend(e);
                  setActiveTab('friends'); // Optionally redirect back to friends after adding
                }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <input 
                    type="text" 
                    placeholder="Username or 24h code..." 
                    value={addInput}
                    onChange={(e) => setAddInput(e.target.value)}
                    style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '16px' }}
                  />
                  <button 
                    type="submit" 
                    className="home-btn home-btn--primary"
                    style={{
                      background: addInput.trim() ? 'var(--primary)' : 'var(--btn-disabled-bg)',
                      color: addInput.trim() ? '#fff' : 'var(--btn-disabled-text)',
                      transition: 'all 0.3s ease',
                      padding: '16px',
                      width: '100%',
                      justifyContent: 'center'
                    }}
                  >
                    <UserPlus size={20} />
                    <span>Send Friend Request</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-view animate-fadeIn">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ marginBottom: 0 }}>Call History</h2>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '8px' }}>
                {['all', 'missed', 'incoming', 'outgoing'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setHistoryFilter(filter)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '20px',
                      background: historyFilter === filter ? 'var(--primary)' : 'var(--input-bg)',
                      color: historyFilter === filter ? '#fff' : 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      fontSize: '13px',
                      fontWeight: '500',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s'
                    }}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              
              {filteredHistory.length === 0 ? (
                <div className="empty-state">
                  <Clock size={48} />
                  <p>No {historyFilter !== 'all' ? historyFilter : ''} call history found.</p>
                </div>
              ) : (
                <div className="list-container">
                  {filteredHistory.map(call => (
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
              <h2 style={{ marginBottom: '24px', fontSize: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>Settings</h2>
              
              {/* Appearance */}
              <div className="settings-section" style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '16px', color: 'var(--primary-light)', marginBottom: '16px' }}>Appearance</h3>
                <div style={{ background: 'var(--card-inner-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-primary)', fontWeight: '500' }}>App Theme</label>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Choose your preferred color theme.</p>
                  <select 
                    value={theme} 
                    onChange={(e) => useStore.getState().setTheme(e.target.value)}
                    style={{
                      padding: '12px 16px', borderRadius: '12px', background: 'var(--input-bg)',
                      color: 'var(--text-primary)', border: '1px solid var(--border)', width: '100%', outline: 'none'
                    }}
                  >
                    <option value="dark" style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>Dark Theme (Default)</option>
                    <option value="light" style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>Light Theme</option>
                    <option value="bw" style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>High Contrast (Black & White)</option>
                  </select>
                </div>
              </div>

              {/* Profile & Invite Section */}
              <div className="settings-section" style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '16px', color: 'var(--primary-light)', marginBottom: '16px' }}>Profile & Invite</h3>
                <div style={{ background: 'var(--card-inner-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Your 24h Invite Code</p>
                  <div 
                    onClick={copyInviteCode}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'var(--input-bg)', padding: '16px', borderRadius: '12px',
                      cursor: 'pointer', border: '1px solid var(--border)', transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <span style={{ fontSize: '18px', letterSpacing: '2px', fontFamily: 'monospace', color: 'var(--primary-light)' }}>{user?.invite_code}</span>
                    {copied ? <Check size={20} className="text-success" /> : <Copy size={20} color="var(--text-secondary)" />}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '12px' }}>Share this code with your friends so they can add you.</p>
                </div>
              </div>

              {/* Call Preferences */}
              <div className="settings-section" style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '16px', color: 'var(--primary-light)', marginBottom: '16px' }}>Call Preferences</h3>
                <div style={{ background: 'var(--card-inner-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-primary)', fontWeight: '500' }}>Ring Timeout</label>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>How long your phone rings before a call ends.</p>
                    <select 
                      value={ringTimeout} 
                      onChange={(e) => setRingTimeout(parseInt(e.target.value, 10))}
                      style={{
                        padding: '12px 16px', borderRadius: '12px', background: 'var(--input-bg)',
                        color: 'var(--text-primary)', border: '1px solid var(--border)', width: '100%', outline: 'none'
                      }}
                    >
                      <option value={15} style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>15 Seconds</option>
                      <option value={30} style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>30 Seconds (Default)</option>
                      <option value={45} style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>45 Seconds</option>
                      <option value={60} style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>60 Seconds</option>
                    </select>
                  </div>

                  <div style={{ paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
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
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>Enable Incoming Ringtone</span>
                    </label>
                    
                    {ringtoneEnabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingLeft: '32px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>Sound Preset</label>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <select 
                              value={selectedRingtone} 
                              onChange={(e) => {
                                setSelectedRingtone(e.target.value);
                                if (isPreviewPlaying) ringtoneSynth.play(e.target.value, ringtoneVolume);
                              }}
                              style={{
                                padding: '10px 16px', borderRadius: '10px', background: 'var(--input-bg)',
                                color: 'var(--text-primary)', border: '1px solid var(--border)', flex: 1, outline: 'none'
                              }}
                            >
                              <option value="marimba" style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>Classic Marimba</option>
                              <option value="whatsapp" style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>WhatsApp Bell</option>
                              <option value="signal" style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>Signal Chime</option>
                              <option value="telegram" style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>Telegram Trill</option>
                              <option value="bells" style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>Echo Bells</option>
                              <option value="pulse" style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>Digital Pulse</option>
                              <option value="zen" style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>Zen Bowl</option>
                              <option value="cyber" style={{background: 'var(--bg-surface)', color: 'var(--text-primary)'}}>Cyber Tech</option>
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
                        {Capacitor.isNativePlatform() && (
                          <div style={{ marginTop: '12px' }}>
                            <button 
                              onClick={async () => {
                                try {
                                  await Ringtone.pickRingtone();
                                  alert('Custom Android ringtone saved successfully!');
                                } catch (e) {
                                  console.error(e);
                                }
                              }}
                              style={{
                                width: '100%', padding: '12px', borderRadius: '10px',
                                background: 'var(--primary)', color: '#fff',
                                border: 'none', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s'
                              }}
                            >
                              Pick Android System Ringtone
                            </button>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '8px' }}>
                              This will override the sound preset above for incoming calls on Android.
                            </p>
                          </div>
                        )}

                        <div>
                          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>Volume</label>
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

              <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
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
