import {
  ALERT_TITLE,
  type AlertTitle,
  type AlertType,
} from '@/components/molecules';
import { create } from 'zustand';

export interface AlertDialogConfig {
  title?: AlertTitle | string;
  type?: AlertType;
  description: string;
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

const typeToTitle: Record<AlertType, AlertTitle> = {
  success: ALERT_TITLE.SUCCESS,
  error: ALERT_TITLE.ERROR,
  info: ALERT_TITLE.INFO,
  warning: ALERT_TITLE.WARNING,
};

interface AlertDialogState {
  open: boolean;
  config: AlertDialogConfig | null;
  showAlert: (config: AlertDialogConfig) => void;
  hideAlert: () => void;
  setOpen: (open: boolean) => void;
}

export const useAlertDialogStore = create<AlertDialogState>((set) => ({
  open: false,
  config: null,
  showAlert: (config) => set({ open: true, config }),
  hideAlert: () => set({ open: false, config: null }),
  setOpen: (open) => set({ open }),
}));

export const alertDialog = {
  show: (
    type: AlertType,
    description: string,
    options?: {
      onConfirm?: () => void | Promise<void>;
      confirmText?: string;
      cancelText?: string;
      showCancel?: boolean;
    },
  ) => {
    useAlertDialogStore.getState().showAlert({
      type,
      title: typeToTitle[type],
      description,
      showCancel: options?.showCancel ?? false,
      confirmText: options?.confirmText,
      cancelText: options?.cancelText,
      onConfirm: options?.onConfirm,
    });
  },
  success: (description: string, onConfirm?: () => void | Promise<void>) => {
    useAlertDialogStore.getState().showAlert({
      type: 'success',
      title: ALERT_TITLE.SUCCESS,
      description,
      showCancel: false,
      onConfirm,
    });
  },
  error: (description: string, onConfirm?: () => void | Promise<void>) => {
    useAlertDialogStore.getState().showAlert({
      type: 'error',
      title: ALERT_TITLE.ERROR,
      description,
      showCancel: false,
      onConfirm,
    });
  },
  info: (description: string, onConfirm?: () => void | Promise<void>) => {
    useAlertDialogStore.getState().showAlert({
      type: 'info',
      title: ALERT_TITLE.INFO,
      description,
      showCancel: false,
      onConfirm,
    });
  },
  warning: (description: string, onConfirm?: () => void | Promise<void>) => {
    useAlertDialogStore.getState().showAlert({
      type: 'warning',
      title: ALERT_TITLE.WARNING,
      description,
      showCancel: false,
      onConfirm,
    });
  },
  confirm: (
    description: string,
    onConfirm: () => void | Promise<void>,
    options?: {
      type?: AlertType;
      confirmText?: string;
      cancelText?: string;
      destructive?: boolean;
    },
  ) => {
    const type = options?.type || 'warning';
    useAlertDialogStore.getState().showAlert({
      type,
      title: typeToTitle[type],
      description,
      confirmText: options?.confirmText || '확인',
      cancelText: options?.cancelText || '취소',
      showCancel: true,
      confirmVariant: options?.destructive ? 'destructive' : 'default',
      onConfirm,
    });
  },
  custom: (config: AlertDialogConfig) => {
    const finalConfig: AlertDialogConfig = {
      ...config,
      title:
        config.title ||
        (config.type ? typeToTitle[config.type] : ALERT_TITLE.ALERT),
    };
    useAlertDialogStore.getState().showAlert(finalConfig);
  },
};
