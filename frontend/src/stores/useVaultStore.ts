import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface VaultState {
  isUnlocked: boolean;
  isInitialized: boolean;
  unlock: () => void;
  lock: () => void;
  setInitialized: (v: boolean) => void;
}

export const useVaultStore = create<VaultState>()(
  persist(
    (set) => ({
      isUnlocked: false,
      isInitialized: false,
      unlock: () => set({ isUnlocked: true }),
      lock: () => set({ isUnlocked: false }),
      setInitialized: (v) => set({ isInitialized: v }),
    }),
    { name: 'vault-storage' },
  ),
);
