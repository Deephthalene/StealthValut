import {
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  MoreVertical,
} from 'lucide-react';
import type { FileItem } from './types';

export interface VaultFileCardProps {
  file: FileItem;
  allFiles: FileItem[];
  selected: boolean;
  selectedCount: number;
  renamingId: string | null;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onSelect: (id: string, add: boolean) => void;
  onClick: (e: React.MouseEvent, file: FileItem, list: FileItem[]) => void;
  onContextMenu: (e: React.MouseEvent, file: FileItem) => void;
  onContextMenuMore: (
    file: FileItem,
    rect: { right: number; bottom: number },
  ) => void;
  onPointerDownForDrag: (
    file: FileItem,
    clientX: number,
    clientY: number,
  ) => void;
  lastClickedRef: React.MutableRefObject<string | null>;
}

export default function VaultFileCard({
  file,
  allFiles,
  selected,
  selectedCount,
  renamingId,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onSelect,
  onClick,
  onContextMenu,
  onContextMenuMore,
  onPointerDownForDrag,
  lastClickedRef,
}: VaultFileCardProps) {
  const Icon =
    file.file_kind === 'image'
      ? FileImage
      : file.file_kind === 'video'
        ? FileVideo
        : file.file_kind === 'audio'
          ? FileAudio
          : file.file_kind === 'document'
            ? FileText
            : File;
  const iconColor =
    file.file_kind === 'image'
      ? 'text-emerald-500'
      : file.file_kind === 'video'
        ? 'text-rose-500'
        : file.file_kind === 'audio'
          ? 'text-violet-500'
          : file.file_kind === 'document'
            ? 'text-amber-500'
            : 'text-sky-500';
  const sizeLabel =
    file.size_bytes >= 1048576
      ? `${(file.size_bytes / 1048576).toFixed(1)} MB`
      : `${(file.size_bytes / 1024).toFixed(1)} KB`;

  return (
    <div
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (renamingId === file.id) return;
        onPointerDownForDrag(file, e.clientX, e.clientY);
      }}
      onClick={(e) => onClick(e, file, allFiles)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, file);
      }}
      className={`group relative flex flex-col rounded-xl border transition-all overflow-hidden cursor-pointer ${
        selected
          ? 'border-primary ring-2 ring-primary/30 shadow-md'
          : 'border-border hover:border-primary/30 hover:shadow-md'
      }`}
    >
      <div className="relative aspect-square bg-accent/20 flex items-center justify-center overflow-hidden">
        {file.thumbnail_base64 ? (
          <img
            src={`data:image/jpeg;base64,${file.thumbnail_base64}`}
            alt=""
            draggable={false}
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <Icon size={48} className={iconColor} />
        )}
        <div
          className={`absolute top-2 left-2 transition-opacity ${
            selectedCount > 0 || selected
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(file.id, !selected);
              lastClickedRef.current = file.id;
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
                  d="M2.5 6L5 8.5L9.5 3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
        <div
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.target as HTMLElement).getBoundingClientRect();
              onContextMenuMore(file, {
                right: rect.right,
                bottom: rect.bottom,
              });
            }}
            className="w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
          >
            <MoreVertical size={14} />
          </button>
        </div>
      </div>
      <div className="px-2.5 py-2">
        {renamingId === file.id ? (
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
          <>
            <p
              className="text-sm font-medium truncate"
              title={file.original_name}
            >
              {file.original_name}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{sizeLabel}</p>
          </>
        )}
      </div>
    </div>
  );
}
