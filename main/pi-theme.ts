import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type ResolvedPiTheme = {
    name: string;
    primary?: string;
    ring?: string;
    selection?: string;
};

type ThemeJson = {
    name?: string;
    vars?: Record<string, string | number>;
    colors?: Record<string, string | number>;
};

const BUILTIN_THEMES: Record<string, ThemeJson> = {
    dark: {
        name: 'dark',
        vars: { accent: '#8abeb7' },
        colors: { accent: 'accent' },
    },
    light: {
        name: 'light',
        vars: { teal: '#5a8080' },
        colors: { accent: 'teal' },
    },
};

export function readPiTheme(cwd?: string): ResolvedPiTheme {
    const name = readConfiguredTheme(cwd) ?? 'dark';
    const theme = readThemeJson(name, cwd) ?? BUILTIN_THEMES[name] ?? BUILTIN_THEMES.dark;
    const primary = resolveColor(theme.colors?.accent, theme.vars);
    return {
        name: theme.name ?? name,
        primary,
        ring: primary ? colorWithAlpha(primary, 0.6) : undefined,
        selection: primary ? colorWithAlpha(primary, 0.25) : undefined,
    };
}

function readConfiguredTheme(cwd?: string): string | undefined {
    return (
        readSettingsTheme(cwd ? join(cwd, '.pi/settings.json') : undefined) ??
        readSettingsTheme(join(homedir(), '.pi/agent/settings.json'))
    );
}

function readSettingsTheme(file: string | undefined): string | undefined {
    if (!file || !existsSync(file)) return undefined;
    try {
        const settings = JSON.parse(readFileSync(file, 'utf8')) as { theme?: unknown };
        return typeof settings.theme === 'string' && settings.theme ? settings.theme : undefined;
    } catch {
        return undefined;
    }
}

function readThemeJson(name: string, cwd?: string): ThemeJson | undefined {
    const candidates = [
        cwd ? join(cwd, '.pi/themes', `${name}.json`) : undefined,
        join(homedir(), '.pi/agent/themes', `${name}.json`),
    ].filter(Boolean) as string[];

    for (const file of candidates) {
        if (!existsSync(file)) continue;
        try {
            return JSON.parse(readFileSync(file, 'utf8')) as ThemeJson;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

function resolveColor(
    value: string | number | undefined,
    vars: Record<string, string | number> | undefined,
    seen = new Set<string>(),
): string | undefined {
    if (typeof value === 'number') return ansi256ToHex(value);
    if (typeof value !== 'string') return undefined;
    if (value === '') return undefined;
    if (value.startsWith('#')) return normalizeHex(value);
    if (seen.has(value)) return undefined;
    seen.add(value);
    return resolveColor(vars?.[value], vars, seen);
}

function normalizeHex(value: string): string | undefined {
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : undefined;
}

export function ansiColorToHex(ansi: string): string | undefined {
    const trueColor = ansi.match(/\u001b\[38;2;(\d+);(\d+);(\d+)m/);
    if (trueColor) {
        return rgbToHex(Number(trueColor[1]), Number(trueColor[2]), Number(trueColor[3]));
    }

    const color256 = ansi.match(/\u001b\[38;5;(\d+)m/);
    if (color256) return ansi256ToHex(Number(color256[1]));
    return undefined;
}

function ansi256ToHex(index: number): string | undefined {
    const basic = [
        '#000000',
        '#800000',
        '#008000',
        '#808000',
        '#000080',
        '#800080',
        '#008080',
        '#c0c0c0',
        '#808080',
        '#ff0000',
        '#00ff00',
        '#ffff00',
        '#0000ff',
        '#ff00ff',
        '#00ffff',
        '#ffffff',
    ];
    if (index < 0 || index > 255) return undefined;
    if (index < 16) return basic[index];
    if (index < 232) {
        const cubeIndex = index - 16;
        const r = Math.floor(cubeIndex / 36);
        const g = Math.floor((cubeIndex % 36) / 6);
        const b = cubeIndex % 6;
        const channel = (value: number) => (value === 0 ? 0 : 55 + value * 40);
        return rgbToHex(channel(r), channel(g), channel(b));
    }
    const gray = 8 + (index - 232) * 10;
    return rgbToHex(gray, gray, gray);
}

export function colorWithAlpha(color: string, alpha: number): string {
    return `${color}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0')}`;
}

function rgbToHex(red: number, green: number, blue: number): string {
    return `#${[red, green, blue]
        .map((channel) =>
            Math.round(Math.min(255, Math.max(0, channel)))
                .toString(16)
                .padStart(2, '0'),
        )
        .join('')}`;
}
