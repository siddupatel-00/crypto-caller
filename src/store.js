import { create } from 'zustand';

const useStore = create((set) => ({
  user: null,
  fcmToken: null,
  setFcmToken: (token) => set({ fcmToken: token }),
  ringTimeout: parseInt(localStorage.getItem('ringTimeout') || '30', 10),
  ringtoneEnabled: localStorage.getItem('ringtoneEnabled') !== 'false', // default true
  ringtoneVolume: parseFloat(localStorage.getItem('ringtoneVolume') || '1.0'),
  selectedRingtone: localStorage.getItem('selectedRingtone') || 'marimba',
  selectedRingback: localStorage.getItem('selectedRingback') || 'ringback',
  setUser: (user) => set({ user }),
  setRingTimeout: (timeout) => {
    localStorage.setItem('ringTimeout', timeout.toString());
    set({ ringTimeout: timeout });
  },
  setRingtoneEnabled: (enabled) => {
    localStorage.setItem('ringtoneEnabled', enabled.toString());
    set({ ringtoneEnabled: enabled });
  },
  setRingtoneVolume: (vol) => {
    localStorage.setItem('ringtoneVolume', vol.toString());
    set({ ringtoneVolume: vol });
  },
  setSelectedRingtone: (ringtone) => {
    localStorage.setItem('selectedRingtone', ringtone);
    set({ selectedRingtone: ringtone });
  },
  setSelectedRingback: (ringback) => {
    localStorage.setItem('selectedRingback', ringback);
    set({ selectedRingback: ringback });
  },
  logout: () => set({ user: null }),
}));

export default useStore;
