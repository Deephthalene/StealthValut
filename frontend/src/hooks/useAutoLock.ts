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

  // 잠금 단축키 (2~3개 키 조합 1개) → 잠금 + 창 트레이로 숨김 (Panic 동작)
  useEffect(() => {
    const hotkey = lockHotkey?.trim();
    if (!isUnlocked || !hotkey) return;

    const keyToPart = (e: KeyboardEvent): string | null => {
      const key = e.key;
      if (key === 'Control') return 'Ctrl';
      if (key === 'Shift') return 'Shift';
      if (key === 'Alt') return 'Alt';
      if (['Meta', 'OS', 'Win'].includes(key)) return null;
      return key.length === 1 ? key.toUpperCase() : key;
    };

    const keysPressed = new Set<string>();
    const hotkeySet = new Set(
      hotkey
        .split('+')
        .map((p) =>
          p.trim().length === 1 ? p.trim().toUpperCase() : p.trim(),
        ),
    );

    const checkMatch = () =>
      hotkeySet.size === keysPressed.size &&
      [...hotkeySet].every((k) => keysPressed.has(k));

    const onKeyDown = (e: KeyboardEvent) => {
      const part = keyToPart(e);
      if (!part) return;
      keysPressed.add(part);
      if (checkMatch()) {
        e.preventDefault();
        keysPressed.clear();
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          getCurrentWindow()
            .hide()
            .then(() => lock())
            .catch(() => lock());
        } else {
          lock();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const part = keyToPart(e);
      if (part) keysPressed.delete(part);
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    };
  }, [isUnlocked, lockHotkey, lock]);
}
