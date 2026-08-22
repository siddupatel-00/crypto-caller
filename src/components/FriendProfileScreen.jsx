import React, { useState, useEffect } from 'react';
import { SERVER_URL } from '../utils/socket';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Star, Trash2, Calendar, Clock, Phone, Video } from 'lucide-react';
import { format } from 'date-fns';
import useStore from '../store';

function FriendProfileScreen() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const user = useStore(state => state.user);

  const [friend, setFriend] = useState(state?.friend || null);
  const [history, setHistory] = useState(state?.history || []);
  const [editAlias, setEditAlias] = useState(state?.friend?.alias || '');

  useEffect(() => {
    if (!friend || !user) {
      navigate('/dashboard');
    }
  }, [friend, user, navigate]);

  if (!friend) return null;

  const startCall = (type) => {
    const t = Date.now();
    try {
      sessionStorage.removeItem(`call_ended_${friend.id}`);
      sessionStorage.removeItem(`call_done_${friend.id}`);
    } catch (e) {}
    navigate(`/call/${friend.id}?type=${type}&t=${t}`);
  };

  const getLifetimeTalkTime = () => {
    const totalSeconds = friend.lifetime_talk_seconds || 0;
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const updateAlias = async () => {
    try {
      await fetch(`${SERVER_URL}/api/friends/alias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, friendId: friend.id, alias: editAlias }),
      });
      setFriend(prev => ({ ...prev, alias: editAlias }));
      alert('Alias updated!');
    } catch (e) {
      console.error(e);
    }
  };

  const toggleBuddy = async () => {
    const newBuddyStatus = !friend.is_buddy;
    try {
      await fetch(`${SERVER_URL}/api/friends/buddy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, friendId: friend.id, isBuddy: newBuddyStatus }),
      });
      setFriend(prev => ({ ...prev, is_buddy: newBuddyStatus }));
    } catch (e) {
      console.error(e);
    }
  };

  const removeFriend = async () => {
    if (!window.confirm(`Are you sure you want to remove ${friend.alias || friend.username}?`)) return;
    try {
      await fetch(`${SERVER_URL}/api/friends/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, friendId: friend.id }),
      });
      navigate('/dashboard');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div 
      className="dashboard-layout" 
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '20px' }}
      onClick={() => navigate('/dashboard')}
    >
      <div 
        className="glass-card" 
        style={{ width: '100%', maxWidth: '500px', padding: '30px', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={() => navigate('/dashboard')}
          style={{ position: 'absolute', top: '20px', left: '20px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ChevronLeft size={20} /> Back
        </button>

        <div className="profile-header" style={{ marginTop: '30px' }}>
          <div className="user-avatar large relative" style={{ margin: '0 auto 16px auto', width: '80px', height: '80px', fontSize: '32px' }}>
            {(friend.alias || friend.username).charAt(0).toUpperCase()}
            <span className={`status-dot ${friend.isOnline ? 'online' : 'offline'}`} style={{ width: '16px', height: '16px', bottom: '4px', right: '4px' }} />
          </div>
          <h2 style={{ textAlign: 'center', marginBottom: '4px', fontSize: '24px' }}>
            {friend.alias || friend.username}
            {Boolean(friend.is_buddy) && <Star size={20} fill="#FCD34D" color="#FCD34D" style={{ marginLeft: '8px', display: 'inline-block', verticalAlign: 'middle' }} />}
          </h2>
          {friend.alias && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '16px' }}>@{friend.username}</p>}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: friend.alias ? '0' : '16px', marginBottom: '30px' }}>
            <button 
              onClick={() => startCall('voice')}
              style={{ padding: '10px 24px', borderRadius: '24px', background: 'rgba(0, 217, 126, 0.15)', color: 'var(--success)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500', transition: 'all 0.2s' }}
            >
              <Phone size={18} />
              Voice Call
            </button>
            <button 
              onClick={() => startCall('video')}
              style={{ padding: '10px 24px', borderRadius: '24px', background: 'rgba(108, 99, 255, 0.15)', color: 'var(--primary-light)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500', transition: 'all 0.2s' }}
            >
              <Video size={18} />
              Video Call
            </button>
          </div>
        </div>

        <div className="profile-stats" style={{ display: 'flex', justifyContent: 'space-around', margin: '24px 0', background: 'var(--card-inner-bg)', border: '1px solid var(--border)', padding: '20px', borderRadius: '12px' }}>
          <div style={{ textAlign: 'center' }}>
            <Calendar size={24} color="var(--text-secondary)" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Connected</div>
            <div style={{ fontWeight: '500', fontSize: '16px', color: 'var(--text-primary)' }}>{friend.created_at ? format(new Date(friend.created_at * 1000), 'MMM d, yyyy') : 'Recently'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Clock size={24} color="var(--text-secondary)" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Lifetime Talk</div>
            <div style={{ fontWeight: '500', fontSize: '16px', color: 'var(--text-primary)' }}>{getLifetimeTalkTime()}</div>
          </div>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Set Custom Alias</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              value={editAlias} 
              onChange={e => setEditAlias(e.target.value)} 
              placeholder="Custom name..."
              style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '15px' }}
            />
            <button onClick={updateAlias} style={{ padding: '0 20px', background: 'var(--primary-glow)', color: 'var(--primary-light)', borderRadius: '8px', fontWeight: '500' }}>Save</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px' }}>
          <button 
            onClick={toggleBuddy}
            style={{ flex: 1, padding: '14px', borderRadius: '8px', background: friend.is_buddy ? 'rgba(252, 211, 77, 0.1)' : 'var(--card-inner-bg)', color: friend.is_buddy ? '#FCD34D' : 'var(--text-primary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: '500' }}
          >
            <Star size={18} fill={friend.is_buddy ? "#FCD34D" : "none"} />
            {friend.is_buddy ? 'Remove Buddy' : 'Make Buddy'}
          </button>
          <button 
            onClick={removeFriend}
            style={{ flex: 1, padding: '14px', borderRadius: '8px', background: 'var(--danger-glow)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: '500' }}
          >
            <Trash2 size={18} />
            Remove Friend
          </button>
        </div>
      </div>
    </div>
  );
}

export default FriendProfileScreen;
