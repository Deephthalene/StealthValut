import { create } from 'zustand';

interface VaultFolderState {
  selectedFolderId: string | null;
  setSelectedFolderId: (id: string | null) => void;
}

export const useVaultFolderStore = create<VaultFolderState>((set) => ({
  selectedFolderId: null,
  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
}));
