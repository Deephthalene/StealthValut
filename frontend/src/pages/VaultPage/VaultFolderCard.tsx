import { Folder, MoreVertical } from 'lucide-react';
import type { FolderItem } from './types';

export interface VaultFolderCardProps {
  folder: FolderItem;
  selected: boolean;
  dragOver: boolean;
  totalSelected: number;
  renamingId: string | null;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onSelect: (id: string, add: boolean) => void;
  onClick: (
    e: React.MouseEvent,
    folder: FolderItem,
    siblings: FolderItem[],
  ) => void;
  onContextMenu: (e: React.MouseEvent, folder: FolderItem) => void;
  onDragOver: (e: React.DragEvent, folderId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, folderId: string) => void;
  siblings: FolderItem[];
}

export default function VaultFolderCard({
  folder,
  selected,
  dragOver,
  totalSelected,
  renamingId,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onSelect,
  onClick,
  onContextMenu,
  onDragOver,
  onDragLeave,
  onDrop,
  siblings,
}: VaultFolderCardProps) {
  return (
    <div
      className={`group relative flex flex-col rounded-xl border transition-all text-left w-full overflow-hidden cursor-pointer ${
        selected
          ? 'border-primary ring-2 ring-primary/30 shadow-md'
          : dragOver
            ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
            : 'border-border hover:border-primary/30 hover:shadow-md'
      }`}
      onClick={(e) => onClick(e, folder, siblings)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, folder);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOver(e, folder.id);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, folder.id)}
    >
      <div className="relative flex items-center justify-center aspect-square bg-accent/30 group-hover:bg-accent/50 transition-colors">
        <Folder size={48} className="text-amber-500" />
        <div
          className={`absolute top-2 left-2 transition-opacity ${
            totalSelected > 0 || selected
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(folder.id, !selected);
            }}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              selected
                ? 'bg-primary border-primary text-primary-foreground'
                : 'bg-background/80 border-border backdrop-blur-sm hover:border-primary'
            }`}
          >
            {selected && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6l3 3 5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
        <button
          type="button"
          className="absolute top-2 right-2 p-1 rounded-md bg-background/80 backdrop-blur-sm border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onContextMenu(
              { clientX: rect.right, clientY: rect.bottom } as React.MouseEvent,
              folder,
            );
          }}
        >
          <MoreVertical size={14} />
        </button>
      </div>
      <div className="px-3 py-2.5">
        {renamingId === folder.id ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            className="w-full py-0.5 px-1 rounded border border-input bg-background text-sm"
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') onRenameSubmit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            onBlur={onRenameSubmit}
          />
        ) : (
          <p className="text-sm font-medium truncate" title={folder.name}>
            {folder.name}
          </p>
        )}
      </div>
    </div>
  );
}
