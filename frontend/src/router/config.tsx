import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface RouteItem {
  path: string;
  name: string;
  component: LazyExoticComponent<ComponentType<object>>;
  icon?: string;
  title: string;
}

const VaultPage = lazy(() =>
  import('@/pages/VaultPage/VaultPage').then((m) => ({
    default: m.default,
  })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage/SettingsPage').then((m) => ({
    default: m.default,
  })),
);

export const appRoutes: RouteItem[] = [
  {
    path: 'vault',
    name: 'Vault',
    component: VaultPage,
    icon: 'LayoutDashboard',
    title: 'nav.vault',
  },
  {
    path: 'settings',
    name: 'Settings',
    component: SettingsPage,
    icon: 'Settings',
    title: 'nav.settings',
  },
];

const toMenuItem = (
  basePath: string,
  r: RouteItem,
): { id: string; label: string; icon?: string; path: string } => ({
  id: r.name,
  label: r.title,
  icon: r.icon,
  path: `${basePath}/${r.path}`,
});

export interface LayoutConfig {
  basePath: string;
  routes: RouteItem[];
  defaultRedirect: string;
}

export const layoutConfigs: LayoutConfig[] = [
  { basePath: '/app', routes: appRoutes, defaultRedirect: 'vault' },
];

export const appMenuItems = appRoutes.map((r) => toMenuItem('/app', r));
