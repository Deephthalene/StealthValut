import { create } from 'zustand';

interface VaultFolderState {
  selectedFolderId: string | null;
  setSelectedFolderId: (id: string | null) => void;
  historyAwareNavigate: ((id: string | null) => void) | null;
  registerHistoryAwareNavigate: (
    fn: ((id: string | null) => void) | null,
  ) => void;
}

export const useVaultFolderStore = create<VaultFolderState>((set) => ({
  selectedFolderId: null,
  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
  historyAwareNavigate: null,
  registerHistoryAwareNavigate: (fn) => set({ historyAwareNavigate: fn }),
}));

/** 폴더 선택 시 사용 — VaultPage 마운트 시 히스토리 반영, 미마운트 시 일반 설정 */
export function useVaultFolderNavigate() {
  const setSelectedFolderId = useVaultFolderStore((s) => s.setSelectedFolderId);
  const historyAwareNavigate = useVaultFolderStore(
    (s) => s.historyAwareNavigate,
  );
  return historyAwareNavigate ?? setSelectedFolderId;
}
