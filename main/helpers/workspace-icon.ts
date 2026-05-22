import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const FAVICON_CANDIDATES = [
    'favicon.svg',
    'favicon.ico',
    'favicon.png',
    'public/favicon.svg',
    'public/favicon.ico',
    'public/favicon.png',
    'app/favicon.ico',
    'app/favicon.png',
    'app/icon.svg',
    'app/icon.png',
    'app/icon.ico',
    'src/favicon.ico',
    'src/favicon.svg',
    'src/app/favicon.ico',
    'src/app/icon.svg',
    'src/app/icon.png',
    'assets/icon.svg',
    'assets/icon.png',
    'assets/logo.svg',
    'assets/logo.png',
    '.idea/icon.svg',
] as const;

const ICON_SOURCE_FILES = [
    'index.html',
    'public/index.html',
    'app/routes/__root.tsx',
    'src/routes/__root.tsx',
    'app/root.tsx',
    'src/root.tsx',
    'src/index.html',
] as const;

const LINK_ICON_HTML_RE =
    /<link\b(?=[^>]*\brel=["'](?:icon|shortcut icon)["'])(?=[^>]*\bhref=["']([^"'?]+))[^>]*>/i;
const LINK_ICON_OBJ_RE =
    /(?=[^}]*\brel\s*:\s*["'](?:icon|shortcut icon)["'])(?=[^}]*\bhref\s*:\s*["']([^"'?]+))[^}]*/i;

export async function findWorkspaceIcon(cwd: string): Promise<string | null> {
    const linkedIcon = await findLinkedIcon(cwd);
    if (linkedIcon) return linkedIcon;

    for (const candidate of FAVICON_CANDIDATES) {
        const icon = await readIcon(path.join(cwd, candidate));
        if (icon) return icon;
    }
    return null;
}

async function findLinkedIcon(cwd: string): Promise<string | null> {
    for (const source of ICON_SOURCE_FILES) {
        const sourceFile = path.join(cwd, source);
        let contents: string;
        try {
            contents = await readFile(sourceFile, 'utf8');
        } catch {
            continue;
        }

        const href =
            contents.match(LINK_ICON_HTML_RE)?.[1] ?? contents.match(LINK_ICON_OBJ_RE)?.[1];
        if (!href) continue;

        for (const file of resolveIconHref(cwd, sourceFile, href)) {
            const icon = await readIcon(file);
            if (icon) return icon;
        }
    }
    return null;
}

function resolveIconHref(cwd: string, sourceFile: string, href: string): string[] {
    if (/^(?:[a-z]+:)?\/\//i.test(href) || href.startsWith('data:')) return [];

    const cleanHref = href.split(/[?#]/, 1)[0];
    if (!cleanHref) return [];

    if (cleanHref.startsWith('/')) {
        const relative = cleanHref.slice(1);
        return [path.join(cwd, 'public', relative), path.join(cwd, relative)];
    }

    return [path.resolve(path.dirname(sourceFile), cleanHref), path.resolve(cwd, cleanHref)];
}

async function readIcon(file: string): Promise<string | null> {
    try {
        const info = await stat(file);
        if (!info.isFile() || info.size > 512 * 1024) return null;
        const data = await readFile(file);
        return `data:${iconMime(file)};base64,${data.toString('base64')}`;
    } catch {
        return null;
    }
}

function iconMime(file: string): string {
    switch (path.extname(file).toLowerCase()) {
        case '.svg':
            return 'image/svg+xml';
        case '.png':
            return 'image/png';
        case '.ico':
            return 'image/x-icon';
        default:
            return 'application/octet-stream';
    }
}
