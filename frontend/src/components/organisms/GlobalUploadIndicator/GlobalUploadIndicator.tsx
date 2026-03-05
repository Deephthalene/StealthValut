import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUploadStore } from '@/stores/useUploadStore';

export default function GlobalUploadIndicator() {
    const { t } = useTranslation();
    const { isUploading, uploadProgress } = useUploadStore();

    if (!isUploading) return null;

    const percent = uploadProgress
        ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
        : 0;

    return (
        <div className="fixed bottom-4 right-4 z-[100] min-w-[280px] max-w-[360px] bg-card border border-border rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <Loader2 size={20} className="animate-spin text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                    {uploadProgress
                        ? t('vaultModals.uploadingProgress', {
                            current: uploadProgress.current,
                            total: uploadProgress.total,
                        })
                        : t('vaultModals.processing')}
                </p>
                {uploadProgress && (
                    <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-300 rounded-full"
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
