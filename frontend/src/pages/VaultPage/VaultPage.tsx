import ContextMenu from '@/components/molecules/ContextMenu/ContextMenu';
import AudioPlayer from '@/components/organisms/AudioPlayer/AudioPlayer';
import DocumentViewer from '@/components/organisms/DocumentViewer/DocumentViewer';
import ImageViewer from '@/components/organisms/ImageViewer/ImageViewer';
import {
  dispatchVaultFilesChanged,
  VAULT_FILES_CHANGED,
} from '@/components/organisms/SidebarStorage/SidebarStorage';
import VideoPlayer from '@/components/organisms/VideoPlayer/VideoPlayer';
import i18n from '@/i18n';
import { useVaultFolderStore } from '@/stores/useVaultFolderStore';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { FileIcon, Folder } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import VaultContentGrid from './VaultContentGrid';
import VaultEmptyState from './VaultEmptyState';
import VaultModals from './VaultModals';
import VaultToolbar, { type SortDir, type SortKey } from './VaultToolbar';
import type { FileItem, FolderItem } from './types';
import { buildFileMenu, buildFolderMenu } from './vaultContextMenus';

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function VaultPage() {
  const { t } = useTranslation();
  const { selectedFolderId, setSelectedFolderId: rawSetFolder } =
    useVaultFolderStore();

  // Navigation history (ref 기반으로 클로저 스테일니스 방지)
  const historyBack = useRef<(string | null)[]>([]);
  const historyForward = useRef<(string | null)[]>([]);
  const isNavRef = useRef(false);
  const currentFolderRef = useRef<string | null>(selectedFolderId);
  const lastMouseNavRef = useRef(0);

  currentFolderRef.current = selectedFolderId;

  const setSelectedFolderId = useCallback(
    (id: string | null) => {
      if (isNavRef.current) {
        isNavRef.current = false;
        rawSetFolder(id);
        return;
      }
      const cur = currentFolderRef.current;
      if (cur !== id) {
        historyBack.current.push(cur);
        historyForward.current = [];
      }
      rawSetFolder(id);
    },
    [rawSetFolder],
  );

  const goBack = useCallback(() => {
    if (historyBack.current.length === 0) return;
    const prev = historyBack.current.pop()!;
    historyForward.current.push(currentFolderRef.current);
    isNavRef.current = true;
    rawSetFolder(prev);
  }, [rawSetFolder]);

  const goForward = useCallback(() => {
    if (historyForward.current.length === 0) return;
    const next = historyForward.current.pop()!;
    historyBack.current.push(currentFolderRef.current);
    isNavRef.current = true;
    rawSetFolder(next);
  }, [rawSetFolder]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      const now = Date.now();
      if (now - lastMouseNavRef.current < 300) return; // 연타 방지
      lastMouseNavRef.current = now;
      e.preventDefault();
      e.stopPropagation();
      if (e.button === 3) goBack();
      else goForward();
    };
    window.addEventListener('mouseup', handler, true);
    return () => window.removeEventListener('mouseup', handler, true);
  }, [goBack, goForward]);

  useEffect(() => {
    useVaultFolderStore
      .getState()
      .registerHistoryAwareNavigate(setSelectedFolderId);
    return () => {
      useVaultFolderStore.getState().registerHistoryAwareNavigate(null);
    };
  }, [setSelectedFolderId]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filesTotal, setFilesTotal] = useState<number | null>(null);
  const [allFolders, setAllFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [exportProgress, setExportProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const uploadingRef = useRef(false);
  const lastDropPathsRef = useRef<string>('');
  const lastDropTimeRef = useRef(0);
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
    if (internalDragJustFinishedRef.current) {
      internalDragJustFinishedRef.current = false;
      return;
    }
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
    else toast.info(t('vault.unsupportedFormat'));
  };

  const handleFolderClick = (
    e: React.MouseEvent,
    folder: FolderItem,
    allFolders: FolderItem[],
  ) => {
    if (internalDragJustFinishedRef.current) {
      internalDragJustFinishedRef.current = false;
      return;
    }
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
      toast.success(t('vault.itemsDeleted', { count: totalSelected }));
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

    const total = selectedFiles.length + selectedFolders.length;
    setExportProgress({ current: 0, total });
    setUploading(true);
    let ok = 0;
    let done = 0;
    for (const file of selectedFiles) {
      try {
        const destPath = `${folder}\\${file.original_name}`;
        await invoke('vault_extract_file', { fileId: file.id, destPath });
        ok++;
      } catch {
        // continue
      }
      done++;
      setExportProgress({ current: done, total });
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
      done++;
      setExportProgress({ current: done, total });
    }
    setExportProgress(null);
    setUploading(false);
    if (ok > 0) {
      toast.success(t('vault.itemsExportDone', { count: ok }));
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
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);

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
  const [bulkMoveItems, setBulkMoveItems] = useState<{
    fileIds: string[];
    folderIds: string[];
  } | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'file' | 'folder';
    id: string;
    name: string;
  } | null>(null);

  const PAGE_SIZE = 200;

  const load = useCallback(async () => {
    if (!isTauriEnv()) {
      setLoading(false);
      return;
    }
    try {
      const [children, paged, all] = await Promise.all([
        invoke<FolderItem[]>('list_folders', {
          parentId: selectedFolderId || undefined,
        }),
        invoke<[FileItem[], number]>('list_files_paged', {
          folderId: selectedFolderId || undefined,
          limit: PAGE_SIZE,
          offset: 0,
        }),
        invoke<FolderItem[]>('list_all_folders'),
      ]);
      const [fileList, total] = paged;
      setFolders(children);
      setFiles(fileList);
      setFilesTotal(total);
      setAllFolders(all);
    } catch {
      setFolders([]);
      setFiles([]);
      setFilesTotal(null);
      setAllFolders([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId]);

  useEffect(() => {
    setLoading(true);
    setFiles([]);
    setFilesTotal(null);
    load();
  }, [load]);

  useEffect(() => {
    const onChanged = () => load();
    window.addEventListener(VAULT_FILES_CHANGED, onChanged);
    return () => window.removeEventListener(VAULT_FILES_CHANGED, onChanged);
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
          if (uploadingRef.current) return;
          const paths = [...new Set(event.payload.paths as string[])];
          const pathsKey = paths.slice().sort().join('|');
          const now = Date.now();
          if (
            pathsKey === lastDropPathsRef.current &&
            now - lastDropTimeRef.current < 800
          ) {
            return;
          }
          lastDropPathsRef.current = pathsKey;
          lastDropTimeRef.current = now;
          uploadingRef.current = true;
          const payload = event.payload as {
            paths?: string[];
            position?: { x: number; y: number };
          };
          let targetFolderId: string | null =
            useVaultFolderStore.getState().selectedFolderId;
          if (payload.position) {
            const el = document.elementFromPoint(
              payload.position.x,
              payload.position.y,
            );
            const card = el?.closest(
              '[data-vault-folder-id]',
            ) as HTMLElement | null;
            if (card) {
              targetFolderId =
                card.getAttribute('data-vault-folder-id') ?? targetFolderId;
            }
          }
          setUploadError('');
          setUploading(true);
          setUploadProgress({ current: 0, total: paths.length });
          let done = 0;
          const folderIdForUpload = targetFolderId || undefined;
          const uploadOne = async (p: string) => {
            try {
              await invoke('vault_move_file', {
                sourcePath: p,
                folderId: folderIdForUpload,
              });
            } catch (err: unknown) {
              const msg = String(err);
              if (msg.includes('폴더는 업로드할 수 없습니다')) {
                await invoke('vault_move_folder', {
                  sourcePath: p,
                  folderId: folderIdForUpload,
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
              const showSuccess = ok > 0;
              const showError = errors.length > 0;
              setUploadError(
                showError
                  ? errors[0] instanceof Error
                    ? errors[0].message
                    : String(errors[0])
                  : '',
              );
              if (showError) {
                const errMsg =
                  errors[0] instanceof Error
                    ? errors[0].message
                    : errors[0] != null
                      ? String(errors[0])
                      : i18n.t('vault.uploadFailed');
                toast.error(errMsg);
              }
              if (showSuccess)
                toast.success(i18n.t('vault.itemsUploadDone', { count: ok }));
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
  }, [load]);

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
        title: t('vault.selectFilesToMove'),
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const folderId =
        useVaultFolderStore.getState().selectedFolderId ?? undefined;
      setUploading(true);
      setUploadProgress({ current: 0, total: paths.length });
      let done = 0;
      for (const p of paths) {
        await invoke('vault_move_file', {
          sourcePath: p,
          folderId,
        });
        done += 1;
        setUploadProgress({ current: done, total: paths.length });
      }
      toast.success(t('vault.filesUploadDone', { count: paths.length }));
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
        title: t('vault.selectFolderToMove'),
      });
      if (!selected) return;
      const folderPath = Array.isArray(selected) ? selected[0] : selected;
      const folderId =
        useVaultFolderStore.getState().selectedFolderId ?? undefined;
      setUploading(true);
      setUploadProgress(null);
      const [fileCount, folderCount] = await invoke<[number, number]>(
        'vault_move_folder',
        {
          sourcePath: folderPath,
          folderId,
        },
      );
      toast.success(t('vault.folderUploadDone', { folderCount, fileCount }));
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
      dispatchVaultFilesChanged();
    } catch {
      //
    }
  };

  const handleExport = async (file: FileItem) => {
    setExportingId(file.id);
    setExportProgress({ current: 0, total: 1 });
    setUploadError('');
    try {
      const dest = await save({
        title: t('vault.selectExportDest'),
        defaultPath: file.original_name,
      });
      if (!dest) {
        setExportProgress(null);
        return;
      }
      setExportProgress({ current: 1, total: 1 });
      await invoke('vault_extract_file', {
        fileId: file.id,
        destPath: dest,
      });
      toast.success(t('vault.exportDone'));
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setExportingId(null);
      setExportProgress(null);
    }
  };

  // 내부 이동: HTML5 DnD 대신 포인터 이벤트 (Tauri 기본 드래그와 공존)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const internalDragRef = useRef<{
    fileIds: string[];
    folderIds: string[];
    startX: number;
    startY: number;
  } | null>(null);
  const internalDragActiveRef = useRef(false);
  const [internalDragState, setInternalDragState] = useState<{
    count: number;
    fileCount: number;
    folderCount: number;
    x: number;
    y: number;
  } | null>(null);
  const internalDragJustFinishedRef = useRef(false);

  const DRAG_THRESHOLD = 5;

  const handleInternalMove = useCallback(
    async (
      fileIds: string[],
      folderIds: string[],
      targetFolderId: string | null,
    ) => {
      const target = targetFolderId || undefined;
      const filteredFolderIds = folderIds.filter((id) => id !== targetFolderId);
      if (fileIds.length === 0 && filteredFolderIds.length === 0) return;
      try {
        let ok = 0;
        for (const fileId of fileIds) {
          try {
            await invoke('vault_change_folder', {
              fileId,
              folderId: target,
            });
            ok++;
          } catch {
            /* skip */
          }
        }
        for (const folderId of filteredFolderIds) {
          try {
            await invoke('change_folder_parent', {
              folderId,
              newParentId: target,
            });
            ok++;
          } catch {
            /* skip */
          }
        }
        if (ok > 0) {
          toast.success(t('vault.itemsMoved', { count: ok }));
          setSelectedFileIds(new Set());
          setSelectedFolderIds(new Set());
          await load();
          dispatchVaultFilesChanged();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    },
    [load, t],
  );

  const onInternalPointerDown = useCallback(
    (
      fileIds: string[],
      folderIds: string[],
      clientX: number,
      clientY: number,
    ) => {
      if (fileIds.length === 0 && folderIds.length === 0) return;
      internalDragRef.current = {
        fileIds,
        folderIds,
        startX: clientX,
        startY: clientY,
      };
      internalDragActiveRef.current = false;
    },
    [],
  );

  const onFilePointerDownForDrag = useCallback(
    (file: FileItem, clientX: number, clientY: number) => {
      const inSelection =
        selectedFileIds.has(file.id) || selectedFolderIds.size > 0;
      const fileIds = inSelection ? [...selectedFileIds] : [file.id];
      const folderIds = inSelection ? [...selectedFolderIds] : [];
      onInternalPointerDown(fileIds, folderIds, clientX, clientY);
    },
    [selectedFileIds, selectedFolderIds, onInternalPointerDown],
  );

  const onFolderPointerDownForDrag = useCallback(
    (folder: FolderItem, clientX: number, clientY: number) => {
      const inSelection =
        selectedFolderIds.has(folder.id) || selectedFileIds.size > 0;
      const folderIds = inSelection ? [...selectedFolderIds] : [folder.id];
      const fileIds = inSelection ? [...selectedFileIds] : [];
      onInternalPointerDown(fileIds, folderIds, clientX, clientY);
    },
    [selectedFileIds, selectedFolderIds, onInternalPointerDown],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = internalDragRef.current;
      if (!d) return;
      if (!internalDragActiveRef.current) {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
        internalDragActiveRef.current = true;
        setInternalDragState({
          count: d.fileIds.length + d.folderIds.length,
          fileCount: d.fileIds.length,
          folderCount: d.folderIds.length,
          x: e.clientX,
          y: e.clientY,
        });
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }

      setInternalDragState((prev) =>
        prev ? { ...prev, x: e.clientX, y: e.clientY } : null,
      );
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el?.closest('[data-vault-folder-id]') as HTMLElement | null;
      const folderId = card?.getAttribute('data-vault-folder-id') ?? null;
      setDragOverFolderId(folderId);
    };
    const onUp = async (e: PointerEvent) => {
      const d = internalDragRef.current;
      const wasActive = internalDragActiveRef.current;
      internalDragRef.current = null;
      internalDragActiveRef.current = false;
      setInternalDragState(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDragOverFolderId(null);
      if (!d || !wasActive) return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el?.closest('[data-vault-folder-id]') as HTMLElement | null;
      const folderId = card?.getAttribute('data-vault-folder-id') ?? null;
      if (folderId !== null) {
        internalDragJustFinishedRef.current = true;
        await handleInternalMove(d.fileIds, d.folderIds, folderId);
      }
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [handleInternalMove]);

  // --- File operations ---
  const handleDeleteFile = async (fileId: string) => {
    try {
      await invoke('vault_delete_file', { fileId });
      toast.success(t('vault.fileDeleted'));
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await invoke('delete_folder', { id: folderId });
      toast.success(t('vault.folderDeleted'));
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
      toast.success(t('vault.nameChanged'));
      await load();
      dispatchVaultFilesChanged();
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
      toast.success(t('vault.folderNameChanged'));
      await load();
      dispatchVaultFilesChanged();
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
      toast.success(t('vault.fileMoved'));
      setMovingFile(null);
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBulkMove = async (targetFolderId: string | null) => {
    if (
      !bulkMoveItems ||
      (bulkMoveItems.fileIds.length === 0 &&
        bulkMoveItems.folderIds.length === 0)
    )
      return;
    try {
      let ok = 0;
      for (const fileId of bulkMoveItems.fileIds) {
        try {
          await invoke('vault_change_folder', {
            fileId,
            folderId: targetFolderId || undefined,
          });
          ok++;
        } catch {
          // continue
        }
      }
      for (const folderId of bulkMoveItems.folderIds) {
        try {
          await invoke('change_folder_parent', {
            folderId,
            newParentId: targetFolderId || undefined,
          });
          ok++;
        } catch {
          // continue
        }
      }
      setBulkMoveItems(null);
      setSelectedFileIds(new Set());
      setSelectedFolderIds(new Set());
      toast.success(t('vault.itemsMoved', { count: ok }));
      await load();
      dispatchVaultFilesChanged();
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
      toast.success(t('vault.extractDone', { folderCount, fileCount }));
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

  const handleExportFolder = async (folder: FolderItem) => {
    try {
      const destFolder = await open({
        multiple: false,
        directory: true,
        title: t('vault.selectFolderExportDest', { name: folder.name }),
      });
      if (!destFolder) return;
      const dest = Array.isArray(destFolder) ? destFolder[0] : destFolder;
      setUploading(true);
      const [fileCount, folderCount] = await invoke<[number, number]>(
        'vault_extract_folder',
        { folderId: folder.id, destPath: dest },
      );
      toast.success(t('vault.folderExportDone', { folderCount, fileCount }));
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const hasMoreFiles =
    filesTotal !== null && files.length > 0 && files.length < filesTotal;

  const [loadingMore, setLoadingMore] = useState(false);
  const scrollParentRef = useRef<HTMLDivElement | null>(null);

  const loadMoreFiles = useCallback(async () => {
    if (!isTauriEnv() || !hasMoreFiles || loadingMore) return;
    setLoadingMore(true);
    try {
      const [next, total] = await invoke<[FileItem[], number]>(
        'list_files_paged',
        {
          folderId: selectedFolderId || undefined,
          limit: PAGE_SIZE,
          offset: files.length,
        },
      );
      setFiles((prev) => [...prev, ...next]);
      setFilesTotal(total);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [files.length, hasMoreFiles, loadingMore, selectedFolderId]);

  const fileMenuHandlers = {
    onOpen: (file: FileItem) => {
      if (file.file_kind === 'image') setViewerFile(file);
      else if (file.file_kind === 'audio') setAudioFile(file);
      else if (file.file_kind === 'video') setVideoFile(file);
      else if (file.file_kind === 'document') setDocFile(file);
      else toast.info(t('vault.unsupportedFormat'));
    },
    onExtractArchive: handleExtractArchive,
    onRename: (file: FileItem) => {
      setRenamingFileId(file.id);
      setRenameValue(file.original_name);
    },
    onMove: setMovingFile,
    onExport: handleExport,
    onDelete: (file: FileItem) =>
      setDeleteTarget({
        type: 'file',
        id: file.id,
        name: file.original_name,
      }),
  };
  const folderMenuHandlers = {
    onOpen: (folder: FolderItem) => setSelectedFolderId(folder.id),
    onRename: (folder: FolderItem) => {
      setRenamingFolderId(folder.id);
      setRenameValue(folder.name);
    },
    onExport: handleExportFolder,
    onDelete: (folder: FolderItem) =>
      setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name }),
  };

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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === '__bulk__') {
      await handleBulkDelete();
    } else if (deleteTarget.type === 'file') {
      await handleDeleteFile(deleteTarget.id);
    } else {
      await handleDeleteFolder(deleteTarget.id);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {internalDragState && (
        <div
          className="fixed z-[100] pointer-events-none"
          style={{
            left: internalDragState.x + 16,
            top: internalDragState.y + 12,
          }}
          aria-hidden
        >
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-md border border-border/70 shadow-2xl shadow-black/20 min-w-[120px] scale-105">
            <div className="flex items-center gap-1">
              {internalDragState.folderCount > 0 && (
                <div className="w-8 h-8 rounded-lg bg-amber-500/25 flex items-center justify-center border border-amber-500/50 shrink-0">
                  <Folder
                    size={16}
                    className="text-amber-600 dark:text-amber-400"
                  />
                </div>
              )}
              {internalDragState.fileCount > 0 && (
                <div className="w-8 h-8 rounded-lg bg-blue-500/25 flex items-center justify-center border border-blue-500/50 shrink-0">
                  <FileIcon
                    size={16}
                    className="text-blue-600 dark:text-blue-400"
                  />
                </div>
              )}
            </div>
            <span className="text-sm font-medium text-foreground">
              {t('vault.itemsMoving', { count: internalDragState.count })}
            </span>
          </div>
        </div>
      )}
      <VaultModals
        showProgress={showProgress}
        uploading={uploading}
        uploadProgress={uploadProgress}
        exportProgress={exportProgress}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        onDeleteConfirm={handleDeleteConfirm}
        movingFile={movingFile}
        setMovingFile={setMovingFile}
        bulkMoveItems={bulkMoveItems}
        setBulkMoveItems={setBulkMoveItems}
        allFolders={allFolders}
        selectedFolderId={selectedFolderId}
        onMoveFile={handleMoveFile}
        onBulkMove={handleBulkMove}
      />

      <VaultToolbar
        breadcrumb={breadcrumb}
        onNavigate={setSelectedFolderId}
        uploadError={uploadError}
        creating={creating}
        setCreating={setCreating}
        newName={newName}
        setNewName={setNewName}
        onCreateFolder={handleCreateFolder}
        onUpload={handleUpload}
        onFolderUpload={handleFolderUpload}
        uploading={uploading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortKey={sortKey}
        setSortKey={setSortKey}
        sortDir={sortDir}
        setSortDir={setSortDir}
        showSortMenu={showSortMenu}
        setShowSortMenu={setShowSortMenu}
        totalSelected={totalSelected}
        selectedFolderCount={selectedFolderIds.size}
        selectedFileCount={selectedFileIds.size}
        onBulkExport={handleBulkExport}
        onBulkDeleteClick={() =>
          setDeleteTarget({
            type: 'file',
            id: '__bulk__',
            name: `${totalSelected}개 항목`,
          })
        }
        onBulkMove={() =>
          setBulkMoveItems({
            fileIds: [...selectedFileIds],
            folderIds: [...selectedFolderIds],
          })
        }
        onClearSelection={() => {
          setSelectedFileIds(new Set());
          setSelectedFolderIds(new Set());
        }}
      />

      {/* 콘텐츠 그리드 */}
      <div
        ref={scrollParentRef}
        className={`flex-1 min-h-0 overflow-auto rounded-lg transition-colors relative ${
          isDragOver ? 'ring-2 ring-primary bg-primary/5' : ''
        }`}
        onScroll={(e) => {
          const el = e.currentTarget;
          const distanceToBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight;
          if (distanceToBottom < 400) {
            loadMoreFiles();
          }
        }}
      >
        {isDragOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <p className="text-sm font-medium text-primary">
              여기에 놓으면 업로드됩니다
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              ※ 밖으로 끌어내기는 지원하지 않습니다. 내보내기는 우클릭 메뉴를
              이용하세요.
            </p>
          </div>
        )}
        {loading ||
        (sortedFolders.length === 0 &&
          sortedFiles.length === 0 &&
          !creating) ? (
          <VaultEmptyState
            loading={loading}
            empty={
              sortedFolders.length === 0 &&
              sortedFiles.length === 0 &&
              !creating
            }
            searchQuery={searchQuery}
          />
        ) : (
          <VaultContentGrid
            sortedFolders={sortedFolders}
            sortedFiles={sortedFiles}
            selectedFolderIds={selectedFolderIds}
            selectedFileIds={selectedFileIds}
            totalSelected={totalSelected}
            dragOverFolderId={dragOverFolderId}
            renamingFolderId={renamingFolderId}
            renamingFileId={renamingFileId}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameFolderSubmit={handleRenameFolder}
            onRenameFolderCancel={() => setRenamingFolderId(null)}
            onRenameFileSubmit={handleRenameFile}
            onRenameFileCancel={() => setRenamingFileId(null)}
            onFolderSelect={(id, add) => {
              setSelectedFolderIds((prev) => {
                const next = new Set(prev);
                if (add) next.add(id);
                else next.delete(id);
                return next;
              });
            }}
            onFileSelect={(id, add) => {
              setSelectedFileIds((prev) => {
                const next = new Set(prev);
                if (add) next.add(id);
                else next.delete(id);
                return next;
              });
            }}
            onFolderClick={handleFolderClick}
            onFileClick={handleFileClick}
            onFolderContextMenu={(e, folder) =>
              setCtxMenu({ x: e.clientX, y: e.clientY, folder })
            }
            onFileContextMenu={(e, file) =>
              setCtxMenu({ x: e.clientX, y: e.clientY, file })
            }
            onFileContextMenuMore={(file, rect) =>
              setCtxMenu({ x: rect.right, y: rect.bottom, file })
            }
            onFilePointerDownForDrag={onFilePointerDownForDrag}
            onFolderPointerDownForDrag={onFolderPointerDownForDrag}
            lastClickedFileRef={lastClickedFileRef}
            scrollParentRef={scrollParentRef}
          />
        )}
        {hasMoreFiles && (
          <div className="py-3 text-center text-xs text-muted-foreground">
            더 불러오는 중...
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
              ? buildFileMenu(ctxMenu.file, fileMenuHandlers)
              : ctxMenu.folder
                ? buildFolderMenu(ctxMenu.folder, folderMenuHandlers)
                : []
          }
          onClose={() => setCtxMenu(null)}
        />
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
