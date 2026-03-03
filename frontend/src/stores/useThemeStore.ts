import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'light' | 'dark';
type ColorTheme = 'blue' | 'green' | 'purple' | 'orange' | 'rose' | 'cyan';

interface ThemeState {
  mode: ThemeMode;
  colorTheme: ColorTheme;
  /** 배경 이미지 경로 (빈 문자열 = 없음). Tauri: convertFileSrc로 표시 */
  backgroundImage: string;
  setMode: (mode: ThemeMode) => void;
  setColorTheme: (color: ColorTheme) => void;
  setBackgroundImage: (path: string) => void;
  applyTheme: () => void;
}

const applyThemeToDOM = (mode: ThemeMode, colorTheme: ColorTheme) => {
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.remove(
    'theme-blue',
    'theme-green',
    'theme-purple',
    'theme-orange',
    'theme-rose',
    'theme-cyan',
  );
  root.classList.add(mode);
  root.classList.add(`theme-${colorTheme}`);
  root.setAttribute('data-theme', `${mode}-${colorTheme}`);
  if (!root.style.getPropertyValue('--theme-transition')) {
    root.style.setProperty('--theme-transition', '400ms ease');
  }
  try {
    const styles = window.getComputedStyle(root);
    const primary = styles.getPropertyValue('--primary')?.trim();
    const primaryFg = styles.getPropertyValue('--primary-foreground')?.trim();
    const header = document.querySelector('header') as HTMLElement | null;
    if (header && primary) {
      header.style.backgroundColor = `hsl(${primary})`;
      if (primaryFg) header.style.color = `hsl(${primaryFg})`;
    }
  } catch {
    /* ignore */
  }
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'light',
      colorTheme: 'blue',
      backgroundImage: '',

      setMode: (mode) => {
        set({ mode });
        const { colorTheme } = get();
        applyThemeToDOM(mode, colorTheme);
      },

      setColorTheme: (colorTheme) => {
        set({ colorTheme });
        const { mode } = get();
        applyThemeToDOM(mode, colorTheme);
      },

      setBackgroundImage: (backgroundImage) => set({ backgroundImage }),

      applyTheme: () => {
        const { mode, colorTheme } = get();
        applyThemeToDOM(mode, colorTheme);
      },
    }),
    { name: 'theme-storage' },
  ),
);

if (typeof window !== 'undefined') {
  const store = useThemeStore.getState();
  applyThemeToDOM(store.mode, store.colorTheme);
}
