import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useEffect } from 'react';

// Default to dark theme, persist in localStorage
const themeAtom = atomWithStorage<'light' | 'dark'>('lazy-review-theme', 'dark');

export const useTheme = () => {
  const [theme, setTheme] = useAtom(themeAtom);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return { theme, toggleTheme };
};
