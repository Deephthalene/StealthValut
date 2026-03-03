import { Folder, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        {t('vaultEmpty.loading')}
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
          <p>{t('vaultEmpty.noResults')}</p>
        </>
      ) : (
        <>
          <Folder size={40} className="mx-auto mb-2 opacity-50" />
          <p>{t('vaultEmpty.folderEmpty')}</p>
          <p className="mt-1 text-xs">{t('vaultEmpty.emptyHint')}</p>
          <p className="mt-2 text-xs text-muted-foreground/80">
            {t('vaultEmpty.exportHint')}
          </p>
        </>
      )}
    </div>
  );
}
