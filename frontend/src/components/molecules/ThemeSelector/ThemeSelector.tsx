import { Label } from '@/components/atoms';
import { useThemeStore } from '@/stores/useThemeStore';
import { Moon, Sun } from 'lucide-react';

const COLOR_LIST: {
  id: 'blue' | 'green' | 'purple' | 'orange' | 'rose' | 'cyan';
  hex: string;
}[] = [
  { id: 'blue', hex: '#3B82F6' },
  { id: 'green', hex: '#16A34A' },
  { id: 'purple', hex: '#A855F7' },
  { id: 'orange', hex: '#F97316' },
  { id: 'rose', hex: '#F43F5E' },
  { id: 'cyan', hex: '#06B6D4' },
];

function ThemeSelector() {
  const { mode, colorTheme, setMode, setColorTheme } = useThemeStore();

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
          className="relative w-16 h-8 bg-gray-300 dark:bg-gray-600 rounded-full transition-colors cursor-pointer"
          aria-label="Toggle theme"
        >
          <div
            className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform flex items-center justify-center ${
              mode === 'dark' ? 'translate-x-8' : 'translate-x-0'
            }`}
          >
            {mode === 'light' ? (
              <Sun className="w-4 h-4 text-yellow-500" />
            ) : (
              <Moon className="w-4 h-4 text-blue-400" />
            )}
          </div>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm">Colors</Label>
        <div className="flex items-center gap-2">
          {COLOR_LIST.map((c) => (
            <button
              key={c.id}
              aria-label={c.id}
              title={c.id}
              onClick={() => setColorTheme(c.id)}
              className={`w-6 h-6 rounded-full transition-all focus:outline-none ${
                colorTheme === c.id
                  ? 'ring-1 ring-offset-1 ring-primary'
                  : 'opacity-90'
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ThemeSelector;
