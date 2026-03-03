import {
  AUTO_LOCK_OPTIONS,
  type LanguageCode,
  useSettingsStore,
} from '@/stores/useSettingsStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Crown,
  FolderOpen,
  Image,
  Keyboard,
  Loader2,
  Lock,
  Palette,
  Timer,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const MODIFIER_ORDER = ['Ctrl', 'Shift', 'Alt'];

const LANGUAGE_OPTIONS: { value: LanguageCode; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
];

function formatChord(keys: Set<string>): string {
  const mods = MODIFIER_ORDER.filter((m) => keys.has(m));
  const rest = [...keys].filter((k) => !MODIFIER_ORDER.includes(k));
  rest.sort((a, b) => a.localeCompare(b));
  return [...mods, ...rest].join('+');
}

function keyToPart(e: KeyboardEvent): string | null {
  const key = e.key;
  if (key === 'Control') return 'Ctrl';
  if (key === 'Shift') return 'Shift';
  if (key === 'Alt') return 'Alt';
  if (['Meta', 'OS', 'Win'].includes(key)) return null;
  return key.length === 1 ? key.toUpperCase() : key;
}

/** 2~3개 키 조합만 유효 */
function isValidChord(parts: Set<string>): boolean {
  return parts.size >= 2 && parts.size <= 3;
}

