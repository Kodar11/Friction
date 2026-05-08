import { useThemeStore } from '../store/themeStore';

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return (
    <button
      className="rounded-full px-3 py-2 text-sm font-medium transition theme-button-hover"
      style={{ backgroundColor: 'var(--button)', color: 'var(--text)' }}
      onClick={toggleTheme}
      aria-label="Toggle theme"
      type="button"
    >
      {theme === 'dark' ? '🌞 Light' : '🌙 Dark'}
    </button>
  );
}
