import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import i18n from './i18n';
import './index.css';
import { useSettingsStore } from './stores/useSettingsStore';
import { AppThemeProvider } from './styles/AppThemeProvider';

useSettingsStore.subscribe((state) => {
  i18n.changeLanguage(state.language);
});
i18n.changeLanguage(useSettingsStore.getState().language);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppThemeProvider>
        <App />
      </AppThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
