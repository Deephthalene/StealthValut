import { ReactNode } from 'react';
import { create } from 'zustand';

export interface LayerDialogItem {
  id: string;
  title?: string;
  content: ReactNode;
  closable?: boolean;
  onClose?: () => void;
  className?: string;
  overlayClassName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
}

interface LayerDialogState {
  dialogs: LayerDialogItem[];
  openDialog: (config: Omit<LayerDialogItem, 'id'>) => string;
  closeDialog: (id: string) => void;
  closeAll: () => void;
  closeById: (id: string) => void;
}

export const useLayerDialogStore = create<LayerDialogState>((set) => ({
  dialogs: [],

  openDialog: (config) => {
    const id = `layer-dialog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newDialog: LayerDialogItem = {
      ...config,
      id,
      closable: config.closable === true,
      showCloseButton: config.showCloseButton !== false,
    };
    set((state) => ({ dialogs: [...state.dialogs, newDialog] }));
    return id;
  },

  closeDialog: (id) => {
    set((state) => {
      const dialog = state.dialogs.find((d) => d.id === id);
      if (dialog?.onClose) dialog.onClose();
      return { dialogs: state.dialogs.filter((d) => d.id !== id) };
    });
  },

  closeAll: () => {
    set((state) => {
      state.dialogs.forEach((d) => d.onClose?.());
      return { dialogs: [] };
    });
  },

  closeById: (id) => {
    useLayerDialogStore.getState().closeDialog(id);
  },
}));

export const layerDialog = {
  open: (config: Omit<LayerDialogItem, 'id'>): string =>
    useLayerDialogStore.getState().openDialog(config),
  close: (id: string): void => useLayerDialogStore.getState().closeDialog(id),
  closeAll: (): void => useLayerDialogStore.getState().closeAll(),
  getCount: (): number => useLayerDialogStore.getState().dialogs.length,
  isOpen: (id: string): boolean =>
    useLayerDialogStore.getState().dialogs.some((d) => d.id === id),
};
