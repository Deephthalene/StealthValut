import { create } from 'zustand';

interface UploadProgress {
    current: number;
    total: number;
}

interface UploadState {
    isUploading: boolean;
    uploadProgress: UploadProgress | null;
    uploadError: string;

    startUpload: (total: number) => void;
    updateProgress: (current: number) => void;
    setError: (error: string) => void;
    finishUpload: () => void;
}

export const useUploadStore = create<UploadState>((set) => ({
    isUploading: false,
    uploadProgress: null,
    uploadError: '',

    startUpload: (total: number) =>
        set({
            isUploading: true,
            uploadProgress: { current: 0, total },
            uploadError: '',
        }),
    updateProgress: (current: number) =>
        set((state) => ({
            uploadProgress: state.uploadProgress
                ? { ...state.uploadProgress, current }
                : null,
        })),
    setError: (error: string) => set({ uploadError: error }),
    finishUpload: () =>
        set({
            isUploading: false,
            uploadProgress: null,
        }),
}));
