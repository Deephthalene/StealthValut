import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useState } from 'react';
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
  onFilePointerDownForDrag: (
    file: FileItem,
    clientX: number,
    clientY: number,
  ) => void;
  onFolderPointerDownForDrag: (
    folder: FolderItem,
    clientX: number,
    clientY: number,
  ) => void;
  lastClickedFileRef: React.MutableRefObject<string | null>;
  scrollParentRef: React.RefObject<HTMLDivElement>;
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
  onFilePointerDownForDrag,
  onFolderPointerDownForDrag,
  lastClickedFileRef,
  scrollParentRef,
}: VaultContentGridProps) {
  const allItems: Array<
    { kind: 'folder'; folder: FolderItem } | { kind: 'file'; file: FileItem }
  > = [
    ...sortedFolders.map((folder) => ({ kind: 'folder' as const, folder })),
    ...sortedFiles.map((file) => ({ kind: 'file' as const, file })),
  ];

  const [columnCount, setColumnCount] = useState(2);

  useEffect(() => {
    const updateColumns = () => {
      const width =
        scrollParentRef.current?.clientWidth ?? window.innerWidth ?? 0;
      let cols = 2;
      if (width >= 1280) cols = 6;
      else if (width >= 1024) cols = 5;
      else if (width >= 768) cols = 4;
      else if (width >= 640) cols = 3;
      setColumnCount(cols);
    };
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [scrollParentRef]);

  const rowCount =
    columnCount > 0 ? Math.ceil(allItems.length / columnCount) : 0;

  const ROW_HEIGHT = 280;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualRows.map((row) => {
        const startIndex = row.index * columnCount;
        const rowItems = allItems.slice(startIndex, startIndex + columnCount);
        if (rowItems.length === 0) return null;

        return (
          <div
            key={row.key}
            className="absolute left-0 right-0"
            style={{
              transform: `translateY(${row.start}px)`,
              height: ROW_HEIGHT,
            }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {rowItems.map((item) =>
                item.kind === 'folder' ? (
                  <VaultFolderCard
                    key={item.folder.id}
                    folder={item.folder}
                    selected={selectedFolderIds.has(item.folder.id)}
                    dragOver={dragOverFolderId === item.folder.id}
                    totalSelected={totalSelected}
                    renamingId={renamingFolderId}
                    renameValue={renameValue}
                    onRenameChange={onRenameChange}
                    onRenameSubmit={onRenameFolderSubmit}
                    onRenameCancel={onRenameFolderCancel}
                    onSelect={onFolderSelect}
                    onClick={onFolderClick}
                    onContextMenu={onFolderContextMenu}
                    onPointerDownForDrag={onFolderPointerDownForDrag}
                    siblings={sortedFolders}
                  />
                ) : (
                  <VaultFileCard
                    key={item.file.id}
                    file={item.file}
                    allFiles={sortedFiles}
                    selected={selectedFileIds.has(item.file.id)}
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
                    onPointerDownForDrag={onFilePointerDownForDrag}
                    lastClickedRef={lastClickedFileRef}
                  />
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
