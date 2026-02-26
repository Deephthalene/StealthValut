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
① 본 서비스는 사용자의 기기(로컬 환경) 내에서만 작동하는 단독형(Standalone) 소프트웨어입니다.
② 개발자는 사용자의 데이터를 별도의 서버로 전송, 저장, 열람하지 않는 '제로 지식(Zero-Knowledge)' 아키텍처를 준수합니다.
③ 서비스 내 모든 암호화 키는 사용자의 비밀번호를 기반으로 로컬에서 생성되며, 개발자는 어떠한 경우에도 사용자의 비밀번호, 복구 키 또는 암호화된 데이터에 접근할 수 없습니다.

제3조 (사용자의 의무 및 책임)
① 비밀번호 관리: 사용자는 자신의 비밀번호 및 복구 키를 관리할 전적인 책임이 있습니다. 개발자는 비밀번호 분실 시 이를 복구하거나 재설정할 수 있는 어떠한 기술적 수단도 보유하고 있지 않습니다.
② 콘텐츠 적법성: 사용자는 서비스를 통해 보관하는 모든 파일이 대한민국 및 사용자 거주 국가의 관련 법령을 위반하지 않도록 할 책임이 있습니다. 이는 아래의 법령을 포함하나 이에 한정되지 않습니다.

저작권법
아동·청소년의 성보호에 관한 법률
성폭력범죄의 처벌 등에 관한 특례법
정보통신망 이용촉진 및 정보보호 등에 관한 법률

③ 금지 행위: 사용자는 다음 각 호의 행위를 하여서는 안 됩니다.

아동·청소년 성착취물(CSAM) 등 불법 콘텐츠를 저장, 보관 또는 유통하는 행위
타인의 동의 없이 촬영된 불법 촬영물을 저장, 보관 또는 유통하는 행위
저작권자의 허락 없이 취득한 불법 복제물을 저장 또는 유통하는 행위
수사 기관의 정당한 법 집행을 방해할 목적으로 서비스를 이용하는 행위
서비스를 타인에게 재판매하거나 상업적으로 무단 이용하는 행위
서비스의 라이선스 키를 위조, 변조 또는 무단으로 공유하는 행위


제4조 (법 집행 기관 협조)
① 개발자는 서버를 운영하지 않아 사용자의 데이터에 기술적으로 접근할 수 없습니다.
② 다만, 개발자는 관련 법령에 따른 수사 기관의 적법한 요청이 있을 경우 보유 중인 범위 내에서 성실히 협조합니다.
③ 개발자는 불법 콘텐츠의 유통을 조장하거나 묵인하지 않으며, 관련 신고 접수 시 적극적으로 대응합니다.

불법 콘텐츠 신고 연락처: [추후 기재]


제5조 (유료 서비스 및 라이선스)
① 본 서비스는 기본적으로 5GB의 로컬 암호화 저장 공간을 무료로 제공합니다.
② 추가 용량(Quota) 확장을 원하는 사용자는 정해진 비용을 지불하고 라이선스 키를 구매하여야 합니다.
③ 라이선스 키는 로컬 앱에 등록되는 즉시 효력이 발생합니다.
④ 디지털 상품의 특성상 라이선스 키가 앱에 등록(사용)된 이후에는 환불이 제한될 수 있습니다. 단, 서비스의 중대한 결함으로 인한 경우에는 개발자의 판단에 따라 예외적으로 환불을 처리할 수 있습니다.
⑤ 라이선스 키의 판매 플랫폼 및 가격 정책은 [추후 기재]에 따릅니다.

제6조 (면책 조항)
① 데이터 손실: 하드웨어 고장, 비밀번호 및 복구 키 분실, 운영체제 오류, 사용자 과실 등으로 인해 발생한 데이터 손실에 대해 개발자는 어떠한 보상 책임도 지지 않습니다.
② 보안 한계: 본 서비스는 강력한 암호화 기술을 사용하나, 사용자 기기 자체의 보안 취약점, 악성 소프트웨어, 물리적 접근 등으로 인한 보안 침해에 대해서는 책임을 지지 않습니다.
③ 콘텐츠 책임: 개발자는 제로 지식 아키텍처 특성상 사용자가 서비스 내에 보관한 콘텐츠의 내용을 열람하거나 통제할 수 없습니다. 이에 따라 사용자가 보관한 콘텐츠와 관련된 모든 민·형사상 책임은 전적으로 사용자 본인에게 있습니다.
④ 운영체제 호환성: 운영체제 업데이트로 인한 호환성 문제가 발생할 수 있으며, 개발자는 이에 대한 업데이트 제공 의무를 보장하지 않습니다.

제7조 (서비스 변경 및 종료)
① 개발자는 서버를 운영하지 않으므로 사용자는 구매한 버전을 영구적으로 사용할 수 있습니다.
② 개발자는 서비스의 내용, 기능, 약관 등을 사전 고지 없이 변경할 수 있으며, 변경된 약관은 배포 플랫폼 또는 앱 내 공지를 통해 효력이 발생합니다.
③ 서비스가 종료되더라도 사용자가 이미 보유한 버전의 사용 권한은 유지됩니다.

제8조 (지식재산권)
① 서비스의 소프트웨어, 디자인, 상표 등 일체의 지식재산권은 개발자에게 귀속됩니다.
② 사용자는 서비스를 역공학(Reverse Engineering), 디컴파일, 소스코드 추출 등의 방법으로 분석하거나, 이를 기반으로 파생 소프트웨어를 제작하여서는 안 됩니다.

제9조 (준거법 및 관할)
① 본 약관은 대한민국 법률에 따라 해석되고 적용됩니다.
② 본 서비스 이용과 관련하여 분쟁이 발생할 경우, 개발자의 주소지를 관할하는 법원을 제1심 관할 법원으로 합니다.`;

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

  const handleAgreeAndComplete = async () => {
    if (!termsAgreed) return;
    setStep('done');
    if (isTauriEnv() && password) {
      try {
        await invoke('vault_cache_key', { password });
      } catch {
        // DEK 캐시 실패 시에도 진행 (재로그인 필요할 수 있음)
      }
    }
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
