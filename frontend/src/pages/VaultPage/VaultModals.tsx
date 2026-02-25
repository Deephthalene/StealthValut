import { Folder, Loader2 } from 'lucide-react';
import type { FileItem, FolderItem } from './types';

interface VaultModalsProps {
  showProgress: boolean;
  uploading: boolean;
  uploadProgress: { current: number; total: number } | null;
  deleteTarget: { type: 'file' | 'folder'; id: string; name: string } | null;
  setDeleteTarget: (v: null) => void;
  onDeleteConfirm: () => Promise<void>;
  movingFile: FileItem | null;
  setMovingFile: (v: FileItem | null) => void;
  allFolders: FolderItem[];
  selectedFolderId: string | null;
  onMoveFile: (targetFolderId: string | null) => void;
}

export default function VaultModals({
  showProgress,
  uploading,
  uploadProgress,
  deleteTarget,
  setDeleteTarget,
  onDeleteConfirm,
  movingFile,
  setMovingFile,
  allFolders,
  selectedFolderId,
  onMoveFile,
}: VaultModalsProps) {
  return (
    <>
      {showProgress && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
          <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-lg bg-card border shadow-lg">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm font-medium">
              {uploading
                ? uploadProgress
                  ? `업로드 중... ${uploadProgress.current}/${uploadProgress.total}`
                  : '처리 중...'
                : '내보내는 중...'}
            </p>
            {uploadProgress && (
              <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold mb-2">삭제 확인</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">
                {deleteTarget.name}
              </span>
              을(를) 정말 삭제하시겠습니까?
              {deleteTarget.type === 'file' && (
                <span className="block mt-1 text-rose-400">
                  이 작업은 되돌릴 수 없습니다.
                </span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent"
                onClick={() => setDeleteTarget(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm bg-rose-600 text-white hover:bg-rose-700"
                onClick={async () => {
                  await onDeleteConfirm();
                  setDeleteTarget(null);
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {movingFile && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold mb-3">폴더 이동</h3>
            <p className="text-sm text-muted-foreground mb-3">
              <span className="font-medium text-foreground">
                {movingFile.original_name}
              </span>
              을(를) 어디로 이동할까요?
            </p>
            <div className="max-h-60 overflow-auto border rounded-lg mb-4">
              <button
                type="button"
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left ${
                  !selectedFolderId ? 'font-medium' : ''
                }`}
                onClick={() => onMoveFile(null)}
              >
                <Folder size={16} className="text-amber-500" />내 드라이브
                (루트)
              </button>
              {allFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left ${
                    f.id === selectedFolderId ? 'opacity-40' : ''
                  }`}
                  disabled={f.id === selectedFolderId}
                  onClick={() => onMoveFile(f.id)}
                >
                  <Folder size={16} className="text-amber-500" />
                  {f.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent"
                onClick={() => setMovingFile(null)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
