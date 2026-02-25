import ContextMenu, {
  type MenuItem,
} from '@/components/molecules/ContextMenu/ContextMenu';
import AudioPlayer from '@/components/organisms/AudioPlayer/AudioPlayer';
import DocumentViewer from '@/components/organisms/DocumentViewer/DocumentViewer';
import ImageViewer from '@/components/organisms/ImageViewer/ImageViewer';
import { dispatchVaultFilesChanged } from '@/components/organisms/SidebarStorage/SidebarStorage';
import VideoPlayer from '@/components/organisms/VideoPlayer/VideoPlayer';
import { useVaultFolderStore } from '@/stores/useVaultFolderStore';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  Archive,
  ArrowDownAZ,
  ArrowUpFromLine,
  Edit3,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderInput,
  FolderPlus,
  FolderSymlink,
  Loader2,
  MoreVertical,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
}

interface FileItem {
  id: string;
  original_name: string;
  size_bytes: number;
  created_at: number;
  file_kind: 'image' | 'video' | 'audio' | 'document' | 'other';
  thumbnail_base64?: string;
}

const ARCHIVE_EXTS = ['zip', '7z', 'rar', 'tar', 'gz', 'bz2'];
function isArchive(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ARCHIVE_EXTS.includes(ext);
}

function VaultPage() {
  const { selectedFolderId, setSelectedFolderId: rawSetFolder } =
    useVaultFolderStore();

  // Navigation history
  const historyBack = useRef<(string | null)[]>([]);
  const historyForward = useRef<(string | null)[]>([]);
  const isNavRef = useRef(false);

  const setSelectedFolderId = useCallback(
    (id: string | null) => {
      if (isNavRef.current) {
        isNavRef.current = false;
        rawSetFolder(id);
        return;
      }
      historyBack.current.push(selectedFolderId);
      historyForward.current = [];
      rawSetFolder(id);
    },
    [selectedFolderId, rawSetFolder],
  );

  const goBack = useCallback(() => {
    if (historyBack.current.length === 0) return;
    const prev = historyBack.current.pop()!;
    historyForward.current.push(selectedFolderId);
    isNavRef.current = true;
    rawSetFolder(prev);
  }, [selectedFolderId, rawSetFolder]);

  const goForward = useCallback(() => {
    if (historyForward.current.length === 0) return;
    const next = historyForward.current.pop()!;
    historyBack.current.push(selectedFolderId);
    isNavRef.current = true;
    rawSetFolder(next);
  }, [selectedFolderId, rawSetFolder]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, [goBack, goForward]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [allFolders, setAllFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const uploadingRef = useRef(false);
  const [viewerFile, setViewerFile] = useState<FileItem | null>(null);
  const [audioFile, setAudioFile] = useState<FileItem | null>(null);
  const [videoFile, setVideoFile] = useState<FileItem | null>(null);
  const [docFile, setDocFile] = useState<FileItem | null>(null);

  // Multi-select
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(
    new Set(),
  );
  const lastClickedFileRef = useRef<string | null>(null);
  const lastClickedFolderRef = useRef<string | null>(null);

  const handleFileClick = (
    e: React.MouseEvent,
    file: FileItem,
    allFiles: FileItem[],
  ) => {
    if (renamingFileId === file.id) return;

    if (e.ctrlKey || e.metaKey) {
      setSelectedFileIds((prev) => {
        const next = new Set(prev);
        if (next.has(file.id)) next.delete(file.id);
        else next.add(file.id);
        return next;
      });
      lastClickedFileRef.current = file.id;
      return;
    }

    if (e.shiftKey && lastClickedFileRef.current) {
      const ids = allFiles.map((f) => f.id);
      const startIdx = ids.indexOf(lastClickedFileRef.current);
      const endIdx = ids.indexOf(file.id);
      if (startIdx >= 0 && endIdx >= 0) {
        const [lo, hi] =
          startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const rangeIds = ids.slice(lo, hi + 1);
        setSelectedFileIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((id) => next.add(id));
          return next;
        });
      }
      return;
    }

    // No modifier: open viewer or set single selection
    if (selectedFileIds.size > 0) {
      setSelectedFileIds(new Set());
    }

    if (file.file_kind === 'image') setViewerFile(file);
    else if (file.file_kind === 'audio') setAudioFile(file);
    else if (file.file_kind === 'video') setVideoFile(file);
    else if (file.file_kind === 'document') setDocFile(file);
  };

  const handleFolderClick = (
    e: React.MouseEvent,
    folder: FolderItem,
    allFolders: FolderItem[],
  ) => {
    if (renamingFolderId === folder.id) return;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedFolderIds((prev) => {
        const next = new Set(prev);
        if (next.has(folder.id)) next.delete(folder.id);
        else next.add(folder.id);
        return next;
      });
      lastClickedFolderRef.current = folder.id;
      return;
    }

    if (e.shiftKey && lastClickedFolderRef.current) {
      e.preventDefault();
      const ids = allFolders.map((f) => f.id);
      const startIdx = ids.indexOf(lastClickedFolderRef.current);
      const endIdx = ids.indexOf(folder.id);
      if (startIdx >= 0 && endIdx >= 0) {
        const [lo, hi] =
          startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const rangeIds = ids.slice(lo, hi + 1);
        setSelectedFolderIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((id) => next.add(id));
          return next;
        });
      }
      return;
    }

    if (selectedFolderIds.size > 0 || selectedFileIds.size > 0) {
      setSelectedFolderIds(new Set());
      setSelectedFileIds(new Set());
    }
    setSelectedFolderId(folder.id);
  };

  const totalSelected = selectedFileIds.size + selectedFolderIds.size;

  const handleBulkDelete = async () => {
    if (totalSelected === 0) return;
    const fileIds = [...selectedFileIds];
    const folderIds = [...selectedFolderIds];
    try {
      for (const id of fileIds) {
        await invoke('vault_delete_file', { fileId: id });
      }
      for (const id of folderIds) {
        await invoke('delete_folder', { id });
      }
      toast.success(`${totalSelected}개 항목이 삭제되었습니다`);
      setSelectedFileIds(new Set());
      setSelectedFolderIds(new Set());
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBulkExport = async () => {
    if (totalSelected === 0) return;
    const selectedFiles = files.filter((f) => selectedFileIds.has(f.id));
    const selectedFolders = folders.filter((f) => selectedFolderIds.has(f.id));

    const destFolder = await open({
      multiple: false,
      directory: true,
      title: `${totalSelected}개 항목을 내보낼 폴더 선택 (금고에서 삭제됩니다)`,
    });
    if (!destFolder) return;
    const folder = Array.isArray(destFolder) ? destFolder[0] : destFolder;

    setUploading(true);
    let ok = 0;
    for (const file of selectedFiles) {
      try {
        const destPath = `${folder}\\${file.original_name}`;
        await invoke('vault_extract_file', { fileId: file.id, destPath });
        ok++;
      } catch {
        // continue
      }
    }
    for (const f of selectedFolders) {
      try {
        await invoke('vault_extract_folder', {
          folderId: f.id,
          destPath: folder,
        });
        ok++;
      } catch {
        // continue
      }
    }
    setUploading(false);
    if (ok > 0) {
      toast.success(`${ok}개 항목 내보내기 완료`);
      setSelectedFileIds(new Set());
      setSelectedFolderIds(new Set());
      await load();
      dispatchVaultFilesChanged();
    }
  };

  // Clear selection when navigating folders
  useEffect(() => {
    setSelectedFileIds(new Set());
    setSelectedFolderIds(new Set());
  }, [selectedFolderId]);

  // Sort & search
  type SortKey = 'name' | 'date' | 'size' | 'kind';
  type SortDir = 'asc' | 'desc';
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    file?: FileItem;
    folder?: FolderItem;
  } | null>(null);

  // Rename
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Move modal
  const [movingFile, setMovingFile] = useState<FileItem | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'file' | 'folder';
    id: string;
    name: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!isTauriEnv()) {
      setLoading(false);
      return;
    }
    try {
      const [children, fileList, all] = await Promise.all([
        invoke<FolderItem[]>('list_folders', {
          parentId: selectedFolderId || undefined,
        }),
        invoke<FileItem[]>('list_files', {
          folderId: selectedFolderId || undefined,
        }),
        invoke<FolderItem[]>('list_all_folders'),
      ]);
      setFolders(children);
      setFiles(fileList);
      setAllFolders(all);
    } catch {
      setFolders([]);
      setFiles([]);
      setAllFolders([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!isTauriEnv()) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onDragDropEvent((event) => {
        const t = event.payload.type;
        if (t === 'enter' || t === 'over') setIsDragOver(true);
        else setIsDragOver(false);

        if (t === 'drop' && event.payload.paths?.length) {
          // 내부 드래그(파일→폴더 이동) 중이면 외부 업로드 무시
          if (internalDragRef.current) {
            internalDragRef.current = false;
            return;
          }
          if (uploadingRef.current) return;
          uploadingRef.current = true;
          const paths = [...new Set(event.payload.paths as string[])];
          setUploadError('');
          setUploading(true);
          setUploadProgress({ current: 0, total: paths.length });
          let done = 0;
          const uploadOne = async (p: string) => {
            try {
              await invoke('vault_move_file', {
                sourcePath: p,
                folderId: selectedFolderId || undefined,
              });
            } catch (err: unknown) {
              const msg = String(err);
              if (msg.includes('폴더는 업로드할 수 없습니다')) {
                await invoke('vault_move_folder', {
                  sourcePath: p,
                  folderId: selectedFolderId || undefined,
                });
              } else if (msg.includes('찾을 수 없습니다')) {
                return;
              } else {
                throw err;
              }
            }
            done += 1;
            setUploadProgress((prev) =>
              prev ? { ...prev, current: done } : null,
            );
          };

          Promise.allSettled(paths.map(uploadOne))
            .then((results) => {
              const errors = results
                .filter(
                  (r): r is PromiseRejectedResult => r.status === 'rejected',
                )
                .map((r) => r.reason);
              const ok = results.filter((r) => r.status === 'fulfilled').length;
              if (errors.length === 0) {
                setUploadError('');
                if (ok) toast.success(`${ok}개 항목 업로드 완료`);
              } else {
                setUploadError(
                  errors[0] instanceof Error
                    ? errors[0].message
                    : String(errors[0]),
                );
                toast.error(errors[0]?.toString?.() ?? '업로드 실패');
                if (ok) toast.success(`${ok}개 항목 업로드 완료`);
              }
            })
            .finally(() => {
              load().then(dispatchVaultFilesChanged);
              setUploading(false);
              setUploadProgress(null);
              uploadingRef.current = false;
            });
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [load, selectedFolderId]);

  const breadcrumb: FolderItem[] = (() => {
    if (!selectedFolderId) return [];
    const path: FolderItem[] = [];
    let cur: FolderItem | undefined = allFolders.find(
      (f) => f.id === selectedFolderId,
    );
    while (cur) {
      path.unshift(cur);
      cur = cur.parent_id
        ? allFolders.find((f) => f.id === cur!.parent_id)
        : undefined;
    }
    return path;
  })();

  const handleUpload = async () => {
    setUploadError('');
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        title: '이동할 파일 선택 (원본은 삭제됩니다)',
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      setUploading(true);
      setUploadProgress({ current: 0, total: paths.length });
      let done = 0;
      for (const p of paths) {
        await invoke('vault_move_file', {
          sourcePath: p,
          folderId: selectedFolderId || undefined,
        });
        done += 1;
        setUploadProgress({ current: done, total: paths.length });
      }
      toast.success(`${paths.length}개 파일 업로드 완료`);
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleFolderUpload = async () => {
    setUploadError('');
    try {
      const selected = await open({
        multiple: false,
        directory: true,
        title: '이동할 폴더 선택 (원본은 삭제됩니다)',
      });
      if (!selected) return;
      const folderPath = Array.isArray(selected) ? selected[0] : selected;
      setUploading(true);
      setUploadProgress(null);
      const [fileCount, folderCount] = await invoke<[number, number]>(
        'vault_move_folder',
        {
          sourcePath: folderPath,
          folderId: selectedFolderId || undefined,
        },
      );
      toast.success(
        `폴더 업로드 완료 (폴더 ${folderCount}개, 파일 ${fileCount}개)`,
      );
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleCreateFolder = async () => {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      setNewName('');
      return;
    }
    try {
      await invoke('create_folder', {
        name,
        parentId: selectedFolderId || undefined,
      });
      setNewName('');
      setCreating(false);
      load();
    } catch {
      //
    }
  };

  const handleExport = async (file: FileItem) => {
    setExportingId(file.id);
    setUploadError('');
    try {
      const dest = await save({
        title: '내보낼 위치 선택 (금고에서 삭제됩니다)',
        defaultPath: file.original_name,
      });
      if (!dest) return;
      await invoke('vault_extract_file', {
        fileId: file.id,
        destPath: dest,
      });
      toast.success('내보내기 완료');
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setExportingId(null);
    }
  };

  // Internal drag: HTML5 DnD for file→folder movement
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const internalDragRef = useRef(false);

  const handleFileDragStart = (e: React.DragEvent, file: FileItem) => {
    internalDragRef.current = true;
    e.dataTransfer.setData('vault-file-id', file.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDrop = async (
    e: React.DragEvent,
    targetFolderId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);

    const fileId = e.dataTransfer.getData('vault-file-id');
    if (!fileId) return;

    try {
      await invoke('vault_change_folder', {
        fileId,
        folderId: targetFolderId,
      });
      toast.success('파일이 이동되었습니다');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  // --- File operations ---
  const handleDeleteFile = async (fileId: string) => {
    try {
      await invoke('vault_delete_file', { fileId });
      toast.success('파일이 삭제되었습니다');
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await invoke('delete_folder', { id: folderId });
      toast.success('폴더가 삭제되었습니다');
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRenameFile = async () => {
    if (!renamingFileId || !renameValue.trim()) {
      setRenamingFileId(null);
      return;
    }
    try {
      await invoke('vault_rename_file', {
        fileId: renamingFileId,
        newName: renameValue.trim(),
      });
      toast.success('이름이 변경되었습니다');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRenamingFileId(null);
    }
  };

  const handleRenameFolder = async () => {
    if (!renamingFolderId || !renameValue.trim()) {
      setRenamingFolderId(null);
      return;
    }
    try {
      await invoke('rename_folder', {
        id: renamingFolderId,
        newName: renameValue.trim(),
      });
      toast.success('폴더 이름이 변경되었습니다');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRenamingFolderId(null);
    }
  };

  const handleMoveFile = async (targetFolderId: string | null) => {
    if (!movingFile) return;
    try {
      await invoke('vault_change_folder', {
        fileId: movingFile.id,
        folderId: targetFolderId || undefined,
      });
      toast.success('파일이 이동되었습니다');
      setMovingFile(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExtractArchive = async (file: FileItem) => {
    try {
      setUploading(true);
      const [fileCount, folderCount] = await invoke<[number, number]>(
        'vault_extract_archive',
        {
          fileId: file.id,
          folderId: selectedFolderId || undefined,
        },
      );
      toast.success(
        `압축 해제 완료 (폴더 ${folderCount}개, 파일 ${fileCount}개)`,
      );
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  // --- Sort & filter ---
  const q = searchQuery.toLowerCase().trim();
  const filteredFolders = q
    ? folders.filter((f) => f.name.toLowerCase().includes(q))
    : folders;
  const filteredFiles = q
    ? files.filter((f) => f.original_name.toLowerCase().includes(q))
    : files;

  const sortedFolders = [...filteredFolders].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
    if (sortKey === 'date') return (a.created_at - b.created_at) * dir;
    return a.name.localeCompare(b.name) * dir;
  });

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name')
      return a.original_name.localeCompare(b.original_name) * dir;
    if (sortKey === 'date') return (a.created_at - b.created_at) * dir;
    if (sortKey === 'size') return (a.size_bytes - b.size_bytes) * dir;
    if (sortKey === 'kind') return a.file_kind.localeCompare(b.file_kind) * dir;
    return 0;
  });

  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showSortMenu]);

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'name', label: '이름' },
    { key: 'date', label: '날짜' },
    { key: 'size', label: '크기' },
    { key: 'kind', label: '종류' },
  ];

  // --- Context menu builders ---
  const buildFileMenu = (file: FileItem): MenuItem[] => {
    const items: MenuItem[] = [];

    if (['image', 'audio', 'video', 'document'].includes(file.file_kind)) {
      items.push({
        label: '열기',
        icon: <FileText size={14} />,
        onClick: () => {
          if (file.file_kind === 'image') setViewerFile(file);
          else if (file.file_kind === 'audio') setAudioFile(file);
          else if (file.file_kind === 'video') setVideoFile(file);
          else if (file.file_kind === 'document') setDocFile(file);
        },
      });
    }

    if (isArchive(file.original_name)) {
      items.push({
        label: '여기에 압축 해제',
        icon: <Archive size={14} />,
        onClick: () => handleExtractArchive(file),
      });
    }

    items.push({
      label: '이름 변경',
      icon: <Edit3 size={14} />,
      onClick: () => {
        setRenamingFileId(file.id);
        setRenameValue(file.original_name);
      },
    });

    items.push({
      label: '폴더 이동',
      icon: <FolderSymlink size={14} />,
      onClick: () => setMovingFile(file),
    });

    items.push({
      label: '내보내기',
      icon: <ArrowUpFromLine size={14} />,
      onClick: () => handleExport(file),
      divider: true,
    });

    items.push({
      label: '삭제',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () =>
        setDeleteTarget({
          type: 'file',
          id: file.id,
          name: file.original_name,
        }),
    });

    return items;
  };

  const handleExportFolder = async (folder: FolderItem) => {
    try {
      const destFolder = await open({
        multiple: false,
        directory: true,
        title: `"${folder.name}" 폴더를 내보낼 위치 선택 (금고에서 삭제됩니다)`,
      });
      if (!destFolder) return;
      const dest = Array.isArray(destFolder) ? destFolder[0] : destFolder;
      setUploading(true);
      const [fileCount, folderCount] = await invoke<[number, number]>(
        'vault_extract_folder',
        { folderId: folder.id, destPath: dest },
      );
      toast.success(
        `폴더 내보내기 완료 (폴더 ${folderCount}개, 파일 ${fileCount}개)`,
      );
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const buildFolderMenu = (folder: FolderItem): MenuItem[] => [
    {
      label: '열기',
      icon: <Folder size={14} />,
      onClick: () => setSelectedFolderId(folder.id),
    },
    {
      label: '이름 변경',
      icon: <Edit3 size={14} />,
      onClick: () => {
        setRenamingFolderId(folder.id);
        setRenameValue(folder.name);
      },
    },
    {
      label: '내보내기',
      icon: <ArrowUpFromLine size={14} />,
      onClick: () => handleExportFolder(folder),
      divider: true,
    },
    {
      label: '삭제',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () =>
        setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name }),
    },
  ];

  if (!isTauriEnv()) {
    return (
      <div className="p-8 text-destructive">
        Tauri 앱으로 실행해 주세요. (npm run tauri:dev)
      </div>
    );
  }

  const showProgress =
    uploading ||
    (exportingId !== null && files.some((f) => f.id === exportingId));

  return (
    <div className="flex flex-col h-full min-h-0 relative">
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

      {/* Multi-select action bar */}
      {totalSelected > 0 && (
        <div className="flex-shrink-0 mb-3 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium">
            {totalSelected}개 선택됨
            {selectedFolderIds.size > 0 && selectedFileIds.size > 0 && (
              <span className="text-muted-foreground ml-1 text-xs">
                (폴더 {selectedFolderIds.size}, 파일 {selectedFileIds.size})
              </span>
            )}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleBulkExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-accent"
          >
            <ArrowUpFromLine size={14} />
            내보내기
          </button>
          <button
            type="button"
            onClick={() =>
              setDeleteTarget({
                type: 'file',
                id: '__bulk__',
                name: `${totalSelected}개 항목`,
              })
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-rose-600 text-white hover:bg-rose-700"
          >
            <Trash2 size={14} />
            삭제
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedFileIds(new Set());
              setSelectedFolderIds(new Set());
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* 브레드크럼 + 툴바 */}
      <div className="flex-shrink-0 mb-4">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-3 min-w-0 overflow-hidden">
          <button
            type="button"
            className="hover:text-foreground shrink-0"
            onClick={() => setSelectedFolderId(null)}
          >
            내 드라이브
          </button>
          {breadcrumb.map((f) => (
            <span key={f.id} className="flex items-center gap-1 min-w-0">
              <span className="shrink-0">/</span>
              <button
                type="button"
                className="hover:text-foreground truncate max-w-[160px]"
                onClick={() => setSelectedFolderId(f.id)}
                title={f.name}
              >
                {f.name}
              </button>
            </span>
          ))}
        </nav>
        {uploadError && (
          <p className="text-sm text-rose-400 mb-2">{uploadError}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            onClick={() => setCreating(true)}
          >
            <FolderPlus size={16} />새 폴더
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            aria-busy={uploading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                업로드 중...
              </>
            ) : (
              <>
                <Upload size={16} />
                파일 업로드
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleFolderUpload}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50"
          >
            <FolderInput size={16} />
            폴더 업로드
          </button>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색..."
              className="w-44 py-1.5 pl-8 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Sort */}
          <div className="relative" ref={sortRef}>
            <button
              type="button"
              onClick={() => setShowSortMenu((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent"
            >
              <ArrowDownAZ size={14} />
              {SORT_OPTIONS.find((o) => o.key === sortKey)?.label}
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] py-1 rounded-lg bg-popover border border-border shadow-xl">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center justify-between ${
                      sortKey === opt.key ? 'font-medium text-primary' : ''
                    }`}
                    onClick={() => {
                      if (sortKey === opt.key) {
                        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      } else {
                        setSortKey(opt.key);
                        setSortDir('asc');
                      }
                      setShowSortMenu(false);
                    }}
                  >
                    {opt.label}
                    {sortKey === opt.key && (
                      <span className="text-xs opacity-60">
                        {sortDir === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 새 폴더 입력 */}
      {creating && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border mb-4">
          <Folder size={20} className="text-muted-foreground" />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="폴더 이름"
            className="flex-1 py-1.5 px-2 rounded border border-input bg-background text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
          />
          <button
            type="button"
            className="px-3 py-1 rounded bg-primary text-primary-foreground text-sm"
            onClick={handleCreateFolder}
          >
            만들기
          </button>
        </div>
      )}

      {/* 콘텐츠 그리드 */}
      <div
        className={`flex-1 min-h-0 overflow-auto rounded-lg transition-colors ${
          isDragOver ? 'ring-2 ring-primary bg-primary/5' : ''
        }`}
      >
        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            로딩 중...
          </div>
        ) : sortedFolders.length === 0 &&
          sortedFiles.length === 0 &&
          !creating ? (
          <div className="py-16 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            {q ? (
              <>
                <Search size={40} className="mx-auto mb-2 opacity-50" />
                <p>검색 결과가 없습니다</p>
              </>
            ) : (
              <>
                <Folder size={40} className="mx-auto mb-2 opacity-50" />
                <p>이 폴더가 비어 있습니다</p>
                <p className="mt-1 text-xs">
                  새 폴더를 만들거나 파일을 업로드하세요.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {/* Folders */}
            {sortedFolders.map((f) => (
              <div
                key={f.id}
                className={`group relative flex flex-col rounded-xl border transition-all text-left w-full overflow-hidden cursor-pointer ${
                  selectedFolderIds.has(f.id)
                    ? 'border-primary ring-2 ring-primary/30 shadow-md'
                    : dragOverFolderId === f.id
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                      : 'border-border hover:border-primary/30 hover:shadow-md'
                }`}
                onClick={(e) => handleFolderClick(e, f, sortedFolders)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, folder: f });
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverFolderId(f.id);
                }}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={(e) => handleFolderDrop(e, f.id)}
              >
                <div className="relative flex items-center justify-center aspect-square bg-accent/30 group-hover:bg-accent/50 transition-colors">
                  <Folder size={48} className="text-amber-500" />

                  {/* Checkbox */}
                  <div
                    className={`absolute top-2 left-2 transition-opacity ${
                      totalSelected > 0 || selectedFolderIds.has(f.id)
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFolderIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.id)) next.delete(f.id);
                          else next.add(f.id);
                          return next;
                        });
                      }}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedFolderIds.has(f.id)
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-background/80 border-border backdrop-blur-sm hover:border-primary'
                      }`}
                    >
                      {selectedFolderIds.has(f.id) && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
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

                  {/* More button */}
                  <button
                    type="button"
                    className="absolute top-2 right-2 p-1 rounded-md bg-background/80 backdrop-blur-sm border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setCtxMenu({
                        x: rect.right,
                        y: rect.bottom,
                        folder: f,
                      });
                    }}
                  >
                    <MoreVertical size={14} />
                  </button>
                </div>
                <div className="px-3 py-2.5">
                  {renamingFolderId === f.id ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="w-full py-0.5 px-1 rounded border border-input bg-background text-sm"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') handleRenameFolder();
                        if (e.key === 'Escape') setRenamingFolderId(null);
                      }}
                      onBlur={handleRenameFolder}
                    />
                  ) : (
                    <p className="text-sm font-medium truncate" title={f.name}>
                      {f.name}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Files */}
            {sortedFiles.map((file) => {
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
                  key={file.id}
                  draggable
                  onDragStart={(e) => handleFileDragStart(e, file)}
                  onDragEnd={() => {
                    internalDragRef.current = false;
                    setDragOverFolderId(null);
                  }}
                  onClick={(e) => handleFileClick(e, file, sortedFiles)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu({ x: e.clientX, y: e.clientY, file });
                  }}
                  className={`group relative flex flex-col rounded-xl border transition-all overflow-hidden cursor-pointer ${
                    selectedFileIds.has(file.id)
                      ? 'border-primary ring-2 ring-primary/30 shadow-md'
                      : 'border-border hover:border-primary/30 hover:shadow-md'
                  }`}
                >
                  <div className="relative aspect-square bg-accent/20 flex items-center justify-center overflow-hidden">
                    {file.thumbnail_base64 ? (
                      <img
                        src={`data:image/jpeg;base64,${file.thumbnail_base64}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Icon size={48} className={iconColor} />
                    )}
                    {/* Checkbox */}
                    <div
                      className={`absolute top-2 left-2 transition-opacity ${
                        selectedFileIds.size > 0 || selectedFileIds.has(file.id)
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFileIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(file.id)) next.delete(file.id);
                            else next.add(file.id);
                            return next;
                          });
                          lastClickedFileRef.current = file.id;
                        }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          selectedFileIds.has(file.id)
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'bg-background/80 border-border backdrop-blur-sm hover:border-primary'
                        }`}
                      >
                        {selectedFileIds.has(file.id) && (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                          >
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
                    {/* More button */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = (
                            e.target as HTMLElement
                          ).getBoundingClientRect();
                          setCtxMenu({
                            x: rect.right,
                            y: rect.bottom,
                            file,
                          });
                        }}
                        className="w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="px-2.5 py-2">
                    {renamingFileId === file.id ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="w-full py-0.5 px-1 rounded border border-input bg-background text-sm"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') handleRenameFile();
                          if (e.key === 'Escape') setRenamingFileId(null);
                        }}
                        onBlur={handleRenameFile}
                      />
                    ) : (
                      <>
                        <p
                          className="text-sm font-medium truncate"
                          title={file.original_name}
                        >
                          {file.original_name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {sizeLabel}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={
            ctxMenu.file
              ? buildFileMenu(ctxMenu.file)
              : ctxMenu.folder
                ? buildFolderMenu(ctxMenu.folder)
                : []
          }
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Delete Confirmation */}
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
                  if (deleteTarget.id === '__bulk__') {
                    await handleBulkDelete();
                  } else if (deleteTarget.type === 'file') {
                    await handleDeleteFile(deleteTarget.id);
                  } else {
                    await handleDeleteFolder(deleteTarget.id);
                  }
                  setDeleteTarget(null);
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move to Folder Modal */}
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
                onClick={() => handleMoveFile(null)}
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
                  onClick={() => handleMoveFile(f.id)}
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

      {/* Viewers */}
      {viewerFile && (
        <ImageViewer
          file={viewerFile}
          images={files.filter((f) => f.file_kind === 'image')}
          onClose={() => setViewerFile(null)}
        />
      )}

      {videoFile && (
        <VideoPlayer
          file={videoFile}
          videos={files.filter((f) => f.file_kind === 'video')}
          onClose={() => setVideoFile(null)}
        />
      )}

      {docFile && (
        <DocumentViewer file={docFile} onClose={() => setDocFile(null)} />
      )}

      {audioFile && (
        <AudioPlayer
          file={audioFile}
          playlist={files.filter((f) => f.file_kind === 'audio')}
          onClose={() => setAudioFile(null)}
          onFileChange={(f) => setAudioFile(f as FileItem)}
        />
      )}
    </div>
  );
}

export default VaultPage;
