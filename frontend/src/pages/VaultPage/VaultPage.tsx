import AudioPlayer from '@/components/organisms/AudioPlayer/AudioPlayer';
import ImageViewer from '@/components/organisms/ImageViewer/ImageViewer';
import { dispatchVaultFilesChanged } from '@/components/organisms/SidebarStorage/SidebarStorage';
import VideoPlayer from '@/components/organisms/VideoPlayer/VideoPlayer';
import { useVaultFolderStore } from '@/stores/useVaultFolderStore';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  ArrowUpFromLine,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  Loader2,
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

function VaultPage() {
  const { selectedFolderId, setSelectedFolderId } = useVaultFolderStore();
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
          if (uploadingRef.current) return;
          uploadingRef.current = true;
          const paths = [...new Set(event.payload.paths as string[])];
          setUploadError('');
          setUploading(true);
          setUploadProgress({ current: 0, total: paths.length });
          let done = 0;
          Promise.allSettled(
            paths.map((p) =>
              invoke('vault_move_file', {
                sourcePath: p,
                folderId: selectedFolderId || undefined,
              }).then(() => {
                done += 1;
                setUploadProgress((prev) =>
                  prev ? { ...prev, current: done } : null,
                );
              }),
            ),
          )
            .then((results) => {
              const errors = results
                .filter(
                  (r): r is PromiseRejectedResult => r.status === 'rejected',
                )
                .map((r) => r.reason);
              const ok = results.filter((r) => r.status === 'fulfilled').length;
              if (errors.length === 0) {
                setUploadError('');
                if (ok) toast.success(`${ok}개 파일 업로드 완료`);
              } else {
                setUploadError(
                  errors[0] instanceof Error
                    ? errors[0].message
                    : String(errors[0]),
                );
                toast.error(errors[0]?.toString?.() ?? '업로드 실패');
                if (ok) toast.success(`${ok}개 파일 업로드 완료`);
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

  const handleFileDragStart = async (e: React.DragEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (exportingId) return;
    try {
      const tempPath = await invoke<string>('vault_prepare_drag_out', {
        fileId: file.id,
      });
      const { startDrag } = await import('@crabnebula/tauri-plugin-drag');
      await startDrag({ item: [tempPath], icon: tempPath });
      await invoke('vault_confirm_drag_out', { fileId: file.id });
      await load();
      dispatchVaultFilesChanged();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    }
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
                  : '업로드 중...'
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
      {/* 브레드크럼 + 툴바 */}
      <div className="flex-shrink-0 mb-4">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => setSelectedFolderId(null)}
          >
            내 드라이브
          </button>
          {breadcrumb.map((f) => (
            <span key={f.id} className="flex items-center gap-1">
              <span>/</span>
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => setSelectedFolderId(f.id)}
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
                업로드 (이동)
              </>
            )}
          </button>
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
        ) : folders.length === 0 && files.length === 0 && !creating ? (
          <div className="py-16 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            <Folder size={40} className="mx-auto mb-2 opacity-50" />
            <p>이 폴더가 비어 있습니다</p>
            <p className="mt-1 text-xs">
              새 폴더를 만들거나 파일을 업로드하세요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                className="group flex flex-col rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all text-left w-full overflow-hidden"
                onClick={() => setSelectedFolderId(f.id)}
              >
                <div className="flex items-center justify-center aspect-square bg-accent/30 group-hover:bg-accent/50 transition-colors">
                  <Folder size={48} className="text-amber-500" />
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                </div>
              </button>
            ))}
            {files.map((file) => {
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
                  onClick={() => {
                    if (file.file_kind === 'image') setViewerFile(file);
                    else if (file.file_kind === 'audio') setAudioFile(file);
                    else if (file.file_kind === 'video') setVideoFile(file);
                  }}
                  className={`group relative flex flex-col rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all overflow-hidden ${
                    ['image', 'audio', 'video'].includes(file.file_kind)
                      ? 'cursor-pointer'
                      : 'cursor-grab active:cursor-grabbing'
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
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-2">
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        title={file.original_name}
                      >
                        {file.original_name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {sizeLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(file);
                      }}
                      disabled={exportingId === file.id}
                      className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                      title="내보내기"
                    >
                      <ArrowUpFromLine size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
