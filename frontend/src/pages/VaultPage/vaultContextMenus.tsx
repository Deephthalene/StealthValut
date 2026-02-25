import type { MenuItem } from '@/components/molecules/ContextMenu/ContextMenu';
import {
  Archive,
  ArrowUpFromLine,
  Edit3,
  FileText,
  Folder,
  FolderSymlink,
  Trash2,
} from 'lucide-react';
import type { FileItem, FolderItem } from './types';

const ARCHIVE_EXTS = ['zip', '7z', 'rar', 'tar', 'gz', 'bz2'];
function isArchive(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ARCHIVE_EXTS.includes(ext);
}

export interface FileMenuHandlers {
  onOpen: (file: FileItem) => void;
  onExtractArchive: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onMove: (file: FileItem) => void;
  onExport: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
}

export interface FolderMenuHandlers {
  onOpen: (folder: FolderItem) => void;
  onRename: (folder: FolderItem) => void;
  onExport: (folder: FolderItem) => void;
  onDelete: (folder: FolderItem) => void;
}

export function buildFileMenu(file: FileItem, h: FileMenuHandlers): MenuItem[] {
  const items: MenuItem[] = [];
  if (['image', 'audio', 'video', 'document'].includes(file.file_kind)) {
    items.push({
      label: '열기',
      icon: <FileText size={14} />,
      onClick: () => h.onOpen(file),
    });
  }
  if (isArchive(file.original_name)) {
    items.push({
      label: '여기에 압축 해제',
      icon: <Archive size={14} />,
      onClick: () => h.onExtractArchive(file),
    });
  }
  items.push(
    {
      label: '이름 변경',
      icon: <Edit3 size={14} />,
      onClick: () => h.onRename(file),
    },
    {
      label: '폴더 이동',
      icon: <FolderSymlink size={14} />,
      onClick: () => h.onMove(file),
    },
    {
      label: '내보내기',
      icon: <ArrowUpFromLine size={14} />,
      onClick: () => h.onExport(file),
      divider: true,
    },
    {
      label: '삭제',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => h.onDelete(file),
    },
  );
  return items;
}

export function buildFolderMenu(
  folder: FolderItem,
  h: FolderMenuHandlers,
): MenuItem[] {
  return [
    {
      label: '열기',
      icon: <Folder size={14} />,
      onClick: () => h.onOpen(folder),
    },
    {
      label: '이름 변경',
      icon: <Edit3 size={14} />,
      onClick: () => h.onRename(folder),
    },
    {
      label: '내보내기',
      icon: <ArrowUpFromLine size={14} />,
      onClick: () => h.onExport(folder),
      divider: true,
    },
    {
      label: '삭제',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => h.onDelete(folder),
    },
  ];
}
