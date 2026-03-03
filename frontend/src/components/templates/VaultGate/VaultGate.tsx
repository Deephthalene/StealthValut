import { useAutoLock } from '@/hooks/useAutoLock';
import i18n from '@/i18n';
import VaultSetupPage from '@/pages/VaultSetupPage/VaultSetupPage';
import VaultUnlockPage from '@/pages/VaultUnlockPage/VaultUnlockPage';
import { useVaultStore } from '@/stores/useVaultStore';
import { invoke } from '@tauri-apps/api/core';
import { Component, ReactNode, useEffect, useState } from 'react';

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

class VaultErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-slate-900 gap-4">
          <p className="text-rose-400 text-sm">
            {i18n.t('gate.errorOccurred')}
          </p>
          <p className="text-slate-500 text-xs max-w-md text-center">
            {this.state.error.message}
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm"
          >
            {i18n.t('gate.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface VaultGateProps {
  children: ReactNode;
}

export default function VaultGate({ children }: VaultGateProps) {
  const { isUnlocked, isInitialized, unlock, lock, setInitialized } =
    useVaultStore();
  const [loading, setLoading] = useState(true);

  useAutoLock();

  useEffect(() => {
    const check = async () => {
      if (!isTauriEnv()) {
        setLoading(false);
        return;
      }
      try {
        const exists = await invoke<boolean>('vault_exists');
        setInitialized(exists);
      } catch {
        setInitialized(false);
      } finally {
        setLoading(false);
      }
    };
    check();
  }, [setInitialized]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-900">
        <div className="animate-pulse text-slate-400">
          {i18n.t('gate.loading')}
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <VaultSetupPage
        onComplete={() => {
          setInitialized(true);
          unlock();
        }}
      />
    );
  }

  if (!isUnlocked) {
    return (
      <VaultUnlockPage
        onUnlock={unlock}
        onReset={() => setInitialized(false)}
      />
    );
  }

  return (
    <VaultErrorBoundary onReset={() => lock()}>{children}</VaultErrorBoundary>
  );
}
