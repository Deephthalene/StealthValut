import { useThemeStore } from '@/stores/useThemeStore';
import { ReactNode } from 'react';
import { ThemeProvider } from 'styled-components';
import { darkTheme, lightTheme } from './theme';

interface AppThemeProviderProps {
  children: ReactNode;
}

export function AppThemeProvider({ children }: AppThemeProviderProps) {
  const { mode } = useThemeStore();
  const theme = mode === 'dark' ? darkTheme : lightTheme;
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
