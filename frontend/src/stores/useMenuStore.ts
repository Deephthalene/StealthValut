import { appMenuItems } from '@/router/config';
import { create } from 'zustand';

interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  path?: string;
  children?: MenuItem[];
}

interface MenuState {
  isHovered: boolean;
  activeMenu: string | null;
  activeSubMenu: string | null;
  menuItems: MenuItem[];
  setIsHovered: (isHovered: boolean) => void;
  setActiveMenu: (menuId: string | null) => void;
  setActiveSubMenu: (subMenuId: string | null) => void;
}

export const useMenuStore = create<MenuState>((set) => ({
  isHovered: false,
  activeMenu: null,
  activeSubMenu: null,
  menuItems: appMenuItems,

  setIsHovered: (isHovered) => set({ isHovered }),
  setActiveMenu: (menuId) => set({ activeMenu: menuId, activeSubMenu: null }),
  setActiveSubMenu: (subMenuId) => set({ activeSubMenu: subMenuId }),
}));
