import { useEffect, type ReactNode } from 'react';
import { useSettings, type Theme } from '@/lib/settings';

const systemTheme = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function applyTheme(theme: Theme) {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme === 'system' ? systemTheme() : theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const theme = useSettings((state) => state.values.theme);
    const reduceMotion = useSettings((state) => state.values.reduceMotion);

    useEffect(() => {
        applyTheme(theme);
        if (theme !== 'system') return;

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const update = () => applyTheme('system');
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, [theme]);

    useEffect(() => {
        document.documentElement.classList.toggle('reduce-motion', reduceMotion);
        return () => document.documentElement.classList.remove('reduce-motion');
    }, [reduceMotion]);

    return children;
}
