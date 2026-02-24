import { ALERT_TITLE, AlertDialog } from '@/components/molecules';
import { useAlertDialogStore } from '@/stores/useAlertDialogStore';

const typeToTitle = {
  success: ALERT_TITLE.SUCCESS,
  error: ALERT_TITLE.ERROR,
  info: ALERT_TITLE.INFO,
  warning: ALERT_TITLE.WARNING,
};

function GlobalAlertDialog() {
  const { open, config, setOpen } = useAlertDialogStore();

  if (!config) return null;

  const title =
    config.title ||
    (config.type
      ? typeToTitle[config.type as keyof typeof typeToTitle]
      : ALERT_TITLE.ALERT);

  return (
    <AlertDialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={config.description}
      confirmText={config.confirmText}
      cancelText={config.cancelText}
      onConfirm={config.onConfirm}
      onCancel={config.onCancel}
      confirmVariant={config.confirmVariant}
      showCancel={config.showCancel ?? false}
    />
  );
}

export default GlobalAlertDialog;
