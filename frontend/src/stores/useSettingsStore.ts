import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const AUTO_LOCK_OPTIONS = [
  { value: 1, label: '1분' },
  { value: 3, label: '3분' },
  { value: 5, label: '5분' },
  { value: 10, label: '10분' },
  { value: 30, label: '30분' },
] as const;

interface SettingsState {
  autoLockMinutes: number;
  lockHotkey: string;
  setAutoLockMinutes: (v: number) => void;
  setLockHotkey: (v: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoLockMinutes: 3,
      lockHotkey: '',
      setAutoLockMinutes: (v) => set({ autoLockMinutes: v }),
      setLockHotkey: (v) => set({ lockHotkey: v }),
    }),
    { name: 'vault-settings' },
  ),
);
