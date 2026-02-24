import VaultSetupPage from '@/pages/VaultSetupPage/VaultSetupPage';
import VaultUnlockPage from '@/pages/VaultUnlockPage/VaultUnlockPage';
import { useVaultStore } from '@/stores/useVaultStore';
import { invoke } from '@tauri-apps/api/core';
import { ReactNode, useEffect, useState } from 'react';

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface VaultGateProps {
  children: ReactNode;
}

export default function VaultGate({ children }: VaultGateProps) {
  const { isUnlocked, isInitialized, unlock, setInitialized } = useVaultStore();
  const [loading, setLoading] = useState(true);

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
        <div className="animate-pulse text-slate-400">로딩 중...</div>
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

  return <>{children}</>;
}
