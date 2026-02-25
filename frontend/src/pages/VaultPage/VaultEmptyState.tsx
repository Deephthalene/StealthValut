import { Folder, Search } from 'lucide-react';

interface VaultEmptyStateProps {
  loading: boolean;
  empty: boolean;
  searchQuery: string;
}

export default function VaultEmptyState({
  loading,
  empty,
  searchQuery,
}: VaultEmptyStateProps) {
  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        로딩 중...
      </div>
    );
  }
  if (!empty) return null;
  const q = searchQuery.trim();
  return (
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
  );
}
