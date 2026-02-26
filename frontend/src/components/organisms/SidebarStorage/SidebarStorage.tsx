import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

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
    return () => window.removeEventListener(VAULT_FILES_CHANGED, onChanged);
  }, []);

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
        저장 공간
        {quota.is_premium && (
          <span className="ml-1.5 text-[10px] text-primary font-semibold">
            프리미엄
          </span>
        )}
      </p>
      <div className="space-y-1.5 text-xs text-foreground">
        <div>하드 여유: {quota.disk_free_gb.toFixed(1)} GB</div>
        <div>
          금고 사용: {quota.vault_used_gb.toFixed(2)} GB / {limitLabel}
          {quota.is_premium && (
            <span className="ml-1 text-muted-foreground">(디스크)</span>
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
          {quota.is_premium ? '디스크 공간 부족' : '한도 도달'}
        </p>
      )}
    </div>
  );
}
