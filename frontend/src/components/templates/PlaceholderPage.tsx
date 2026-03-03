import { useTranslation } from 'react-i18next';

export default function PlaceholderPage({ title }: { title?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
      {title ?? t('common.preparing')}
    </div>
  );
}
