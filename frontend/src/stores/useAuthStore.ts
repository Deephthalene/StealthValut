import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const ROLE = {
  AGENT: 'AGENT',
  CENTER_MANAGER: 'CENTER_MANAGER',
  GENERAL_MANAGER: 'GENERAL_MANAGER',
  OPERATOR: 'OPERATOR',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

export const WORK_STATE = {
  WORKING: 'WORKING',
  TIME_OFF: 'TIME_OFF',
  RETIRED: 'RETIRED',
} as const;
export type WorkState = (typeof WORK_STATE)[keyof typeof WORK_STATE];

interface UserAuth {
  userId: string;
  role: Role;
  loginIpAddress: string;
}

export interface UserInfo {
  userId: string;
  name: string;
  employeeNumber: string;
  email: string;
  workState: WorkState;
}

interface AuthState {
  userAuth: UserAuth | null;
  userInfo: UserInfo | null;
  isAuthenticated: boolean;
  login: (userAuth: UserAuth, token: string) => void;
  logout: () => void;
  updateUserInfo: (userInfo: UserInfo | null) => void;
  updateUserAuth: (userAuth: Partial<UserAuth>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userAuth: null,
      userInfo: null,
      isAuthenticated: false,

      login: (userAuth) => {
        set({ userAuth, isAuthenticated: true });
      },

      logout: () => {
        localStorage.removeItem('token');
        set({ userAuth: null, userInfo: null, isAuthenticated: false });
      },

      updateUserInfo: (updatedUserInfo) =>
        set((state) => ({
          userInfo: updatedUserInfo
            ? state.userInfo
              ? { ...state.userInfo, ...updatedUserInfo }
              : updatedUserInfo
            : null,
        })),

      updateUserAuth: (updatedUserAuth) =>
        set((state) => ({
          userAuth: state.userAuth
            ? { ...state.userAuth, ...updatedUserAuth }
            : null,
        })),
    }),
    { name: 'auth-storage' },
  ),
);