function HotkeyInput({
  value,
  onChange,
  placeholder,
  recordingLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  recordingLabel: string;
}) {
  const [recording, setRecording] = useState(false);
  const keysPressedRef = useRef<Set<string>>(new Set());

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const part = keyToPart(e);
    if (!part) return;
    e.preventDefault();
    keysPressedRef.current.add(part);
  }, []);

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const part = keyToPart(e);
      if (!part) return;
      e.preventDefault();
      const before = new Set(keysPressedRef.current);
      keysPressedRef.current.delete(part);
      if (isValidChord(before)) {
        onChange(formatChord(before));
        setRecording(false);
        keysPressedRef.current.clear();
      }
    },
    [onChange],
  );

  useEffect(() => {
    if (!recording) return;
    keysPressedRef.current.clear();
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [recording, handleKeyDown, handleKeyUp]);

  return (
    <button
      type="button"
      onClick={() => setRecording(!recording)}
      className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors min-w-[120px] text-center ${
        recording
          ? 'border-primary bg-primary/10 text-primary animate-pulse'
          : 'border-border bg-secondary text-secondary-foreground hover:bg-accent'
      }`}
    >
      {recording ? recordingLabel : value || placeholder}
    </button>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const {
    autoLockMinutes,
    setAutoLockMinutes,
    lockHotkey,
    setLockHotkey,
    language,
    setLanguage,
  } = useSettingsStore();
  const {
    mode,
    colorTheme,
    backgroundImage,
    setMode,
    setColorTheme,
    setBackgroundImage,
  } = useThemeStore();
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

  // 비밀번호 변경
  const [pwModal, setPwModal] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

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
        title: t('settings.selectStorageLocation'),
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

  const handleChangePassword = useCallback(async () => {
    setPwError('');

    if (!pwCurrent.trim()) {
      setPwError(t('pwErrors.enterCurrent'));
      return;
    }
    if (!pwNew) {
      setPwError(t('pwErrors.enterNew'));
      return;
    }
    if (pwNew.length < 6) {
      setPwError(t('pwErrors.minLength'));
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError(t('pwErrors.mismatch'));
      return;
    }
    if (pwCurrent === pwNew) {
      setPwError(t('pwErrors.sameAsCurrent'));
      return;
    }

    setPwLoading(true);
    try {
      await invoke('vault_change_password', {
        currentPassword: pwCurrent,
        newPassword: pwNew,
      });
      toast.success(t('pwErrors.changed'));
      setPwModal(false);
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes('현재 비밀번호') ||
        msg.includes('current password') ||
        msg.includes('incorrect') ||
        msg.includes('wrong')
      ) {
        setPwError(t('pwErrors.wrongCurrent'));
      } else {
        setPwError(msg);
      }
    } finally {
      setPwLoading(false);
    }
  }, [pwCurrent, pwNew, pwConfirm, t]);

  const closePwModal = () => {
    setPwModal(false);
    setPwCurrent('');
    setPwNew('');
    setPwConfirm('');
    setPwError('');
  };

  const handleSelectBackground = useCallback(async () => {
    if (!isTauriEnv()) return;
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: t('settings.backgroundSelect'),
        filters: [
          {
            name: t('settings.imageFilter'),
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
          },
        ],
      });
      if (selected) setBackgroundImage(selected);
    } catch {
      /* ignore */
    }
  }, [setBackgroundImage, t]);

  return (
    <div className="divide-y divide-border">
      <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2 text-sm shrink-0">
          <Palette size={15} className="text-muted-foreground" />
          {t('settings.theme')}
        </span>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
              className="px-3 py-1.5 rounded-lg text-xs border border-border bg-secondary hover:bg-accent"
            >
              {mode === 'light'
                ? t('settings.themeLight')
                : t('settings.themeDark')}
            </button>
            <div className="flex gap-1">
              {(
                ['blue', 'green', 'purple', 'orange', 'rose', 'cyan'] as const
              ).map((c) => (
                <button
                  key={c}
                  onClick={() => setColorTheme(c)}
                  className={`w-6 h-6 rounded-full border-2 transition ${
                    colorTheme === c
                      ? 'border-primary scale-110'
                      : 'border-transparent'
                  }`}
                  style={{
                    backgroundColor:
                      c === 'blue'
                        ? '#3B82F6'
                        : c === 'green'
                          ? '#16A34A'
                          : c === 'purple'
                            ? '#A855F7'
                            : c === 'orange'
                              ? '#F97316'
                              : c === 'rose'
                                ? '#F43F5E'
                                : '#06B6D4',
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>
          {isTauriEnv() && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Image size={12} />
                {t('settings.background')}
              </span>
              <button
                type="button"
                onClick={handleSelectBackground}
                className="px-3 py-1 rounded text-xs border border-border bg-secondary hover:bg-accent"
              >
                {t('settings.backgroundSelect')}
              </button>
              {backgroundImage && (
                <button
                  type="button"
                  onClick={() => setBackgroundImage('')}
                  className="px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('settings.backgroundRemove')}
                </button>
              )}
              {backgroundImage && (
                <span
                  className="text-xs text-muted-foreground truncate max-w-[120px]"
                  title={backgroundImage}
                >
                  {backgroundImage.split(/[/\\]/).pop() ||
                    t('settings.selected')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">🌐</span>
          {t('settings.language')}
        </span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as LanguageCode)}
          className="px-3 py-1.5 rounded-lg text-xs border border-border bg-secondary text-secondary-foreground hover:bg-accent cursor-pointer"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2 text-sm">
          <Timer size={15} className="text-muted-foreground" />
          {t('settings.autoLock')}
        </span>
        <select
          value={autoLockMinutes}
          onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
          className="px-3 py-1.5 rounded-lg text-xs border border-border bg-secondary text-secondary-foreground hover:bg-accent cursor-pointer"
        >
          {AUTO_LOCK_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t('settings.autoLockMinutes', { count: opt.value })}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2 text-sm">
          <Keyboard size={15} className="text-muted-foreground" />
          {t('settings.lockShortcut')}
        </span>
        <HotkeyInput
          value={lockHotkey}
          onChange={setLockHotkey}
          placeholder={t('settings.lockShortcutPlaceholder')}
          recordingLabel={t('settings.lockShortcutRecording')}
        />
      </div>

      {isTauriEnv() && (
        <div className="flex items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2 text-sm">
            <Lock size={15} className="text-muted-foreground" />
            {t('settings.changePassword')}
          </span>
          <button
            type="button"
            onClick={() => setPwModal(true)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium border border-border bg-secondary hover:bg-accent transition-colors"
          >
            {t('settings.change')}
          </button>
        </div>
      )}

      {isTauriEnv() && (
        <div className="px-6 py-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm">
              <FolderOpen size={15} className="text-muted-foreground" />
              {t('settings.storageLocation')}
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
                t('settings.change')
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
          {t('settings.premium')}
        </span>
        {licenseStatus?.is_premium ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-primary">
              {t('settings.premiumActive')}
            </span>
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
              {t('settings.info')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPurchaseModal(true)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('settings.upgrade')}
          </button>
        )}
      </div>

      {/* 비밀번호 변경 모달 */}
      {pwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg shadow-lg p-6 max-w-md mx-4">
            <h3 className="font-semibold text-sm mb-4">
              {t('settingsModals.changePasswordTitle')}
            </h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs mb-1">
                  {t('settingsModals.currentPassword')}
                </label>
                <input
                  type="password"
                  value={pwCurrent}
                  onChange={(e) => {
                    setPwCurrent(e.target.value);
                    setPwError('');
                  }}
                  placeholder={t('settingsModals.currentPasswordPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-secondary"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleChangePassword();
                  }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1">
                  {t('settingsModals.newPassword')}
                </label>
                <input
                  type="password"
                  value={pwNew}
                  onChange={(e) => {
                    setPwNew(e.target.value);
                    setPwError('');
                  }}
                  placeholder={t('settingsModals.newPasswordPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-secondary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleChangePassword();
                  }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1">
                  {t('settingsModals.confirmPassword')}
                </label>
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => {
                    setPwConfirm(e.target.value);
                    setPwError('');
                  }}
                  placeholder={t('settingsModals.confirmPasswordPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-secondary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleChangePassword();
                  }}
                />
              </div>
            </div>
            {pwError && (
              <p className="text-xs text-destructive mb-4">{pwError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closePwModal}
                disabled={pwLoading}
                className="px-4 py-2 rounded-lg text-xs border border-border hover:bg-accent disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleChangePassword}
                disabled={pwLoading}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {pwLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  t('settings.change')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg shadow-lg p-6 max-w-md mx-4">
            <h3 className="font-semibold text-sm mb-2">
              {t('settingsModals.changeLocationTitle')}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('settingsModals.changeLocationDesc')}
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
                {t('common.cancel')}
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
                  t('settingsModals.continue')
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
              {t('settingsModals.purchaseTitle')}
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
                      placeholder={t('settingsModals.namePlaceholder')}
                      className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-secondary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">
                      {t('settingsModals.email')}
                    </label>
                    <input
                      type="email"
                      value={purchaseEmail}
                      onChange={(e) => setPurchaseEmail(e.target.value)}
                      placeholder={t('settingsModals.emailPlaceholder')}
                      className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-secondary"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    계좌이체: 신한은행 110-444-226804
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
                  {t('settingsModals.close')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!purchaseName.trim() || !purchaseEmail.trim()) {
                        setPurchaseError(t('settingsModals.enterNameAndEmail'));
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
                            : t('settingsModals.requestFailed'),
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
                      t('settingsModals.sendRequest')
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
                    {t('settingsModals.close')}
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
              {licenseStatus?.is_premium
                ? t('settingsModals.licenseInfo')
                : t('settingsModals.licenseActivate')}
            </h3>
            {licenseStatus?.is_premium ? (
              <p className="text-sm text-muted-foreground mb-4">
                {t('settingsModals.activatedEmail')}:{' '}
                {licenseStatus.email || '—'}
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
                      {t('settingsModals.purchaseEmail')}
                    </label>
                    <input
                      type="email"
                      value={activateEmail}
                      onChange={(e) => setActivateEmail(e.target.value)}
                      placeholder={t('settingsModals.emailPlaceholder')}
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
                {licenseStatus?.is_premium
                  ? t('settingsModals.close')
                  : t('common.cancel')}
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
                    t('settingsModals.activate')
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
