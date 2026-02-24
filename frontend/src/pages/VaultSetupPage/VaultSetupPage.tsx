import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Check, Copy, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';

interface VaultSetupPageProps {
  onComplete: () => void;
}

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

type Step = 'location' | 'password' | 'recovery' | 'terms' | 'done';

const TERMS_TEXT = `StealthVault 이용약관

제1조 (목적)
본 약관은 'StealthVault'(이하 '서비스')가 제공하는 로컬 기반 데이터 암호화 및 관리 도구의 이용 조건과 절차를 규정함을 목적으로 합니다.

제2조 (서비스의 본질 및 제로 지식 원칙)
① 본 서비스는 사용자의 기기(로컬 환경) 내에서만 작동하는 단독형 소프트웨어입니다.
② 개발자는 사용자의 데이터를 별도의 서버로 전송, 저장, 열람하지 않는 '제로 지식(Zero-Knowledge)' 아키텍처를 준수합니다.
③ 서비스 내 모든 암호화 키는 사용자의 비밀번호를 기반으로 로컬에서 생성되며, 개발자는 어떠한 경우에도 사용자의 비밀번호나 암호화된 데이터에 접근할 수 없습니다.

제3조 (사용자의 의무 및 책임)
① 비밀번호 관리: 사용자는 자신의 비밀번호 및 복구 키(Mnemonic)를 관리할 전적인 책임이 있습니다. 개발자는 비밀번호 분실 시 이를 복구하거나 재설정할 수 있는 어떠한 기술적 수단도 보유하고 있지 않습니다.
② 콘텐츠 적법성: 사용자는 서비스를 통해 보관하는 파일이 관련 법령(저작권법, 아동·청소년의 성보호에 관한 법률 등)을 위반하지 않도록 해야 합니다.
③ 금지 행위: 본 서비스를 불법적인 데이터를 유통하거나 수사 기관의 정당한 법 집행을 방해할 목적으로 사용하는 것을 금지합니다.

제4조 (유료 서비스 및 라이선스)
① 본 서비스는 기본적으로 5GB의 로컬 암호화 저장 공간을 무료로 제공합니다.
② 사용자가 추가 용량(Quota) 확장을 원하는 경우, 정해진 비용을 지불하고 라이선스 키를 구매해야 합니다.
③ 구매한 라이선스 키는 로컬 앱에 등록되는 즉시 효력이 발생하며, 디지털 상품의 특성상 복구 키가 사용된 이후에는 환불이 제한될 수 있습니다.

제5조 (면책 조항)
① 데이터 손실: 하드웨어 고장, 비밀번호 분실, 운영체제 오류 등으로 발생한 데이터 손실에 대해 개발자는 어떠한 보상 책임도 지지 않습니다.
② 기술적 한계: 본 서비스는 안티 포렌식 기능을 포함하고 있으나, 운영체제(Windows 등)의 자체적인 로그 기록을 100% 완벽하게 차단함을 보장하지는 않습니다.
③ 콘텐츠 책임: 개발자는 사용자가 서비스 내에 보관한 콘텐츠의 내용을 알 수 없으므로, 콘텐츠와 관련된 모든 민·형사상 책임은 사용자 본인에게 있습니다.

제6조 (서비스 종료 및 업데이트)
개발자는 서버를 운영하지 않으므로 사용자는 구매한 버전을 영구적으로 사용할 수 있습니다. 단, 운영체제 업데이트에 따른 호환성 유지를 위한 업데이트 제공 여부는 개발자의 판단에 따릅니다.`;

