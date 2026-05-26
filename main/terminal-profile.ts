import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import type { TerminalProfile, TerminalThemeProfile } from '../shared/terminalProfile';

const BUILTIN_PROFILES: Record<string, TerminalProfile> = {
    linux: {
        source: 'linux-default',
        fontFamily:
            "'DejaVu Sans Mono', 'Ubuntu Mono', 'Liberation Mono', 'Noto Sans Mono', monospace",
        fontSize: 14,
        lineHeight: 1,
        theme: {
            background: '#171421',
            foreground: '#d0cfcc',
            cursor: '#d0cfcc',
            cursorAccent: '#171421',
            selectionBackground: '#3a3a3a',
            black: '#171421',
            red: '#c01c28',
            green: '#26a269',
            yellow: '#a2734c',
            blue: '#12488b',
            magenta: '#a347ba',
            cyan: '#2aa1b3',
            white: '#d0cfcc',
            brightBlack: '#5e5c64',
            brightRed: '#f66151',
            brightGreen: '#33d17a',
            brightYellow: '#e9ad0c',
            brightBlue: '#2a7bde',
            brightMagenta: '#c061cb',
            brightCyan: '#33c7de',
            brightWhite: '#ffffff',
        },
    },
    darwin: {
        source: 'macos-terminal-default',
        fontFamily: 'Menlo, Monaco, "SF Mono", "DejaVu Sans Mono", monospace',
        fontSize: 13,
        lineHeight: 1,
        theme: {
            background: '#000000',
            foreground: '#c7c7c7',
            cursor: '#c7c7c7',
            cursorAccent: '#000000',
            selectionBackground: '#4d4d4d',
            black: '#000000',
            red: '#c91b00',
            green: '#00c200',
            yellow: '#c7c400',
            blue: '#0225c7',
            magenta: '#ca30c7',
            cyan: '#00c5c7',
            white: '#c7c7c7',
            brightBlack: '#676767',
            brightRed: '#ff6d67',
            brightGreen: '#5ff967',
            brightYellow: '#fefb67',
            brightBlue: '#6871ff',
            brightMagenta: '#ff76ff',
            brightCyan: '#5ffdff',
            brightWhite: '#ffffff',
        },
    },
    win32: {
        source: 'windows-terminal-default',
        fontFamily: "'Cascadia Mono', Consolas, 'Courier New', monospace",
        fontSize: 14,
        lineHeight: 1,
        theme: {
            background: '#0c0c0c',
            foreground: '#cccccc',
            cursor: '#ffffff',
            cursorAccent: '#0c0c0c',
            selectionBackground: '#264f78',
            black: '#0c0c0c',
            red: '#c50f1f',
            green: '#13a10e',
            yellow: '#c19c00',
            blue: '#0037da',
            magenta: '#881798',
            cyan: '#3a96dd',
            white: '#cccccc',
            brightBlack: '#767676',
            brightRed: '#e74856',
            brightGreen: '#16c60c',
            brightYellow: '#f9f1a5',
            brightBlue: '#3b78ff',
            brightMagenta: '#b4009e',
            brightCyan: '#61d6d6',
            brightWhite: '#f2f2f2',
        },
    },
};

export function detectTerminalProfile(): TerminalProfile {
    const fallback = BUILTIN_PROFILES[platform()] ?? BUILTIN_PROFILES.linux;
    const forced = process.env.PIMUX_TERMINAL_PROFILE?.toLowerCase();
    const detected = detectForced(forced) ?? detectAuto();
    return mergeProfile(fallback, detected ?? { source: `${fallback.source}:fallback` });
}

function detectForced(name: string | undefined): TerminalProfile | null {
    if (!name || name === 'auto') return null;
    if (name === 'ghostty') return detectGhostty();
    if (name === 'kitty') return detectKitty();
    if (name === 'alacritty') return detectAlacritty();
    if (name === 'gnome' || name === 'gnome-terminal') return detectGnomeTerminal();
    if (name === 'windows-terminal' || name === 'wt') return detectWindowsTerminal();
    return null;
}

function detectAuto(): TerminalProfile | null {
    return (
        detectGhostty() ??
        detectKitty() ??
        detectAlacritty() ??
        detectGnomeTerminal() ??
        detectWindowsTerminal()
    );
}

