import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SERVER_URL } from '../utils/socket';
import { useNavigate } from 'react-router-dom';
import { 
  UserPlus, Clock, Users, Phone, Check, X, Copy, Sparkles, Settings, Video, 
  Star, Calendar, RotateCw, Sun, Moon, Palette, AlertCircle, CheckCircle2, 
  Search, LogOut, Hash, ArrowUpRight, ShieldCheck, Volume2, Play, Square,
  PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed
} from 'lucide-react';
import { format } from 'date-fns';
import useStore from '../store';
import socket from '../utils/socket';
import { auth, signOut } from '../firebase';
import { ringtoneSynth } from '../utils/ringtone';
import './DashboardScreen.css';

export default function DashboardScreen({ initialTab = 'friends' }) {
  const user = useStore(s => s.user);
  const logout = useStore(s => s.logout);
  const navigate = useNavigate();
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  const selectedRingtone = useStore(s => s.selectedRingtone);
  const setSelectedRingtone = useStore(s => s.setSelectedRingtone);
  const ringtoneVolume = useStore(s => s.ringtoneVolume);
  const setRingtoneVolume = useStore(s => s.setRingtoneVolume);
  
  const [activeTab, setActiveTab] = useState(initialTab);
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'online', 'buddies'
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const showToast = m => { setToastMsg(m); setTimeout(() => setToastMsg(''), 3000); };
  
  const [friends, setFriends] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cache_friends') || '[]'); } catch { return []; }
  });
  const [requests, setRequests] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cache_requests') || '[]'); } catch { return []; }
  });
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cache_history') || '[]'); } catch { return []; }
  });

  const [addInput, setAddInput] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileStats, setProfileStats] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  
  const [newUsername, setNewUsername] = useState('');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [usernameSuccess, setUsernameSuccess] = useState('');
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  const fetchFriends = async () => {
    if (!user?.id) return;
    try {
      const r = await fetch(`${SERVER_URL}/api/friends/${user.id}`);
      const d = await r.json();
      setFriends(d.friends || []);
      setRequests(d.requests || []);
      localStorage.setItem('cache_friends', JSON.stringify(d.friends || []));
      localStorage.setItem('cache_requests', JSON.stringify(d.requests || []));
    } catch {}
  };

  const fetchHistory = async () => {
    if (!user?.id) return;
    try {
      const r = await fetch(`${SERVER_URL}/api/history/${user.id}`);
      const d = await r.json();
      setHistory(d || []);
      localStorage.setItem('cache_history', JSON.stringify(d || []));
    } catch {}
  };

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    socket._callverseUserId = user.id;
    fetchFriends();
    fetchHistory();
    socket.on('friend-request', fetchFriends);
    socket.on('friends-updated', fetchFriends);
    socket.on('user-status-changed', fetchFriends);
    return () => {
      socket.off('friend-request');
      socket.off('friends-updated');
      socket.off('user-status-changed');
      ringtoneSynth.stop();
    };
  }, [user]);

  const filteredFriends = useMemo(() => {
    return friends
      .filter(f => {
        if (filterMode === 'online') return f.isOnline;
        if (filterMode === 'buddies') return f.is_buddy;
        return true;
      })
      .filter(f => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (f.alias?.toLowerCase().includes(q) || f.username?.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (a.is_buddy && !b.is_buddy) return -1;
        if (!a.is_buddy && b.is_buddy) return 1;
        if (a.isOnline === b.isOnline) return (a.alias || a.username).localeCompare(b.alias || b.username);
        return a.isOnline ? -1 : 1;
      });
  }, [friends, filterMode, searchQuery]);

  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (!addInput.trim()) return;
    try {
      const r = await fetch(`${SERVER_URL}/api/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, target: addInput.trim() })
      });
      const d = await r.json();
      if (d.error) showToast(d.error);
      else {
        showToast('Friend request sent!');
        setAddInput('');
        fetchFriends();
      }
    } catch {
      showToast('Failed to send request');
    }
  };

  const handleAccept = async (id) => {
    try {
      await fetch(`${SERVER_URL}/api/friends/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, friendId: id })
      });
      showToast('Friend accepted');
      fetchFriends();
    } catch {
      showToast('Failed to accept');
    }
  };

  const handleDecline = async (id) => {
    try {
      await fetch(`${SERVER_URL}/api/friends/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, friendId: id })
      });
      showToast('Request declined');
      fetchFriends();
    } catch {
      setRequests(p => p.filter(r => r.id !== id));
      showToast('Request declined');
    }
  };

  const startCall = (id, type) => {
    const t = Date.now();
    try {
      sessionStorage.removeItem(`call_ended_${id}`);
      sessionStorage.removeItem(`call_done_${id}`);
    } catch {}
    navigate(`/call/${id}?type=${type}&t=${t}`);
  };

  const copyInvite = async () => {
    const c = user?.invite_code || '';
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(c);
      setCopied(true);
      showToast('Invite code copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      logout();
      navigate('/');
    } catch {}
  };

  const fetchProfile = async () => {
    if (!user?.id) return;
    setIsProfileLoading(true);
    setProfileError('');
    try {
      const r = await fetch(`${SERVER_URL}/api/user/profile/${user.id}`);
      const d = await r.json();
      if (!r.ok || d.error) setProfileError(d.error || 'Failed to load stats');
      else setProfileStats(d);
    } catch {
      setProfileError('Network error');
    } finally {
      setIsProfileLoading(false);
    }
  };

  const openProfile = () => {
    setShowProfileModal(true);
    fetchProfile();
  };

  const handleUpdateUsername = async (e) => {
    e.preventDefault();
    const f = newUsername.trim().toLowerCase();
    const rx = /^[a-z0-9_.]{3,30}$/;
    if (!f) return setUsernameError('Please enter a username');
    if (!rx.test(f)) return setUsernameError('3-30 chars: lowercase letters, numbers, dot, underscore only');
    if (f === user?.username) return setUsernameError('Already your username');
    setIsUpdatingUsername(true);
    setUsernameError('');
    setUsernameSuccess('');
    try {
      const r = await fetch(`${SERVER_URL}/api/user/update-username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, newUsername: f })
      });
      const d = await r.json();
      if (!r.ok || d.error) setUsernameError(d.error || 'Update failed');
      else {
        const u = { ...user, username: d.username };
        useStore.getState().setUser(u);
        localStorage.setItem('callverse_user', JSON.stringify(u));
        setUsernameSuccess(`Username changed to @${d.username}`);
        setNewUsername('');
        if (showProfileModal) fetchProfile();
      }
    } catch {
      setUsernameError('Network error');
    } finally {
      setIsUpdatingUsername(false);
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

  const formatJoined = (ca) => {
    if (!ca) return 'Member';
    try {
      const n = Number(ca);
      const d = !isNaN(n) ? (n < 1e11 ? new Date(n * 1000) : new Date(n)) : new Date(ca);
      return `Joined ${format(d, 'MMMM yyyy')}`;
    } catch {
      return 'Member';
    }
  };

  const formatTalk = (s) => {
    s = Math.max(0, Math.floor(Number(s) || 0));
    if (s < 60) return `${s}s`;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const navTabs = [
    { id: 'friends', label: 'Friends', icon: Users, badge: requests.length },
    { id: 'add-friend', label: 'Add Friend', icon: UserPlus },
    { id: 'history', label: 'Call History', icon: Clock },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <div className="dash animate-fadeIn">
      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 999,
          background: 'var(--brand-gradient)', color: '#fff',
          padding: '12px 20px', borderRadius: '999px', fontSize: '13px',
          fontWeight: '700', boxShadow: '0 8px 30px rgba(99,102,241,0.4)',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <CheckCircle2 size={16} /> {toastMsg}
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="dash__modalOverlay" onClick={() => setShowProfileModal(false)}>
          <div className="dash__modalSheet" onClick={e => e.stopPropagation()}>
            <button className="dash__modalClose" onClick={() => setShowProfileModal(false)}>
              <X size={16} />
            </button>
            {isProfileLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-2)' }}>
                <RotateCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
                <span>Loading your profile...</span>
              </div>
            ) : profileError ? (
              <div style={{ padding: '24px', textAlign: 'center' }}>
                <AlertCircle size={24} style={{ color: 'var(--danger)', margin: '0 auto 8px' }} />
                <p>{profileError}</p>
                <button className="btn btn--secondary" style={{ marginTop: '12px' }} onClick={fetchProfile}>Retry</button>
              </div>
            ) : (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{
                    width: '64px', height: '64px', borderRadius: '20px',
                    background: 'var(--brand-gradient)', color: '#fff',
                    display: 'grid', placeItems: 'center', fontSize: '24px',
                    fontWeight: '800', margin: '0 auto 12px',
                    boxShadow: '0 8px 24px rgba(99,102,241,0.3)'
                  }}>
                    {(profileStats?.username || user?.username || 'U').charAt(0).toUpperCase()}
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: '800' }}>@{profileStats?.username || user?.username}</h3>
                  <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                    {formatJoined(profileStats?.created_at || user?.created_at)}
                  </span>
                </div>

                <div className="dash__statsGrid">
                  <div className="dash__statBox">
                    <div className="dash__statLabel">Friends</div>
                    <div className="dash__statVal">{profileStats?.friends_count ?? friends.length}</div>
                  </div>
                  <div className="dash__statBox">
                    <div className="dash__statLabel">Talk Time</div>
                    <div className="dash__statVal">{formatTalk(profileStats?.total_talk_time || 0)}</div>
                  </div>
                  <div className="dash__statBox">
                    <div className="dash__statLabel">Calls</div>
                    <div className="dash__statVal">{profileStats?.total_calls ?? 0}</div>
                  </div>
                </div>

                <div style={{ background: 'var(--surface-raised)', borderRadius: '16px', padding: '16px', border: '1px solid var(--line)' }}>
                  <div className="label" style={{ marginBottom: '12px' }}>Top 3 Most Talked With</div>
                  {profileStats?.top_friends?.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {profileStats.top_friends.map((f, i) => (
                        <div key={f.id || i} style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '10px 12px', borderRadius: '10px', background: 'var(--surface)'
                        }}>
                          <span style={{ fontSize: '14px' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-1)' }}>{f.alias || f.username}</div>
                            {f.alias && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>@{f.username}</div>}
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent)' }}>
                            {formatTalk(f.lifetime_talk_seconds || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-3)', padding: '12px' }}>
                      No calls recorded yet
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => { setShowProfileModal(false); setActiveTab('settings'); }}>
                    Change Username
                  </button>
                  <button className="btn btn--ghost" onClick={() => setShowProfileModal(false)}>Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="dash__sidebar">
        <div className="dash__brand">
          <div className="dash__brandLogo">
            <Video size={22} color="#ffffff" />
          </div>
          <div>
            <div className="dash__brandTitle">CallVerse</div>
            <div style={{ fontSize: '11px', color: 'var(--success)', fontWeight: '700', letterSpacing: '0.04em' }}>● P2P ENCRYPTED</div>
          </div>
        </div>

        <nav className="dash__nav">
          {navTabs.map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                className={`dash__navBtn ${isActive ? 'is-active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                <Icon size={18} />
                <span>{t.label}</span>
                {t.badge > 0 && <span className="dash__navBadge">{t.badge}</span>}
              </button>
            );
          })}
        </nav>

        {/* User Footer Card */}
        <div className="dash__userCard" onClick={openProfile}>
          <div className="dash__avatarWrapper">
            <div className="dash__avatar">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="dash__statusDot" />
          </div>
          <div className="dash__userInfo">
            <div className="dash__userName">{user?.username}</div>
            <div className="dash__userTag">View Stats</div>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); handleSignOut(); }} 
            title="Sign out"
            style={{ color: 'var(--text-3)', padding: '6px' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="dash__main">
        {/* Sticky Top Header */}
        <header className="dash__header">
          <div className="dash__headerTitle">
            {activeTab === 'friends' && 'Your Friends'}
            {activeTab === 'add-friend' && 'Add New Friend'}
            {activeTab === 'history' && 'Call History'}
            {activeTab === 'settings' && 'App Settings'}
          </div>

          <div className="dash__headerRight">
            {/* 1-Click Invite Code Badge */}
            <button className="dash__inviteChip" onClick={copyInvite} title="Click to copy your 24-hour invite code">
              <Hash size={14} color="var(--accent)" />
              <span className="mono">{user?.invite_code || '------'}</span>
              {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
            </button>

            {/* Quick Theme Switcher */}
            <button 
              className="dash__inviteChip"
              onClick={() => {
                const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'bw' : 'dark';
                setTheme(nextTheme);
              }}
              title="Toggle theme"
            >
              {theme === 'light' ? <Sun size={15} /> : theme === 'bw' ? <Palette size={15} /> : <Moon size={15} />}
            </button>

            {/* Search Input (Friends Tab) */}
            {activeTab === 'friends' && (
              <div className="dash__searchBar">
                <Search size={16} />
                <input 
                  placeholder="Search by name or username..." 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ color: 'var(--text-3)' }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="dash__content">
          {/* ===== TAB 1: FRIENDS ===== */}
          {activeTab === 'friends' && (
            <div>
              {/* Pending Requests Banner */}
              {requests.length > 0 && (
                <div style={{ marginBottom: '28px', background: 'var(--surface)', border: '1px solid var(--accent-line)', borderRadius: '20px', padding: '20px' }}>
                  <div className="label" style={{ marginBottom: '14px', color: 'var(--brand-violet)' }}>
                    Pending Requests ({requests.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {requests.map(r => (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px', borderRadius: '12px', background: 'var(--surface-raised)',
                        border: '1px solid var(--line)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--brand-gradient)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: '700' }}>
                            {r.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', fontSize: '14px' }}>{r.username}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>wants to connect</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn btn--primary btn--compact" onClick={() => handleAccept(r.id)}>
                            <Check size={14} /> Accept
                          </button>
                          <button className="btn btn--ghost btn--compact" onClick={() => handleDecline(r.id)}>
                            <X size={14} /> Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filter Chips Bar */}
              <div className="dash__filterBar">
                <div className="dash__chips">
                  <button 
                    className={`dash__chip ${filterMode === 'all' ? 'is-active' : ''}`}
                    onClick={() => setFilterMode('all')}
                  >
                    All Contacts ({friends.length})
                  </button>
                  <button 
                    className={`dash__chip ${filterMode === 'online' ? 'is-active' : ''}`}
                    onClick={() => setFilterMode('online')}
                  >
                    🟢 Online ({friends.filter(f => f.isOnline).length})
                  </button>
                  <button 
                    className={`dash__chip ${filterMode === 'buddies' ? 'is-active' : ''}`}
                    onClick={() => setFilterMode('buddies')}
                  >
                    ⭐ Buddies ({friends.filter(f => f.is_buddy).length})
                  </button>
                </div>

                <button className="btn btn--primary btn--compact" onClick={() => setActiveTab('add-friend')}>
                  <UserPlus size={14} /> Add Friend
                </button>
              </div>

              {/* Contact Grid */}
              {filteredFriends.length === 0 ? (
                <div className="dash__empty">
                  <div className="dash__emptyIcon">
                    <Users size={28} />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: '800' }}>No contacts found</h3>
                  <p style={{ fontSize: '14px', color: 'var(--text-2)', maxWidth: '360px' }}>
                    {searchQuery ? 'No friends matched your search query.' : 'Add your family and friends with their 24h invite code to start calling.'}
                  </p>
                  <button className="btn btn--primary" onClick={() => setActiveTab('add-friend')}>
                    <UserPlus size={16} /> Add a Friend
                  </button>
                </div>
              ) : (
                <div className="dash__grid">
                  {filteredFriends.map(f => (
                    <div key={f.id} className="contact-card">
                      <div className="contact-card__left" onClick={() => navigate(`/friend/${f.id}`, { state: { friend: f, history } })}>
                        <div className="contact-card__avatar">
                          {(f.alias || f.username).charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="contact-card__name">{f.alias || f.username}</span>
                            {f.is_buddy && <Star size={14} fill="#f59e0b" color="#f59e0b" />}
                          </div>
                          <div className={`contact-card__status ${f.isOnline ? 'is-online' : ''}`}>
                            <span className={`contact-card__statusDot ${f.isOnline ? 'is-online' : ''}`} />
                            {f.isOnline ? 'Online' : 'Offline'}
                          </div>
                        </div>
                      </div>

                      <div className="contact-card__actions">
                        <button 
                          className={`call-action-btn call-action-btn--voice ${!f.isOnline ? 'is-disabled' : ''}`}
                          onClick={() => startCall(f.id, 'voice')}
                          title={f.isOnline ? "Start Voice Call" : "User is Offline"}
                        >
                          <Phone size={16} />
                        </button>
                        <button 
                          className={`call-action-btn call-action-btn--video ${!f.isOnline ? 'is-disabled' : ''}`}
                          onClick={() => startCall(f.id, 'video')}
                          title={f.isOnline ? "Start Video Call" : "User is Offline"}
                        >
                          <Video size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== TAB 2: ADD FRIEND ===== */}
          {activeTab === 'add-friend' && (
            <div style={{ maxWidth: '540px', margin: '0 auto' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '24px', padding: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'var(--brand-gradient)', display: 'grid', placeItems: 'center', color: '#fff' }}>
                    <UserPlus size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '800' }}>Add a Contact</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-2)' }}>Connect directly using username or 24h code</p>
                  </div>
                </div>

                <form onSubmit={handleAddFriend} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
                  <div>
                    <label className="label" style={{ display: 'block', marginBottom: '8px' }}>Friend's Username or Invite Code</label>
                    <input 
                      placeholder="e.g. alice or 5Y96QGGC"
                      value={addInput}
                      onChange={e => setAddInput(e.target.value)}
                      style={{
                        width: '100%', padding: '14px 18px', borderRadius: '14px',
                        background: 'var(--surface-raised)', border: '1px solid var(--line)',
                        color: 'var(--text-1)', fontSize: '15px'
                      }}
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn--primary btn--lg" 
                    disabled={!addInput.trim()}
                    style={{ width: '100%', marginTop: '8px' }}
                  >
                    <UserPlus size={18} /> Send Connection Request
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ===== TAB 3: CALL HISTORY ===== */}
          {activeTab === 'history' && (
            <div>
              {history.length === 0 ? (
                <div className="dash__empty">
                  <div className="dash__emptyIcon">
                    <Clock size={28} />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: '800' }}>No call history</h3>
                  <p style={{ fontSize: '14px', color: 'var(--text-2)' }}>Your past voice and video calls will appear here.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {history.map(c => {
                    const isMissed = c.status !== 'completed' && c.type === 'incoming';
                    const isIncoming = c.type === 'incoming';
                    return (
                      <div key={c.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '16px 20px', borderRadius: '16px', background: 'var(--surface)',
                        border: '1px solid var(--line)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div style={{
                            width: '42px', height: '42px', borderRadius: '12px',
                            display: 'grid', placeItems: 'center',
                            background: isMissed ? 'var(--danger-soft)' : isIncoming ? 'var(--success-soft)' : 'var(--accent-soft)',
                            color: isMissed ? 'var(--danger)' : isIncoming ? 'var(--success)' : 'var(--accent)'
                          }}>
                            {isMissed ? <PhoneMissed size={18} /> : isIncoming ? <PhoneIncoming size={18} /> : <PhoneOutgoing size={18} />}
                          </div>
                          <div>
                            <div style={{ fontSize: '15px', fontWeight: '700' }}>{c.other_user_name || 'Call'}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
                              {isMissed ? 'Missed Call' : `${formatTalk(c.duration)} · ${c.call_type || 'Voice'}`}
                            </div>
                          </div>
                        </div>

                        {c.other_user_id && (
                          <button 
                            className="btn btn--secondary btn--compact"
                            onClick={() => startCall(c.other_user_id, c.call_type || 'voice')}
                          >
                            <PhoneCall size={14} /> Call Back
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===== TAB 4: SETTINGS ===== */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Account & Username Section */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '20px', padding: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px' }}>Account & Username</h3>
                <div style={{ marginBottom: '16px' }}>
                  <div className="label" style={{ marginBottom: '4px' }}>Current Username</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--brand-violet)' }}>@{user?.username}</div>
                </div>

                <form onSubmit={handleUpdateUsername} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label className="label" style={{ display: 'block', marginBottom: '6px' }}>New Username</label>
                    <input 
                      placeholder="e.g. siddu or siddu_00"
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                      style={{
                        width: '100%', padding: '12px 16px', borderRadius: '12px',
                        background: 'var(--surface-raised)', border: '1px solid var(--line)',
                        color: 'var(--text-1)', fontSize: '14px'
                      }}
                    />
                  </div>

                  {usernameError && <div style={{ color: 'var(--danger)', fontSize: '13px' }}>{usernameError}</div>}
                  {usernameSuccess && <div style={{ color: 'var(--success)', fontSize: '13px' }}>{usernameSuccess}</div>}

                  <button 
                    type="submit" 
                    className="btn btn--primary btn--compact"
                    disabled={isUpdatingUsername || !newUsername.trim()}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {isUpdatingUsername ? 'Updating...' : 'Update Username'}
                  </button>
                </form>
              </div>

              {/* Theme Section */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '20px', padding: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px' }}>Appearance & Theme</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {[
                    { id: 'dark', label: 'Dark Mode', icon: Moon },
                    { id: 'light', label: 'Light Mode', icon: Sun },
                    { id: 'bw', label: 'B&W Contrast', icon: Palette }
                  ].map(t => {
                    const isSelected = theme === t.id;
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        style={{
                          padding: '16px', borderRadius: '14px', textAlign: 'center',
                          background: isSelected ? 'var(--brand-gradient-subtle)' : 'var(--surface-raised)',
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--line)',
                          color: isSelected ? 'var(--brand-violet)' : 'var(--text-2)'
                        }}
                      >
                        <Icon size={20} style={{ margin: '0 auto 8px' }} />
                        <div style={{ fontSize: '13px', fontWeight: '700' }}>{t.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ringtone Section */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '20px', padding: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px' }}>Ringtone & Audio</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-2)' }}>Tone Preview</span>
                  <button 
                    className="btn btn--secondary btn--compact"
                    onClick={() => togglePreview(selectedRingtone)}
                  >
                    {isPreviewPlaying ? <Square size={14} /> : <Play size={14} />}
                    <span>{isPreviewPlaying ? 'Stop' : 'Play Tone'}</span>
                  </button>
                </div>
                <div>
                  <label className="label" style={{ display: 'block', marginBottom: '8px' }}>Ringtone Volume ({Math.round(ringtoneVolume * 100)}%)</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05"
                    value={ringtoneVolume}
                    onChange={e => setRingtoneVolume(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
