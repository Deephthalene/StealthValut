import { VAULT_FILES_CHANGED } from '@/components/organisms/SidebarStorage/SidebarStorage';
import { invoke } from '@tauri-apps/api/core';
import {
  ChevronRight,
  Folder,
  FolderPlus,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
}

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface SidebarFolderTreeProps {
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
}

export default function SidebarFolderTree({
  selectedFolderId,
  onSelectFolder,
}: SidebarFolderTreeProps) {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isTauriEnv()) return;
    setLoading(true);
    try {
      const list = await invoke<FolderItem[]>('list_all_folders');
      setFolders(list);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onChanged = () => load();
    window.addEventListener(VAULT_FILES_CHANGED, onChanged);
    return () => window.removeEventListener(VAULT_FILES_CHANGED, onChanged);
  }, [load]);

  type TreeNode = { item: FolderItem; children: TreeNode[] };
  const buildTree = (parentId: string | null): TreeNode[] => {
    return folders
      .filter((f) =>
        parentId === null ? !f.parent_id : f.parent_id === parentId,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({
        item,
        children: buildTree(item.id),
      }));
  };

  const handleCreate = async (parentId: string | null) => {
    const name = newName.trim();
    if (!name) {
      setCreating(null);
      setNewName('');
      return;
    }
    try {
      await invoke('create_folder', { name, parentId: parentId || undefined });
      if (parentId) setExpanded((s) => new Set(s).add(parentId));
      setNewName('');
      setCreating(null);
      load();
    } catch {
      // toast 등
    }
  };

  const handleRename = async (id: string) => {
    const name = newName.trim();
    if (!name) {
      setMenuOpen(null);
      setRenaming(null);
      setNewName('');
      return;
    }
    try {
      await invoke('rename_folder', { id, newName: name });
      setMenuOpen(null);
      setRenaming(null);
      setNewName('');
      load();
    } catch {
      //
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 폴더와 하위 항목을 모두 삭제할까요?')) return;
    try {
      await invoke('delete_folder', { id });
      if (selectedFolderId === id) onSelectFolder(null);
      setMenuOpen(null);
      load();
    } catch {
      //
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const toggleExpand = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rootChildren = buildTree(null);

  const renderNode = (nodes: TreeNode[], depth = 0) => {
    return nodes.map(({ item, children }) => {
      const hasChildren = children.length > 0;
      const isExpanded = expanded.has(item.id);
      const isSelected = selectedFolderId === item.id;
      const isMenu = menuOpen === item.id;
      const isCreatingChild = creating === item.id;
      const isRenamingItem = renaming === item.id;

      return (
        <div key={item.id} className="select-none">
          <div
            className={`group flex items-center gap-1 py-1 px-2 rounded-md text-sm cursor-pointer hover:bg-accent/50 ${
              isSelected ? 'bg-accent text-accent-foreground' : ''
            }`}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            onClick={() => !isRenamingItem && onSelectFolder(item.id)}
          >
            <button
              type="button"
              className="p-0.5 -m-0.5 hover:bg-accent rounded"
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) toggleExpand(item.id);
              }}
            >
              <ChevronRight
                size={14}
                className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>
            <Folder size={14} className="flex-shrink-0 text-muted-foreground" />
            {isRenamingItem ? (
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 min-w-0 text-sm py-0 px-1 rounded border border-input bg-background"
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(item.id);
                  if (e.key === 'Escape') {
                    setRenaming(null);
                    setNewName('');
                  }
                }}
              />
            ) : (
              <span className="flex-1 truncate">{item.name}</span>
            )}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
              <button
                type="button"
                className="p-1 rounded hover:bg-background/20"
                title="새 하위 폴더"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreating(item.id);
                }}
              >
                <FolderPlus size={12} />
              </button>
              <button
                type="button"
                className="p-1 rounded hover:bg-background/20"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isMenu) {
                    setMenuOpen(null);
                  } else {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMenuPos({ x: rect.left, y: rect.bottom + 2 });
                    setMenuOpen(item.id);
                  }
                }}
              >
                <MoreVertical size={12} />
              </button>
            </div>
          </div>
          {isCreatingChild && (
            <div
              className="flex items-center gap-1 py-1 px-2 rounded"
              style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="폴더 이름"
                className="flex-1 text-sm py-0.5 px-1.5 rounded border border-input bg-background"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate(item.id);
                  if (e.key === 'Escape') {
                    setCreating(null);
                    setNewName('');
                  }
                }}
              />
            </div>
          )}
          {isExpanded && renderNode(children, depth + 1)}
        </div>
      );
    });
  };

  const menuFolder = menuOpen ? folders.find((f) => f.id === menuOpen) : null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto py-2">
      <div className="px-2 flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">폴더</span>
        <button
          type="button"
          className="p-1 rounded hover:bg-accent"
          title="새 폴더"
          onClick={() => setCreating('root')}
        >
          <FolderPlus size={14} />
        </button>
      </div>

      {creating === 'root' && (
        <div className="px-4 py-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="폴더 이름"
            className="w-full text-sm py-1 px-2 rounded border border-input bg-background"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate(null);
              if (e.key === 'Escape') {
                setCreating(null);
                setNewName('');
              }
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="px-4 py-2 text-xs text-muted-foreground">
          로딩 중...
        </div>
      ) : rootChildren.length === 0 && creating !== 'root' ? (
        <div className="px-4 py-2 text-xs text-muted-foreground">
          폴더가 없습니다. + 버튼으로 추가하세요.
        </div>
      ) : (
        renderNode(rootChildren)
      )}

      {menuOpen && menuFolder && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-popover border border-border rounded-md shadow-lg py-1 min-w-[100px]"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              setNewName(menuFolder.name);
              setMenuOpen(null);
              setRenaming(menuFolder.id);
            }}
          >
            <Pencil size={12} /> 이름 변경
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-destructive/20 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(menuFolder.id);
            }}
          >
            <Trash2 size={12} /> 삭제
          </button>
        </div>
      )}
    </div>
  );
}
