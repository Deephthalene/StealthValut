import { Folder, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FileItem, FolderItem } from './types';

interface VaultModalsProps {
  showProgress: boolean;
  uploading: boolean;
  uploadProgress: { current: number; total: number } | null;
  exportProgress: { current: number; total: number } | null;
  deleteTarget: { type: 'file' | 'folder'; id: string; name: string } | null;
  setDeleteTarget: (v: null) => void;
  onDeleteConfirm: () => Promise<void>;
  movingFile: FileItem | null;
  setMovingFile: (v: FileItem | null) => void;
  bulkMoveItems: { fileIds: string[]; folderIds: string[] } | null;
  setBulkMoveItems: (v: null) => void;
  allFolders: FolderItem[];
  selectedFolderId: string | null;
  onMoveFile: (targetFolderId: string | null) => void;
  onBulkMove: (targetFolderId: string | null) => Promise<void>;
}

export default function VaultModals({
  showProgress,
  uploading,
  uploadProgress,
  exportProgress,
  deleteTarget,
  setDeleteTarget,
  onDeleteConfirm,
  movingFile,
  setMovingFile,
  bulkMoveItems,
  setBulkMoveItems,
  allFolders,
  selectedFolderId,
  onMoveFile,
  onBulkMove,
}: VaultModalsProps) {
  const { t } = useTranslation();
  return (
    <>
      {showProgress && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
          <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-lg bg-card border shadow-lg">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm font-medium">
              {uploadProgress
                ? t('vaultModals.uploadingProgress', {
                    current: uploadProgress.current,
                    total: uploadProgress.total,
                  })
                : exportProgress
                  ? t('vaultModals.exportingProgress', {
                      current: exportProgress.current,
                      total: exportProgress.total,
                    })
                  : uploading
                    ? t('vaultModals.processing')
                    : t('vaultModals.exporting')}
            </p>
            {(uploadProgress || exportProgress) && (
              <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${((uploadProgress ?? exportProgress)!.current / (uploadProgress ?? exportProgress)!.total) * 100}%`,
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
            <h3 className="text-base font-semibold mb-2">
              {t('vaultModals.deleteConfirm')}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {deleteTarget.type === 'folder' ? (
                t('vaultModals.deleteFolderDesc', { name: deleteTarget.name })
              ) : (
                <>
                  {t('vaultModals.deleteFileDesc', { name: deleteTarget.name })}
                  <span className="block mt-1 text-rose-400">
                    {t('vaultModals.cannotUndo')}
                  </span>
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent"
                onClick={() => setDeleteTarget(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm bg-rose-600 text-white hover:bg-rose-700"
                onClick={async () => {
                  await onDeleteConfirm();
                  setDeleteTarget(null);
                }}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {(movingFile || bulkMoveItems) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold mb-3">
              {t('vaultModals.moveFolder')}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {movingFile
                ? t('vaultModals.moveFilePrompt', {
                    name: movingFile.original_name,
                  })
                : bulkMoveItems
                  ? t('vaultModals.moveItemsPrompt', {
                      count:
                        bulkMoveItems.fileIds.length +
                        bulkMoveItems.folderIds.length,
                    })
                  : null}
            </p>
            <div className="max-h-60 overflow-auto border rounded-lg mb-4">
              <button
                type="button"
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left ${
                  !selectedFolderId ? 'font-medium' : ''
                }`}
                onClick={() => {
                  if (movingFile) onMoveFile(null);
                  else if (bulkMoveItems) onBulkMove(null);
                }}
              >
                <Folder size={16} className="text-amber-500" />
                {t('vaultModals.myDriveRoot')}
              </button>
              {allFolders.map((f) => {
                const isCurrent = f.id === selectedFolderId;
                const isInSelection =
                  bulkMoveItems && bulkMoveItems.folderIds.includes(f.id);
                const disabled = isCurrent || !!isInSelection;
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left ${
                      disabled ? 'opacity-40' : ''
                    }`}
                    disabled={disabled}
                    title={
                      isInSelection
                        ? t('vaultModals.cannotMoveToSelectedFolder')
                        : undefined
                    }
                    onClick={() => {
                      if (movingFile) onMoveFile(f.id);
                      else if (bulkMoveItems) onBulkMove(f.id);
                    }}
                  >
                    <Folder size={16} className="text-amber-500" />
                    {f.name}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent"
                onClick={() => {
                  setMovingFile(null);
                  setBulkMoveItems(null);
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
