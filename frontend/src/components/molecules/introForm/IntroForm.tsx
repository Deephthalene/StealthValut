import SidebarFolderTree from '@/components/organisms/SidebarFolderTree/SidebarFolderTree';
import SidebarStorage from '@/components/organisms/SidebarStorage/SidebarStorage';
import { useMenuStore } from '@/stores/useMenuStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useVaultFolderStore } from '@/stores/useVaultFolderStore';
import { useVaultStore } from '@/stores/useVaultStore';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Lock, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Settings,
};

export function IntroForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lock } = useVaultStore();
  const { applyTheme, colorTheme } = useThemeStore();
  const { menuItems } = useMenuStore();
  const { selectedFolderId, setSelectedFolderId } = useVaultFolderStore();
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

  return (
    <div className="h-dvh flex overflow-hidden bg-background text-foreground">
      {/* 사이드바: 고정 폭, 저장공간(상단) + 폴더트리(하단) + 네비 */}
      <aside className="flex flex-col flex-shrink-0 w-48 border-r border-border bg-secondary/50 overflow-hidden">
        <SidebarStorage />
        <div className="flex-1 min-h-0 flex flex-col">
          <SidebarFolderTree
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
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
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* 메인 영역 + 우상단 잠금 버튼 */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative">
        <button
          onClick={lock}
          className="absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title="금고 잠금"
        >
          <Lock size={16} />
          <span>잠금</span>
        </button>
        <div className="flex-1 min-h-0 overflow-auto p-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default IntroForm;
