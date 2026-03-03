import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface VaultUnlockPageProps {
  onUnlock: () => void;
  onReset?: () => void;
}

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const isDev = import.meta.env.DEV;

export default function VaultUnlockPage({
  onUnlock,
  onReset,
}: VaultUnlockPageProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'password' | 'recovery' | 'reset-password'>(
    'password',
  );
  const [password, setPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'reset-password') return;

    const value = mode === 'password' ? password.trim() : recoveryKey.trim();
    if (!value) {
      setError(
        mode === 'password'
          ? t('setupErrors.enterPassword')
          : t('setupErrors.enterRecoveryKey'),
      );
      return;
    }

    setLoading(true);
    try {
      if (isTauriEnv()) {
        if (mode === 'password') {
          const ok = await invoke<boolean>('vault_verify', { password: value });
          if (ok) {
            await invoke('vault_cache_key', { password: value });
            onUnlock();
          } else {
            setError(t('setupErrors.wrongPassword'));
          }
        } else {
          const ok = await invoke<boolean>('vault_verify_recovery_key', {
            recoveryKey: value,
          });
          if (ok) {
            setMode('reset-password');
          } else {
            setError(t('setupErrors.wrongRecoveryKey'));
          }
        }
      } else {
        onUnlock();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError(t('setupErrors.minPassword'));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError(t('setupErrors.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      if (isTauriEnv()) {
        await invoke('vault_reset_password', {
          recoveryKey: recoveryKey.trim(),
          newPassword,
        });
        await invoke('vault_cache_key', { password: newPassword });
        onUnlock();
      } else {
        onUnlock();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!onReset || !isTauriEnv()) return;
    setLoading(true);
    try {
      await invoke('vault_reset');
      onReset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            StealthVault
          </h1>
          <p className="mt-2 text-slate-400 text-sm">
            {mode === 'password'
              ? t('unlock.passwordPrompt')
              : mode === 'recovery'
                ? t('unlock.recoveryPrompt')
                : t('unlock.newPasswordPrompt')}
          </p>
        </div>

        {mode === 'reset-password' ? (
          <form onSubmit={handleResetPassword} className="space-y-6">
            <div className="space-y-4">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('unlock.newPassword')}
                className="w-full px-4 py-3 rounded-lg bg-slate-800/80 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                autoFocus
                disabled={loading}
              />
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder={t('setup.passwordConfirm')}
                className="w-full px-4 py-3 rounded-lg bg-slate-800/80 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                disabled={loading}
              />
              {error && <p className="text-sm text-rose-400">{error}</p>}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {loading ? t('setup.setting') : t('unlock.resetWithNew')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              {mode === 'password' ? (
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('unlock.password')}
                  className="w-full px-4 py-3 rounded-lg bg-slate-800/80 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  autoFocus
                  disabled={loading}
                />
              ) : (
                <input
                  type="text"
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  placeholder={t('unlock.recoveryKey')}
                  className="w-full px-4 py-3 rounded-lg bg-slate-800/80 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 font-mono text-sm"
                  autoFocus
                  disabled={loading}
                />
              )}
              {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {loading
                ? t('unlock.verifying')
                : mode === 'recovery'
                  ? t('common.next')
                  : t('unlock.openVault')}
            </button>
          </form>
        )}

        <div className="space-y-3 text-center">
          {mode === 'reset-password' ? (
            <button
              type="button"
              onClick={() => {
                setMode('recovery');
                setNewPassword('');
                setConfirmNewPassword('');
                setError('');
              }}
              className="text-slate-400 hover:text-slate-300 text-sm underline"
            >
              {t('unlock.backToRecovery')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === 'password' ? 'recovery' : 'password'));
                setError('');
              }}
              className="text-slate-400 hover:text-slate-300 text-sm underline"
            >
              {mode === 'password'
                ? t('unlock.forgotPassword')
                : t('unlock.usePassword')}
            </button>
          )}

          {isDev && onReset && isTauriEnv() && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                className="text-amber-500/80 hover:text-amber-400 text-xs underline"
              >
                {t('unlock.devReset')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
