import type { LayerDialogItem } from '@/stores/useLayerDialogStore';
import { X } from 'lucide-react';

interface LayerDialogProps {
  item: LayerDialogItem;
  zIndex: number;
  onClose: () => void;
}

export function LayerDialog({ item, zIndex, onClose }: LayerDialogProps) {
  const sizeClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full',
  };
  const sizeClass = sizeClasses[item.size || 'md'] || sizeClasses.md;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center ${item.overlayClassName || 'bg-black/40'}`}
      style={{ zIndex }}
      onClick={item.closable ? onClose : undefined}
    >
      <div
        className={`bg-white dark:bg-slate-900 rounded-lg shadow-xl w-[90%] ${sizeClass} ${item.className || ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold">{item.title}</h2>
          {item.showCloseButton && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-accent rounded-md transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {item.content}
        </div>
      </div>
    </div>
  );
}

export default LayerDialog;
