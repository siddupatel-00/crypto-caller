import { create } from 'zustand';

const useStore = create((set) => ({
  user: null,
  ringTimeout: parseInt(localStorage.getItem('ringTimeout') || '30', 10),
  ringtoneEnabled: localStorage.getItem('ringtoneEnabled') !== 'false', // default true
  ringtoneVolume: parseFloat(localStorage.getItem('ringtoneVolume') || '1.0'),
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
  logout: () => set({ user: null }),
}));

export default useStore;
