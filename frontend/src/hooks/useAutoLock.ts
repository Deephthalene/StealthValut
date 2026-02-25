import { useSettingsStore } from '@/stores/useSettingsStore';
import { useVaultStore } from '@/stores/useVaultStore';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef } from 'react';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
];

export function useAutoLock() {
  const { isUnlocked, lock } = useVaultStore();
  const { autoLockMinutes, lockHotkey } = useSettingsStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());

  const timeoutMs = autoLockMinutes * 60 * 1000;

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!isUnlocked) return;
    timerRef.current = setTimeout(() => lock(), timeoutMs);
  }, [isUnlocked, timeoutMs, lock]);

  useEffect(() => {
    if (!isUnlocked) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    resetTimer();

    const activityHandler = () => resetTimer();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, activityHandler, { passive: true });
    }

    // 앱이 최소화/트레이 → setTimeout throttle 대비
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= timeoutMs) {
          lock();
        } else {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => lock(), timeoutMs - elapsed);
        }
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, activityHandler);
      }
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, [isUnlocked, resetTimer, timeoutMs, lock]);

  // 잠금 단축키 → 잠금 + 창 최소화(트레이)
  useEffect(() => {
    if (!isUnlocked || !lockHotkey) return;

    const parts = lockHotkey.toLowerCase().split('+');
    const handler = (e: KeyboardEvent) => {
      const ctrl = parts.includes('ctrl') === e.ctrlKey;
      const shift = parts.includes('shift') === e.shiftKey;
      const alt = parts.includes('alt') === e.altKey;
      const key = parts.filter((p) => !['ctrl', 'shift', 'alt'].includes(p))[0];
      if (
        ctrl &&
        shift &&
        alt &&
        key &&
        e.key.toLowerCase() === key.toLowerCase()
      ) {
        e.preventDefault();
        lock();
        getCurrentWindow()
          .minimize()
          .catch(() => {});
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isUnlocked, lockHotkey, lock]);
}
