import { useAuthStore } from '@/stores/useAuthStore';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface UserMenuProps {
  handleLogout: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({ handleLogout }) => {
  const { t } = useTranslation();
  const { userInfo, userAuth } = useAuthStore();
  const displayName = userInfo?.name || userAuth?.userId || t('common.user');

  return (
    <div className="flex items-center gap-3">
      <div className="px-3 py-1 rounded-md bg-gray-100 dark:bg-slate-700 border border-border text-sm text-black dark:text-white">
        {displayName}
      </div>
      <button
        onClick={handleLogout}
        className="px-3 py-1 rounded-md bg-gray-100 dark:bg-slate-700 border border-border text-sm text-black dark:text-white dark:bg-slate-600"
      >
        {t('common.logout')}
      </button>
    </div>
  );
};

export default UserMenu;
