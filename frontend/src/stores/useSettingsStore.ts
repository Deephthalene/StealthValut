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
  /** 잠금 단축키 (2~3개 키 조합, 빈 문자열 = 미설정) */
  lockHotkey: string;
  setAutoLockMinutes: (v: number) => void;
  setLockHotkey: (v: string) => void;
}

function migrateLockHotkey(persisted: unknown): string {
  const p = persisted as Record<string, unknown> | undefined;
  if (!p) return '';
  const hotkey = p.lockHotkey as string | undefined;
  if (typeof hotkey === 'string') return hotkey;
  const hotkeys = p.lockHotkeys as string[] | undefined;
  if (Array.isArray(hotkeys) && hotkeys[0]) return hotkeys[0];
  return '';
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoLockMinutes: 3,
      lockHotkey: '',
      setAutoLockMinutes: (v) => set({ autoLockMinutes: v }),
      setLockHotkey: (v) => set({ lockHotkey: v }),
    }),
    {
      name: 'vault-settings',
      merge: (persisted, current) => {
        const hotkey = migrateLockHotkey(persisted);
        return { ...current, ...(persisted as object), lockHotkey: hotkey };
      },
    },
  ),
);
