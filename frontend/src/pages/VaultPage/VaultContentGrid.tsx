import VaultFileCard from './VaultFileCard';
import VaultFolderCard from './VaultFolderCard';
import type { FileItem, FolderItem } from './types';

export interface VaultContentGridProps {
  sortedFolders: FolderItem[];
  sortedFiles: FileItem[];
  selectedFolderIds: Set<string>;
  selectedFileIds: Set<string>;
  totalSelected: number;
  dragOverFolderId: string | null;
  renamingFolderId: string | null;
  renamingFileId: string | null;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameFolderSubmit: () => void;
  onRenameFolderCancel: () => void;
  onRenameFileSubmit: () => void;
  onRenameFileCancel: () => void;
  onFolderSelect: (id: string, add: boolean) => void;
  onFileSelect: (id: string, add: boolean) => void;
  onFolderClick: (
    e: React.MouseEvent,
    folder: FolderItem,
    siblings: FolderItem[],
  ) => void;
  onFileClick: (e: React.MouseEvent, file: FileItem, list: FileItem[]) => void;
  onFolderContextMenu: (e: React.MouseEvent, folder: FolderItem) => void;
  onFileContextMenu: (e: React.MouseEvent, file: FileItem) => void;
  onFileContextMenuMore: (
    file: FileItem,
    rect: { right: number; bottom: number },
  ) => void;
  onFolderDragOver: (e: React.DragEvent, folderId: string) => void;
  onFolderDragLeave: () => void;
  onFolderDrop: (e: React.DragEvent, folderId: string) => void;
  onFileDragStart: (e: React.DragEvent, file: FileItem) => void;
  onFileDragEnd: () => void;
  lastClickedFileRef: React.MutableRefObject<string | null>;
}

export default function VaultContentGrid({
  sortedFolders,
  sortedFiles,
  selectedFolderIds,
  selectedFileIds,
  totalSelected,
  dragOverFolderId,
  renamingFolderId,
  renamingFileId,
  renameValue,
  onRenameChange,
  onRenameFolderSubmit,
  onRenameFolderCancel,
  onRenameFileSubmit,
  onRenameFileCancel,
  onFolderSelect,
  onFileSelect,
  onFolderClick,
  onFileClick,
  onFolderContextMenu,
  onFileContextMenu,
  onFileContextMenuMore,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
  onFileDragStart,
  onFileDragEnd,
  lastClickedFileRef,
}: VaultContentGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {sortedFolders.map((f) => (
        <VaultFolderCard
          key={f.id}
          folder={f}
          selected={selectedFolderIds.has(f.id)}
          dragOver={dragOverFolderId === f.id}
          totalSelected={totalSelected}
          renamingId={renamingFolderId}
          renameValue={renameValue}
          onRenameChange={onRenameChange}
          onRenameSubmit={onRenameFolderSubmit}
          onRenameCancel={onRenameFolderCancel}
          onSelect={onFolderSelect}
          onClick={onFolderClick}
          onContextMenu={onFolderContextMenu}
          onDragOver={onFolderDragOver}
          onDragLeave={onFolderDragLeave}
          onDrop={onFolderDrop}
          siblings={sortedFolders}
        />
      ))}
      {sortedFiles.map((file) => (
        <VaultFileCard
          key={file.id}
          file={file}
          allFiles={sortedFiles}
          selected={selectedFileIds.has(file.id)}
          selectedCount={selectedFileIds.size}
          renamingId={renamingFileId}
          renameValue={renameValue}
          onRenameChange={onRenameChange}
          onRenameSubmit={onRenameFileSubmit}
          onRenameCancel={onRenameFileCancel}
          onSelect={onFileSelect}
          onClick={onFileClick}
          onContextMenu={onFileContextMenu}
          onContextMenuMore={onFileContextMenuMore}
          onDragStart={onFileDragStart}
          onDragEnd={onFileDragEnd}
          lastClickedRef={lastClickedFileRef}
        />
      ))}
    </div>
  );
}
