import { defaultWindowIcon } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { Menu } from '@tauri-apps/api/menu';
import { TrayIcon } from '@tauri-apps/api/tray';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef } from 'react';

/** 트레이 아이콘 생성 + 창 닫기 시 숨김, 트레이 클릭 시 복원 */
export function useSystemTray() {
  const trayRef = useRef<TrayIcon | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window))
      return;

    let mounted = true;

    (async () => {
      try {
        const icon = await defaultWindowIcon();
        const win = getCurrentWindow();

        const menu = await Menu.new({
          items: [
            {
              id: 'show',
              text: 'StealthVault 열기',
              action: () => {
                win.show();
                win.setFocus();
              },
            },
            {
              id: 'quit',
              text: '종료',
              action: () => {
                invoke('app_exit');
              },
            },
          ],
        });

        const tray = await TrayIcon.new({
          icon,
          tooltip: 'StealthVault',
          menu,
          showMenuOnLeftClick: false,
          action: (event) => {
            if (event.type === 'Click' && event.button === 'Left') {
              win.show();
              win.setFocus();
            }
          },
        });

        if (mounted) trayRef.current = tray;
      } catch {
        // tray-icon feature 없거나 플랫폼 미지원
      }
    })();

    return () => {
      mounted = false;
      trayRef.current?.close?.();
      trayRef.current = null;
    };
  }, []);
}
