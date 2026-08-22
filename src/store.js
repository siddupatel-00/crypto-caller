import { create } from 'zustand';

const safeGet = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v !== null ? v : fallback; } catch { return fallback; }
};
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

const parseNum = (v, fallback) => { const n = parseInt(v, 10); return Number.isNaN(n) ? fallback : n; };
const parseFloatSafe = (v, fallback) => { const n = parseFloat(v); return Number.isNaN(n) ? fallback : n; };

const useStore = create((set) => ({
  user: (() => { try { const raw = localStorage.getItem('callverse_user'); return raw ? JSON.parse(raw) : null; } catch { return null; } })(),
  fcmToken: null,
  theme: safeGet('callverse_theme', 'dark'),
  setFcmToken: (token) => set({ fcmToken: token }),
  ringTimeout: parseNum(safeGet('ringTimeout', '30'), 30),
  ringtoneEnabled: safeGet('ringtoneEnabled', 'true') !== 'false', // default true
  ringtoneVolume: parseFloatSafe(safeGet('ringtoneVolume', '1.0'), 1.0),
  selectedRingtone: safeGet('selectedRingtone', 'marimba'),
  selectedRingback: safeGet('selectedRingback', 'ringback'),
  setUser: (user) => {
    try {
      if (user) localStorage.setItem('callverse_user', JSON.stringify(user));
      else localStorage.removeItem('callverse_user');
    } catch {}
    set({ user });
  },
  setTheme: (theme) => {
    safeSet('callverse_theme', theme);
    set({ theme });
  },
  setRingTimeout: (timeout) => {
    safeSet('ringTimeout', timeout.toString());
    set({ ringTimeout: timeout });
  },
  setRingtoneEnabled: (enabled) => {
    safeSet('ringtoneEnabled', enabled.toString());
    set({ ringtoneEnabled: enabled });
  },
  setRingtoneVolume: (vol) => {
    const v = Math.min(1, Math.max(0, Number(vol) || 0));
    safeSet('ringtoneVolume', v.toString());
    set({ ringtoneVolume: v });
  },
  setSelectedRingtone: (ringtone) => {
    safeSet('selectedRingtone', ringtone);
    set({ selectedRingtone: ringtone });
  },
  setSelectedRingback: (ringback) => {
    safeSet('selectedRingback', ringback);
    set({ selectedRingback: ringback });
  },
  logout: () => {
    try {
      localStorage.removeItem('callverse_user');
      localStorage.removeItem('cache_friends');
      localStorage.removeItem('cache_requests');
      localStorage.removeItem('cache_history');
    } catch {}
    set({ user: null });
  },
}));

export default useStore;