function detectGhostty(): TerminalProfile | null {
    const file = firstExisting([join(homedir(), '.config/ghostty/config')]);
    if (!file) return null;
    const config = parseKeyValue(readFileSync(file, 'utf8'));
    const theme: TerminalThemeProfile = {
        background: color(config.background),
        foreground: color(config.foreground),
        cursor: color(config['cursor-color']),
        selectionBackground: color(config['selection-background']),
    };
    const palette = parseGhosttyPalette(config.palette);
    Object.assign(theme, palette);
    return compactProfile({
        source: `ghostty:${file}`,
        fontFamily: quoteFont(config['font-family'] ?? config.font_family),
        fontSize: number(config['font-size'] ?? config.font_size),
        theme,
    });
}

function detectKitty(): TerminalProfile | null {
    const file = firstExisting([join(homedir(), '.config/kitty/kitty.conf')]);
    if (!file) return null;
    const config = parseKeyValue(readFileSync(file, 'utf8'));
    return compactProfile({
        source: `kitty:${file}`,
        fontFamily: quoteFont(config.font_family),
        fontSize: number(config.font_size),
        theme: {
            background: color(config.background),
            foreground: color(config.foreground),
            cursor: color(config.cursor),
            selectionBackground: color(config.selection_background),
            black: color(config.color0),
            red: color(config.color1),
            green: color(config.color2),
            yellow: color(config.color3),
            blue: color(config.color4),
            magenta: color(config.color5),
            cyan: color(config.color6),
            white: color(config.color7),
            brightBlack: color(config.color8),
            brightRed: color(config.color9),
            brightGreen: color(config.color10),
            brightYellow: color(config.color11),
            brightBlue: color(config.color12),
            brightMagenta: color(config.color13),
            brightCyan: color(config.color14),
            brightWhite: color(config.color15),
        },
    });
}