export default function VaultSetupPage({ onComplete }: VaultSetupPageProps) {
  const [step, setStep] = useState<Step>('location');
  const [vaultPath, setVaultPath] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);

  useEffect(() => {
    if (step === 'location' && isTauriEnv()) {
      invoke<string>('get_default_vault_path')
        .then(setVaultPath)
        .catch(() => {});
    }
  }, [step]);

  const MIN_FREE_GB = 5;

  const handleBrowseFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: vaultPath || undefined,
        title: '금고 저장 위치 선택',
      });
      if (selected) setVaultPath(selected);
    } catch {
      // ignore
    }
  };

  const handleLocationNext = async () => {
    if (!isTauriEnv()) {
      setStep('password');
      return;
    }
    const pathToCheck =
      vaultPath.trim() || (await invoke<string>('get_default_vault_path'));
    try {
      const freeBytes = await invoke<number>('get_disk_free_for_path', {
        path: pathToCheck,
      });
      const freeGB = freeBytes / (1024 * 1024 * 1024);
      if (freeGB < MIN_FREE_GB) {
        setError(
          `선택한 드라이브의 여유 공간이 ${freeGB.toFixed(1)}GB입니다. ` +
            `${MIN_FREE_GB}GB 이상 필요합니다.`,
        );
        return;
      }
      setError('');
      setStep('password');
    } catch {
      setStep('password');
    }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      if (isTauriEnv()) {
        const path =
          vaultPath.trim() || (await invoke<string>('get_default_vault_path'));
        const key = await invoke<string>('vault_init', {
          vaultPath: path,
          password,
        });
        setRecoveryKey(key);
      } else {
        setRecoveryKey(
          'demo-' +
            Array.from(crypto.getRandomValues(new Uint8Array(16)))
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(''),
        );
      }
      setStep('recovery');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyKey = async () => {
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToTerms = () => {
    setStep('terms');
  };

  const handleAgreeAndComplete = () => {
    if (!termsAgreed) return;
    setStep('done');
    onComplete();
  };

  if (step === 'location') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              StealthVault
            </h1>
            <p className="mt-2 text-slate-400 text-sm">
              금고를 저장할 위치를 선택하세요
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
            <p className="text-amber-400 text-sm font-medium">
              ⚠️ 한번 생성 후에는 저장 위치를 변경할 수 없습니다.
            </p>
            <p className="mt-1 text-amber-300/80 text-xs">
              기본값은 C 드라이브입니다. 다른 드라이브(D:, E: 등)를 선택할 수도
              있습니다.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-400">저장 경로</label>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <input
                type="text"
                value={vaultPath}
                onChange={(e) => setVaultPath(e.target.value)}
                placeholder="C:\Users\...\StealthVault"
                className="flex-1 px-4 py-3 rounded-lg bg-slate-800/80 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-sm"
                readOnly={!isTauriEnv()}
              />
              {isTauriEnv() && (
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
                  title="폴더 찾아보기"
                >
                  <FolderOpen size={18} />
                  찾아보기
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleLocationNext}
            className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            다음
          </button>
        </div>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              StealthVault
            </h1>
            <p className="mt-2 text-slate-400 text-sm">
              처음 사용하시는군요. 비밀번호를 설정해주세요
            </p>
          </div>

          <form onSubmit={handleCreatePassword} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 (6자 이상)"
              className="w-full px-4 py-3 rounded-lg bg-slate-800/80 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              autoFocus
              disabled={loading}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 확인"
              className="w-full px-4 py-3 rounded-lg bg-slate-800/80 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              disabled={loading}
            />
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              {loading ? '설정 중...' : '다음'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'recovery') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              복구 키를 안전한 곳에 보관하세요
            </h1>
            <p className="mt-2 text-slate-400 text-sm">
              비밀번호를 잊으시면 이 키로만 복구할 수 있습니다.
              <br />
              <strong className="text-amber-400">
                이 화면은 다시 보여지지 않습니다.
              </strong>
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-800/80 border border-slate-600">
            <p className="text-xs text-slate-500 mb-2 font-mono break-all select-all">
              {recoveryKey}
            </p>
            <button
              type="button"
              onClick={handleCopyKey}
              className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300"
            >
              {copied ? (
                <>
                  <Check size={16} /> 복사됨
                </>
              ) : (
                <>
                  <Copy size={16} /> 클립보드에 복사
                </>
              )}
            </button>
          </div>

          <p className="text-center text-slate-500 text-xs">
            우리는 이 키를 저장하지 않습니다. 분실 시 복구가 불가능합니다.
          </p>

          <button
            onClick={handleToTerms}
            className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            복구 키를 저장했습니다
          </button>
        </div>
      </div>
    );
  }

  if (step === 'terms') {
    return (
      <div className="min-h-dvh flex flex-col bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 min-h-0">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white">
              StealthVault 이용약관
            </h1>
            <p className="mt-1 text-slate-400 text-sm">
              아래 약관에 동의해 주세요
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto rounded-lg bg-slate-800/80 border border-slate-600 p-4 mb-6">
            <pre className="text-slate-300 text-xs whitespace-pre-wrap font-sans leading-relaxed">
              {TERMS_TEXT}
            </pre>
          </div>

          <label className="flex items-start gap-3 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
              className="mt-1 rounded border-slate-600 bg-slate-800 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-slate-300 text-sm">
              위 이용약관에 동의합니다.
            </span>
          </label>

          <button
            onClick={handleAgreeAndComplete}
            disabled={!termsAgreed}
            className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            동의하고 금고 열기
          </button>
        </div>
      </div>
    );
  }

  return null;
}
