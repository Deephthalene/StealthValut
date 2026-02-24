import { useVaultFolderStore } from '@/stores/useVaultFolderStore';
import { invoke } from '@tauri-apps/api/core';
import { Folder, FolderPlus, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
}

function VaultPage() {
  const { selectedFolderId, setSelectedFolderId } = useVaultFolderStore();
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [allFolders, setAllFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    if (!isTauriEnv()) return;
    try {
      const [children, all] = await Promise.all([
        invoke<FolderItem[]>('list_folders', {
          parentId: selectedFolderId || undefined,
        }),
        invoke<FolderItem[]>('list_all_folders'),
      ]);
      setFolders(children);
      setAllFolders(all);
    } catch {
      setFolders([]);
      setAllFolders([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId]);

  useEffect(() => {
    setLoading(true);
    load();
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

  if (!isTauriEnv()) {
    return (
      <div className="p-8 text-destructive">
        Tauri 앱으로 실행해 주세요. (npm run tauri:dev)
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent"
          >
            <Upload size={16} />
            업로드
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
      <div className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            로딩 중...
          </div>
        ) : folders.length === 0 && !creating ? (
          <div className="py-16 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
            <Folder size={40} className="mx-auto mb-2 opacity-50" />
            <p>이 폴더가 비어 있습니다</p>
            <p className="mt-1 text-xs">
              새 폴더를 만들거나 파일을 업로드하세요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:bg-accent/50 text-left w-full"
                onClick={() => setSelectedFolderId(f.id)}
              >
                <Folder size={40} className="text-amber-500" />
                <span className="text-sm font-medium truncate w-full text-center">
                  {f.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default VaultPage;
