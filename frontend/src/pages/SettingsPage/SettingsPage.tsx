import { AUTO_LOCK_OPTIONS, useSettingsStore } from '@/stores/useSettingsStore';
import { Crown, Keyboard, Timer } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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

      <div className="flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2 text-sm">
          <Crown size={15} className="text-muted-foreground" />
          프리미엄
        </span>
        <button className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          업그레이드
        </button>
      </div>
    </div>
  );
}
