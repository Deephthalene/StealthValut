import {
  ArrowDownAZ,
  ArrowDownToLine,
  ArrowUpFromLine,
  Folder,
  FolderInput,
  FolderPlus,
  Loader2,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { FolderItem } from './types';

export type SortKey = 'name' | 'date' | 'size' | 'kind';
export type SortDir = 'asc' | 'desc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: '이름' },
  { key: 'date', label: '날짜' },
  { key: 'size', label: '크기' },
  { key: 'kind', label: '종류' },
];

interface VaultToolbarProps {
  breadcrumb: FolderItem[];
  onNavigate: (folderId: string | null) => void;
  uploadError: string;
  creating: boolean;
  setCreating: (v: boolean) => void;
  newName: string;
  setNewName: (v: string) => void;
  onCreateFolder: () => void;
  onUpload: () => void;
  onFolderUpload: () => void;
  uploading: boolean;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
  sortDir: SortDir;
  setSortDir: (d: SortDir) => void;
  showSortMenu: boolean;
  setShowSortMenu: (v: boolean) => void;
  totalSelected: number;
  selectedFolderCount: number;
  selectedFileCount: number;
  onBulkExport: () => void;
  onBulkDeleteClick: () => void;
  onBulkMove: () => void;
  onClearSelection: () => void;
}

export default function VaultToolbar(props: VaultToolbarProps) {
  const {
    breadcrumb,
    onNavigate,
    uploadError,
    creating,
    setCreating,
    newName,
    setNewName,
    onCreateFolder,
    onUpload,
    onFolderUpload,
    uploading,
    searchQuery,
    setSearchQuery,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    showSortMenu,
    setShowSortMenu,
    totalSelected,
    selectedFolderCount,
    selectedFileCount,
    onBulkExport,
    onBulkDeleteClick,
    onBulkMove,
    onClearSelection,
  } = props;
  const sortRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showSortMenu, setShowSortMenu]);

  return (
    <>
      {totalSelected > 0 && (
        <div className="flex-shrink-0 mb-3 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium">
            {totalSelected}개 선택됨
            {selectedFolderCount > 0 && selectedFileCount > 0 && (
              <span className="text-muted-foreground ml-1 text-xs">
                (폴더 {selectedFolderCount}, 파일 {selectedFileCount})
              </span>
            )}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onBulkMove}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-accent"
          >
            <ArrowDownToLine size={14} />
            이동
          </button>
          <button
            type="button"
            onClick={onBulkExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-accent"
          >
            <ArrowUpFromLine size={14} />
            내보내기
          </button>
          <button
            type="button"
            onClick={onBulkDeleteClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-rose-600 text-white hover:bg-rose-700"
          >
            <Trash2 size={14} />
            삭제
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            선택 해제
          </button>
        </div>
      )}

      <div className="flex-shrink-0 mb-4">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-3 min-w-0 overflow-hidden">
          <button
            type="button"
            className="hover:text-foreground shrink-0"
            onClick={() => onNavigate(null)}
          >
            내 드라이브
          </button>
          {breadcrumb.map((f) => (
            <span key={f.id} className="flex items-center gap-1 min-w-0">
              <span className="shrink-0">/</span>
              <button
                type="button"
                className="hover:text-foreground truncate max-w-[160px]"
                onClick={() => onNavigate(f.id)}
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
            onClick={onUpload}
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
            onClick={onFolderUpload}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent disabled:opacity-50"
          >
            <FolderInput size={16} />
            폴더 업로드
          </button>
          <div className="flex-1" />
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
          <div className="relative" ref={sortRef}>
            <button
              type="button"
              onClick={() => setShowSortMenu(!showSortMenu)}
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
                        setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
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
              if (e.key === 'Enter') onCreateFolder();
              if (e.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
          />
          <button
            type="button"
            className="px-3 py-1 rounded bg-primary text-primary-foreground text-sm"
            onClick={onCreateFolder}
          >
            만들기
          </button>
        </div>
      )}
    </>
  );
}
