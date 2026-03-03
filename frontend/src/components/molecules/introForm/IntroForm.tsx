import SidebarFolderTree from '@/components/organisms/SidebarFolderTree/SidebarFolderTree';
import SidebarStorage from '@/components/organisms/SidebarStorage/SidebarStorage';
import { useMenuStore } from '@/stores/useMenuStore';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/useThemeStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  useVaultFolderNavigate,
  useVaultFolderStore,
} from '@/stores/useVaultFolderStore';
import { useVaultStore } from '@/stores/useVaultStore';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Lock, Settings } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Settings,
};

export function IntroForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { lock } = useVaultStore();
  const { applyTheme, colorTheme, backgroundImage } = useThemeStore();
  const { menuItems } = useMenuStore();
  const { selectedFolderId } = useVaultFolderStore();
  const onSelectFolderRaw = useVaultFolderNavigate();
  const handleSelectFolder = useCallback(
    (id: string | null) => {
      if (!location.pathname.startsWith('/app/vault')) {
        setSelectedMenu('Vault');
        navigate('/app/vault');
      }
      onSelectFolderRaw(id);
    },
    [location.pathname, navigate, onSelectFolderRaw],
  );
  const [selectedMenu, setSelectedMenu] = useState<string>(
    menuItems.find((m) => m.path && location.pathname.startsWith(m.path))?.id ??
      menuItems[0]?.id ??
      '',
  );

  const selectedBgByTheme: Record<string, string> = {
    blue: 'bg-blue-300 dark:bg-blue-300',
    green: 'bg-emerald-300 dark:bg-emerald-300',
    purple: 'bg-fuchsia-300 dark:bg-fuchsia-300',
    orange: 'bg-orange-300 dark:bg-orange-300',
    rose: 'bg-rose-300 dark:bg-rose-300',
    cyan: 'bg-cyan-300 dark:bg-cyan-300',
  };
  const selectedBgClass = selectedBgByTheme[colorTheme] ?? 'bg-gray-50';

  useEffect(() => {
    applyTheme();
  }, [applyTheme]);

  const resolveMenuId = (pathname: string) => {
    const matchedItem = [...menuItems]
      .filter((item) => item.path)
      .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))
      .find((item) => item.path && pathname.startsWith(item.path));
    return matchedItem?.id ?? menuItems[0]?.id ?? '';
  };

  useEffect(() => {
    const nextMenuId = resolveMenuId(location.pathname);
    if (nextMenuId && nextMenuId !== selectedMenu) {
      setSelectedMenu(nextMenuId);
    }
  }, [location.pathname, menuItems, selectedMenu]);

  const bgImageUrl =
    backgroundImage &&
    (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
      ? convertFileSrc(backgroundImage)
      : backgroundImage.startsWith('http')
        ? backgroundImage
        : '');

  return (
    <div
      className="h-dvh flex overflow-hidden bg-background text-foreground relative"
      style={
        bgImageUrl
          ? {
              backgroundImage: `url(${bgImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      {bgImageUrl && (
        <div
          className="absolute inset-0 bg-background/85 backdrop-blur-[1px] pointer-events-none z-0"
          aria-hidden
        />
      )}
      {/* 사이드바 */}
      <aside className="relative z-10 flex flex-col flex-shrink-0 w-48 border-r border-border bg-secondary/50 overflow-hidden">
        <SidebarStorage />
        <div className="flex-1 min-h-0 flex flex-col">
          <SidebarFolderTree
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
          />
        </div>
        <div className="flex flex-col gap-1 p-2 border-t border-border">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setSelectedMenu(item.id);
                if (item.path) navigate(item.path);
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedMenu === item.id
                  ? selectedBgClass + ' text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {item.icon &&
                (() => {
                  const Icon = iconMap[item.icon];
                  return Icon ? <Icon size={18} /> : null;
                })()}
              <span>{t(item.label)}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="relative z-10 flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-end px-4 py-2 shrink-0">
          <button
            onClick={lock}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title={t('nav.lockVault')}
          >
            <Lock size={14} />
            <span>{t('common.lock')}</span>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default IntroForm;
