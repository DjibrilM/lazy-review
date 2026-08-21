import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import Visible from "@/components/common/Visible";

export const ThemeToggle = () => {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <button
            onClick={toggleTheme}
            className="p-1.5 border border-border text-muted-foreground hover:text-foreground bg-background hover:bg-accent transition-colors rounded-md"
            title="Toggle Theme"
        >
            <Visible visible={isDark} fallback={<Moon size={14} />}>
                <Sun size={14} />
            </Visible>
        </button>
    );
};