function detectAlacritty(): TerminalProfile | null {
    const file = firstExisting([
        join(homedir(), '.config/alacritty/alacritty.toml'),
        join(homedir(), '.alacritty.toml'),
        join(homedir(), '.config/alacritty/alacritty.yml'),
        join(homedir(), '.alacritty.yml'),
    ]);
    if (!file) return null;
    const text = readFileSync(file, 'utf8');
    return compactProfile({
        source: `alacritty:${file}`,
        fontFamily: quoteFont(
            matchScalar(text, /family\s*=\s*["']([^"']+)/) ??
                matchScalar(text, /family:\s*["']?([^"'\n]+)/),
        ),
        fontSize: number(
            matchScalar(text, /size\s*=\s*([0-9.]+)/) ?? matchScalar(text, /size:\s*([0-9.]+)/),
        ),
        theme: {
            background: color(
                matchScalar(text, /background\s*=\s*["'](#[0-9a-fA-F]{6})/) ??
                    matchScalar(text, /background:\s*["']?(#[0-9a-fA-F]{6})/),
            ),
            foreground: color(
                matchScalar(text, /foreground\s*=\s*["'](#[0-9a-fA-F]{6})/) ??
                    matchScalar(text, /foreground:\s*["']?(#[0-9a-fA-F]{6})/),
            ),
        },
    });
}

function detectGnomeTerminal(): TerminalProfile | null {
    if (platform() !== 'linux') return null;
    try {
        const profileList = execText('gsettings', [
            'get',
            'org.gnome.Terminal.ProfilesList',
            'default',
        ]);
        const profileId = profileList.match(/'([^']+)'/)?.[1];
        if (!profileId) return null;
        const base = `org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:${profileId}/`;
        const fontEnabled = execText('gsettings', ['get', base, 'use-system-font']).includes(
            'false',
        );
        const font = fontEnabled
            ? stripGVariant(execText('gsettings', ['get', base, 'font']))
            : undefined;
        const background = stripGVariant(execText('gsettings', ['get', base, 'background-color']));
        const foreground = stripGVariant(execText('gsettings', ['get', base, 'foreground-color']));
        return compactProfile({
            source: 'gnome-terminal:gsettings',
            fontFamily: font ? quoteFont(font.replace(/\s+\d+(\.\d+)?$/, '')) : undefined,
            fontSize: number(font?.match(/(\d+(?:\.\d+)?)$/)?.[1]),
            theme: { background: color(background), foreground: color(foreground) },
        });
    } catch {
        return null;
    }
}

function detectWindowsTerminal(): TerminalProfile | null {
    if (platform() !== 'win32') return null;
    const local = process.env.LOCALAPPDATA;
    if (!local) return null;
    const file = firstExisting([
        join(local, 'Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'),
        join(
            local,
            'Packages/Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe/LocalState/settings.json',
        ),
    ]);
    if (!file) return null;
    try {
        const settings = JSON.parse(stripJsonComments(readFileSync(file, 'utf8')));
        const defaults = settings.profiles?.defaults ?? {};
        return compactProfile({
            source: `windows-terminal:${file}`,
            fontFamily: quoteFont(defaults.font?.face),
            fontSize: number(defaults.font?.size),
            theme:
                typeof defaults.colorScheme === 'string'
                    ? windowsScheme(settings, defaults.colorScheme)
                    : undefined,
        });
    } catch {
        return null;
    }
}

function windowsScheme(
    settings: Record<string, unknown>,
    name: string,
): TerminalThemeProfile | undefined {
    const schemes = Array.isArray(settings.schemes) ? settings.schemes : [];
    const scheme = schemes.find((entry) => isRecord(entry) && entry.name === name);
    if (!isRecord(scheme)) return undefined;
    return {
        background: color(scheme.background),
        foreground: color(scheme.foreground),
        cursor: color(scheme.cursorColor),
        black: color(scheme.black),
        red: color(scheme.red),
        green: color(scheme.green),
        yellow: color(scheme.yellow),
        blue: color(scheme.blue),
        magenta: color(scheme.purple),
        cyan: color(scheme.cyan),
        white: color(scheme.white),
        brightBlack: color(scheme.brightBlack),
        brightRed: color(scheme.brightRed),
        brightGreen: color(scheme.brightGreen),
        brightYellow: color(scheme.brightYellow),
        brightBlue: color(scheme.brightBlue),
        brightMagenta: color(scheme.brightPurple),
        brightCyan: color(scheme.brightCyan),
        brightWhite: color(scheme.brightWhite),
    };
}

function mergeProfile(base: TerminalProfile, override: TerminalProfile): TerminalProfile {
    return {
        ...base,
        ...override,
        theme: { ...base.theme, ...override.theme },
        source: override.source,
    };
}

function compactProfile(profile: TerminalProfile): TerminalProfile | null {
    const theme = compactObject(profile.theme ?? {});
    return {
        source: profile.source,
        ...(profile.fontFamily ? { fontFamily: profile.fontFamily } : {}),
        ...(profile.fontSize ? { fontSize: profile.fontSize } : {}),
        ...(profile.lineHeight ? { lineHeight: profile.lineHeight } : {}),
        ...(Object.keys(theme).length > 0 ? { theme } : {}),
    };
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
        Object.entries(value).filter(([, entry]) => entry != null && entry !== ''),
    ) as T;
}

function parseKeyValue(text: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const match =
            line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/) ??
            line.match(/^([A-Za-z0-9_.-]+)\s+(.*)$/);
        if (!match) continue;
        result[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
    return result;
}

function parseGhosttyPalette(value: string | undefined): TerminalThemeProfile {
    if (!value) return {};
    const colors = value
        .split(',')
        .map((entry) => color(entry.trim()))
        .filter(Boolean);
    const keys: Array<keyof TerminalThemeProfile> = [
        'black',
        'red',
        'green',
        'yellow',
        'blue',
        'magenta',
        'cyan',
        'white',
        'brightBlack',
        'brightRed',
        'brightGreen',
        'brightYellow',
        'brightBlue',
        'brightMagenta',
        'brightCyan',
        'brightWhite',
    ];
    return Object.fromEntries(
        keys.map((key, index) => [key, colors[index]]).filter(([, value]) => value),
    ) as TerminalThemeProfile;
}

function color(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    const hex = trimmed.match(/^#?[0-9a-fA-F]{6}$/)?.[0];
    if (hex) return hex.startsWith('#') ? hex : `#${hex}`;
    const rgb = trimmed.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
    if (rgb) return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
    return undefined;
}

function quoteFont(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const font = value.trim().replace(/^['"]|['"]$/g, '');
    if (!font) return undefined;
    const resolved = resolveFontFamily(font);
    return resolved.includes(' ') ? `'${resolved.replace(/'/g, "\\'")}'` : resolved;
}

function resolveFontFamily(font: string): string {
    if (platform() !== 'linux') return font;
    try {
        const resolved = execFileSync('fc-match', ['-f', '%{family[0]}', font], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return resolved || font;
    } catch {
        return font;
    }
}

function number(value: unknown): number | undefined {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : undefined;
}

function firstExisting(paths: string[]): string | null {
    return paths.find((path) => existsSync(path)) ?? null;
}

function execText(command: string, args: string[]): string {
    return execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
}

function stripGVariant(value: string): string {
    return value.trim().replace(/^['"]|['"]$/g, '');
}

function stripJsonComments(value: string): string {
    return value.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function matchScalar(text: string, regex: RegExp): string | undefined {
    return text.match(regex)?.[1]?.trim();
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object';
}
