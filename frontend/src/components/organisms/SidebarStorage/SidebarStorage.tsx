import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface QuotaResult {
  disk_free_bytes: number;
  disk_free_gb: number;
  vault_used_bytes: number;
  vault_used_gb: number;
  limit_bytes: number;
  limit_gb: number;
  can_deposit: boolean;
  is_premium: boolean;
}

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const VAULT_FILES_CHANGED = 'vault-files-changed';

export function dispatchVaultFilesChanged() {
  window.dispatchEvent(new CustomEvent(VAULT_FILES_CHANGED));
}

export default function SidebarStorage() {
  const { t } = useTranslation();
  const [quota, setQuota] = useState<QuotaResult | null>(null);

  useEffect(() => {
    if (!isTauriEnv()) return;
    const load = async () => {
      try {
        const result = await invoke<QuotaResult>('check_quota');
        setQuota(result);
      } catch {
        setQuota(null);
      }
    };
    load();
    const onChanged = () => load();
    window.addEventListener(VAULT_FILES_CHANGED, onChanged);

    // cleanup 완료 이벤트: 토스트 + 용량 갱신
    const unlistenPromise = listen<{ deleted: number; freed_mb: number }>(
      'vault-cleanup-done',
      (event) => {
        const { deleted, freed_mb } = event.payload;
        toast.info(
          t('sidebar.cleanupDone', {
            count: deleted,
            freed: freed_mb >= 1024
              ? `${(freed_mb / 1024).toFixed(2)} GB`
              : `${freed_mb.toFixed(0)} MB`,
          }),
        );
        load();
      },
    );

    return () => {
      window.removeEventListener(VAULT_FILES_CHANGED, onChanged);
      unlistenPromise.then((fn) => fn());
    };
  }, [t]);

  if (!quota) return null;

  const usedPercent = Math.min(
    100,
    (quota.vault_used_bytes / quota.limit_bytes) * 100,
  );

  const limitLabel = quota.is_premium
    ? `${quota.limit_gb.toFixed(0)} GB`
    : `${quota.limit_gb} GB`;

  return (
    <div className="px-3 py-3 border-b border-border">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        {t('sidebar.storage')}
        {quota.is_premium && (
          <span className="ml-1.5 text-[10px] text-primary font-semibold">
            {t('settings.premium')}
          </span>
        )}
      </p>
      <div className="space-y-1.5 text-xs text-foreground">
        <div>
          {t('sidebar.diskFree')}: {quota.disk_free_gb.toFixed(1)} GB
        </div>
        <div>
          {t('sidebar.vaultUsed')}: {quota.vault_used_gb.toFixed(2)} GB /{' '}
          {limitLabel}
          {quota.is_premium && (
            <span className="ml-1 text-muted-foreground">
              ({t('sidebar.disk')})
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all rounded-full"
          style={{ width: `${usedPercent}%` }}
        />
      </div>
      {!quota.can_deposit && (
        <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-500">
          {quota.is_premium ? t('sidebar.diskFull') : t('sidebar.limitReached')}
        </p>
      )}
    </div>
  );
}
