import { useVaultStore } from '@/stores/useVaultStore';
import { Lock } from 'lucide-react';

function Header() {
  const { lock } = useVaultStore();

  return (
    <header className="h-16 border-b bg-primary flex items-center px-6">
      <div className="flex items-center justify-between w-full">
        <div className="text-xl font-bold text-primary-foreground whitespace-nowrap">
          StealthVault
        </div>
        <button
          onClick={lock}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-primary-foreground/90 hover:bg-primary-foreground/10 transition-colors"
          title="금고 잠금"
        >
          <Lock size={18} />
          <span className="text-sm font-medium">잠금</span>
        </button>
      </div>
    </header>
  );
}

export default Header;
