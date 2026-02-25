import { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  onClick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (x + rect.width > vw) el.style.left = `${vw - rect.width - 8}px`;
    if (y + rect.height > vh) el.style.top = `${vh - rect.height - 8}px`;
  }, [x, y]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-[180px] py-1 rounded-lg bg-popover border border-border shadow-xl animate-in fade-in zoom-in-95 duration-100"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.divider && <div className="my-1 border-t border-border" />}
          <button
            type="button"
            disabled={item.disabled}
            className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              item.danger
                ? 'text-rose-400 hover:bg-rose-500/10'
                : 'text-foreground hover:bg-accent'
            }`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.icon && (
              <span className="shrink-0 w-4 h-4 flex items-center justify-center opacity-70">
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
