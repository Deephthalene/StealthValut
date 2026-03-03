import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const AUTO_LOCK_OPTIONS = [
  { value: 1 },
  { value: 3 },
  { value: 5 },
  { value: 10 },
  { value: 30 },
] as const;

export type LanguageCode = 'ko' | 'en' | 'ja' | 'zh';

interface SettingsState {
  autoLockMinutes: number;
  lockHotkey: string;
  language: LanguageCode;
  setAutoLockMinutes: (v: number) => void;
  setLockHotkey: (v: string) => void;
  setLanguage: (v: LanguageCode) => void;
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
      language: 'en',
      setAutoLockMinutes: (v) => set({ autoLockMinutes: v }),
      setLockHotkey: (v) => set({ lockHotkey: v }),
      setLanguage: (v) => set({ language: v }),
    }),
    {
      name: 'vault-settings',
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown> | undefined;
        const hotkey = migrateLockHotkey(persisted);
        const lang = (p?.language as LanguageCode) || 'en';
        return {
          ...current,
          ...(persisted as object),
          lockHotkey: hotkey,
          language: ['ko', 'en', 'ja', 'zh'].includes(lang) ? lang : 'en',
        };
      },
    },
  ),
);
