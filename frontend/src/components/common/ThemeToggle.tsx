import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className="p-1.5 border border-border text-muted-foreground hover:text-foreground bg-background hover:bg-accent transition-colors rounded-md"
      title="Toggle Theme"
    >
      {isDark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
};
