import { formatHex, parse, wcagContrast } from 'culori';

export function searchDecorations() {
    const primary = cssColorToHex(cssVar('--primary'), '#e8b45b');
    const secondary = cssColorToHex(cssVar('--secondary'), '#3a3328');

    return {
        matchBackground: secondary,
        matchOverviewRuler: primary,
        activeMatchBackground: primary,
        activeMatchColorOverviewRuler: primary,
        activeMatchForeground: readableForeground(primary),
    };
}

function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function cssColorToHex(value: string, fallback: string): string {
    const color = parse(value.trim());
    return color ? formatHex(color) : fallback;
}

function readableForeground(background: string): string {
    return wcagContrast(background, '#000000') >= wcagContrast(background, '#ffffff')
        ? '#000000'
        : '#ffffff';
}
