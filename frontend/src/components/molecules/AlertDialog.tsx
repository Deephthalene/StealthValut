export type AlertType = 'success' | 'error' | 'info' | 'warning';
export type AlertTitle = 'SUCCESS' | 'ERROR' | 'INFO' | 'WARNING' | 'ALERT';

export const ALERT_TITLE: Record<Exclude<AlertTitle, 'ALERT'>, AlertTitle> & {
  ALERT: AlertTitle;
} = {
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ALERT: 'ALERT',
};

interface AlertDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string | AlertTitle;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  confirmVariant?:
    | 'default'
    | 'destructive'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'link';
  showCancel?: boolean;
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '확인',
  cancelText = '취소',
  onConfirm,
  onCancel,
  showCancel = false,
  confirmVariant = 'default',
}: AlertDialogProps) {
  if (!open) return null;

  const handleClose = (val = false) => {
    onOpenChange?.(val);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => handleClose(false)}
      />
      <div className="relative bg-card border rounded-xl shadow-2xl p-6 w-[90%] max-w-sm mx-4">
        {title && <h3 className="text-base font-semibold mb-2">{title}</h3>}
        {description && (
          <p className="text-sm text-muted-foreground mb-4">{description}</p>
        )}
        <div className="flex justify-end gap-2">
          {showCancel && (
            <button
              className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent"
              onClick={() => {
                onCancel?.();
                handleClose(false);
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            className={
              confirmVariant === 'destructive'
                ? 'px-4 py-2 rounded-lg text-sm bg-rose-600 text-white hover:bg-rose-700'
                : 'px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground'
            }
            onClick={async () => {
              await onConfirm?.();
              handleClose(false);
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AlertDialog;
