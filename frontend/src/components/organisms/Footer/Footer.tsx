import { ThemeSelector } from '@/components/molecules';

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="flex-shrink-0 h-14 border-t bg-background flex items-center px-4 shadow-md">
      <div className="flex items-center justify-between w-full gap-4">
        <div className="text-sm text-muted-foreground">
          © {currentYear} StealthVault. All rights reserved.
        </div>
        <ThemeSelector />
      </div>
    </footer>
  );
}

export default Footer;
