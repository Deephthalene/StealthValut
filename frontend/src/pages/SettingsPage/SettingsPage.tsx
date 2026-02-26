import { AUTO_LOCK_OPTIONS, useSettingsStore } from '@/stores/useSettingsStore';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Crown, FolderOpen, Keyboard, Loader2, Timer } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function HotkeyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [recording, setRecording] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      const key = e.key;
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
        parts.push(key.length === 1 ? key.toUpperCase() : key);
      }
      if (parts.length >= 2) {
        onChange(parts.join('+'));
        setRecording(false);
      }
    },
    [onChange],
  );

  useEffect(() => {
    if (!recording) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recording, handleKeyDown]);

  return (
    <button
      onClick={() => setRecording(!recording)}
      className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors min-w-[120px] text-center ${
        recording
          ? 'border-primary bg-primary/10 text-primary animate-pulse'
          : 'border-border bg-secondary text-secondary-foreground hover:bg-accent'
      }`}
    >
      {recording ? '키 입력 대기...' : value || '미설정'}
    </button>
  );
}

export default function SettingsPage() {
  const { autoLockMinutes, setAutoLockMinutes, lockHotkey, setLockHotkey } =
    useSettingsStore();
  const [vaultPath, setVaultPath] = useState('');
  const [pathLoading, setPathLoading] = useState(false);
  const [pathChanging, setPathChanging] = useState(false);
  const [pathError, setPathError] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ newPath: string } | null>(
    null,
  );
  const [licenseStatus, setLicenseStatus] = useState<{
    is_premium: boolean;
    email?: string;
  } | null>(null);
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [purchaseName, setPurchaseName] = useState('');
  const [purchaseEmail, setPurchaseEmail] = useState('');
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [activateModal, setActivateModal] = useState(false);
  const [activateKey, setActivateKey] = useState('');
  const [activateEmail, setActivateEmail] = useState('');
  const [activateError, setActivateError] = useState('');
  const [activateLoading, setActivateLoading] = useState(false);

  useEffect(() => {
    if (isTauriEnv()) {
      setPathLoading(true);
      invoke<string>('get_vault_path')
        .then(setVaultPath)
        .catch(() => setVaultPath(''))
        .finally(() => setPathLoading(false));
    }
  }, []);

  useEffect(() => {
    if (isTauriEnv()) {
      invoke<{ is_premium: boolean; email?: string }>('get_license_status')
        .then(setLicenseStatus)
        .catch(() => setLicenseStatus({ is_premium: false }));
    }
  }, [activateModal, purchaseModal]);

  const handleBrowseChangePath = useCallback(async () => {
    if (!isTauriEnv()) return;
    setPathError('');
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: vaultPath || undefined,
        title: '저장 위치 선택',
      });
      if (selected) setConfirmModal({ newPath: selected });
    } catch {
      // ignore
    }
  }, [vaultPath]);

  const handleConfirmChangePath = useCallback(async () => {
    if (!confirmModal) return;
    setPathChanging(true);
    setPathError('');
    try {
      await invoke('change_vault_location', { newPath: confirmModal.newPath });
      setVaultPath(confirmModal.newPath);
      setConfirmModal(null);
    } catch (e) {
      setPathError(e instanceof Error ? e.message : String(e));
    } finally {
      setPathChanging(false);
    }
  }, [confirmModal]);

  const handleActivateLicense = useCallback(async () => {
    setActivateError('');
    if (!activateKey.trim() || !activateEmail.trim()) return;
    setActivateLoading(true);
    try {
      await invoke('verify_and_activate_license', {
        key: activateKey.trim(),
        email: activateEmail.trim(),
      });
      setActivateModal(false);
      setActivateKey('');
      setActivateEmail('');
      invoke<{ is_premium: boolean; email?: string }>(
        'get_license_status',
      ).then(setLicenseStatus);
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : String(e));
    } finally {
      setActivateLoading(false);
    }
  }, [activateKey, activateEmail]);

  return (
    <div className="divide-y divide-border">
      <div className="flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2 text-sm">
          <Timer size={15} className="text-muted-foreground" />
          자동 잠금
        </span>
        <select
          value={autoLockMinutes}
          onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
          className="px-3 py-1.5 rounded-lg text-xs border border-border bg-secondary text-secondary-foreground hover:bg-accent cursor-pointer"
        >
          {AUTO_LOCK_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2 text-sm">
          <Keyboard size={15} className="text-muted-foreground" />
          잠금 단축키
        </span>
        <HotkeyInput value={lockHotkey} onChange={setLockHotkey} />
      </div>

      {isTauriEnv() && (
        <div className="px-6 py-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm">
              <FolderOpen size={15} className="text-muted-foreground" />
              저장 위치
            </span>
            <button
              type="button"
              onClick={handleBrowseChangePath}
              disabled={pathLoading || pathChanging}
              className="px-4 py-1.5 rounded-lg text-xs font-medium border border-border bg-secondary hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {pathChanging ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                '변경'
              )}
            </button>
          </div>
          <p
            className="text-xs text-muted-foreground truncate"
            title={vaultPath}
          >
            {pathLoading ? '...' : vaultPath || '—'}
          </p>
          {pathError && <p className="text-xs text-destructive">{pathError}</p>}
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2 text-sm">
          <Crown size={15} className="text-muted-foreground" />
          프리미엄
        </span>
        {licenseStatus?.is_premium ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-primary">프리미엄 ✓</span>
            {licenseStatus.email && (
              <span
                className="text-xs text-muted-foreground truncate max-w-[120px]"
                title={licenseStatus.email}
              >
                {licenseStatus.email}
              </span>
            )}
            <button
              type="button"
              onClick={() => setActivateModal(true)}
              className="px-3 py-1 rounded text-xs border border-border hover:bg-accent"
            >
              정보
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPurchaseModal(true)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            업그레이드
          </button>
        )}
      </div>

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg shadow-lg p-6 max-w-md mx-4">
            <h3 className="font-semibold text-sm mb-2">저장 위치 변경</h3>
            <p className="text-sm text-muted-foreground mb-4">
              저장 위치를 변경하면 모든 파일이 새 경로로 이동됩니다. 파일 크기에
              따라 시간이 걸릴 수 있습니다. 계속하시겠습니까?
            </p>
            <p
              className="text-xs text-muted-foreground mb-4 truncate"
              title={confirmModal.newPath}
            >
              {confirmModal.newPath}
            </p>
            {pathError && (
              <p className="text-xs text-destructive mb-4">{pathError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setConfirmModal(null);
                  setPathError('');
                }}
                disabled={pathChanging}
                className="px-4 py-2 rounded-lg text-xs border border-border hover:bg-accent disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmChangePath}
                disabled={pathChanging}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {pathChanging ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  '계속'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {purchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg shadow-lg p-6 max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-sm mb-4">
              StealthVault 프리미엄
            </h3>
            {purchaseSuccess ? (
              <p className="text-sm text-muted-foreground mb-4">
                구매 요청이 전송되었습니다. 계좌이체 후 영업일 기준 1일 이내
                입력하신 이메일로 라이센스 키를 발송해드립니다.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-4">
                  이름과 이메일을 입력한 뒤 구매 요청을 보내주세요. 계좌이체로
                  결제하시면 이메일로 라이센스 키를 발송해드립니다. 영업일 기준
                  1일 이내 처리됩니다. (이름은 확인 후 삭제됩니다.)
                </p>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-xs mb-1">이름 *</label>
                    <input
                      type="text"
                      value={purchaseName}
                      onChange={(e) => setPurchaseName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-secondary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">이메일 *</label>
                    <input
                      type="email"
                      value={purchaseEmail}
                      onChange={(e) => setPurchaseEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-secondary"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    💳 계좌이체: 신한은행 110-444-226804
                  </p>
                </div>
                {purchaseError && (
                  <p className="text-xs text-destructive mb-4">
                    {purchaseError}
                  </p>
                )}
              </>
            )}
            <p className="text-xs text-muted-foreground mb-4">
              이미 키가 있으신가요?{' '}
              <button
                type="button"
                onClick={() => {
                  setPurchaseModal(false);
                  setPurchaseSuccess(false);
                  setPurchaseError('');
                  setActivateModal(true);
                }}
                className="text-primary hover:underline"
              >
                라이센스 키 입력
              </button>
            </p>
            <div className="flex gap-2 justify-end">
              {purchaseSuccess ? (
                <button
                  type="button"
                  onClick={() => {
                    setPurchaseModal(false);
                    setPurchaseSuccess(false);
                  }}
                  className="px-4 py-2 rounded-lg text-xs border border-border hover:bg-accent"
                >
                  닫기
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!purchaseName.trim() || !purchaseEmail.trim()) {
                        setPurchaseError('이름과 이메일을 입력해주세요.');
                        return;
                      }
                      setPurchaseError('');
                      setPurchaseLoading(true);
                      try {
                        await invoke('send_purchase_request', {
                          name: purchaseName.trim(),
                          email: purchaseEmail.trim(),
                        });
                        setPurchaseSuccess(true);
                      } catch (e) {
                        setPurchaseError(
                          e instanceof Error
                            ? e.message
                            : '요청 전송에 실패했습니다.',
                        );
                      } finally {
                        setPurchaseLoading(false);
                      }
                    }}
                    disabled={purchaseLoading}
                    className="px-4 py-2 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {purchaseLoading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        전송 중...
                      </>
                    ) : (
                      '구매 요청 보내기'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPurchaseModal(false);
                      setPurchaseError('');
                    }}
                    className="px-4 py-2 rounded-lg text-xs border border-border hover:bg-accent"
                  >
                    닫기
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg shadow-lg p-6 max-w-md mx-4">
            <h3 className="font-semibold text-sm mb-4">
              {licenseStatus?.is_premium ? '라이센스 정보' : '라이센스 활성화'}
            </h3>
            {licenseStatus?.is_premium ? (
              <p className="text-sm text-muted-foreground mb-4">
                활성화된 이메일: {licenseStatus.email || '—'}
              </p>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-xs mb-1">라이센스 키 *</label>
                    <input
                      type="text"
                      value={activateKey}
                      onChange={(e) => setActivateKey(e.target.value)}
                      placeholder="STLV-XXXXX-XXXXX-XXXXX-XXXXX"
                      className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-secondary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">
                      구매 시 입력한 이메일 *
                    </label>
                    <input
                      type="email"
                      value={activateEmail}
                      onChange={(e) => setActivateEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-secondary"
                    />
                  </div>
                </div>
                {activateError && (
                  <p className="text-xs text-destructive mb-4">
                    {activateError}
                  </p>
                )}
              </>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setActivateModal(false);
                  setActivateKey('');
                  setActivateEmail('');
                  setActivateError('');
                }}
                className="px-4 py-2 rounded-lg text-xs border border-border hover:bg-accent"
              >
                {licenseStatus?.is_premium ? '닫기' : '취소'}
              </button>
              {!licenseStatus?.is_premium && (
                <button
                  type="button"
                  onClick={handleActivateLicense}
                  disabled={activateLoading}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {activateLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    '활성화'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
