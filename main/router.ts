import { dialog } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as pty from 'node-pty';
import { defineRouter, handler, type HandlerContext } from '../shared/rpc';
import { emitEvent } from '../shared/events';
import { detectTerminalProfile } from './terminal-profile';
import { ensurePiStatusServer, getPiStatusExtensionPath } from './pi';

const terminals = new Map<string, pty.IPty>();

export const router = defineRouter({
    dialog: {
        chooseDirectory: handler(async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory', 'createDirectory'],
                title: 'Choose workspace directory',
            });
            return result.canceled ? null : (result.filePaths[0] ?? null);
        }),
    },

    terminal: {
        create: handler(
            async (
                input: {
                    tabId: string;
                    workspaceId: string;
                    cwd: string;
                    cols: number;
                    rows: number;
                    mode?: 'shell' | 'pi';
                    piSessionFile?: string;
                },
                ctx: HandlerContext,
            ): Promise<{ terminalId: string; created: boolean }> => {
                const existing = terminals.get(input.tabId);
                if (existing) {
                    existing.resize(input.cols, input.rows);
                    return { terminalId: input.tabId, created: false };
                }

                const cwd = input.cwd || os.homedir();
                const shell = getUserShell();
                const piStatusPort =
                    input.mode === 'pi' ? await ensurePiStatusServer(ctx) : undefined;
                const terminalId = input.tabId;
                const term = pty.spawn(shell, getShellArgs(shell), {
                    name: process.env.PIMUX_TERM ?? 'xterm-256color',
                    cols: input.cols,
                    rows: input.rows,
                    cwd,
                    env: getTerminalEnv({
                        cwd,
                        shell,
                        workspaceId: input.workspaceId,
                        tabId: input.tabId,
                        piStatusPort,
                    }),
                    ...(process.platform === 'win32'
                        ? { useConpty: true, conptyInheritCursor: true }
                        : {}),
                });

                terminals.set(terminalId, term);

                if (input.mode === 'pi') term.write(`${getPiLaunchCommand(input.piSessionFile)}\r`);

                term.onData((data) => {
                    emitEvent(ctx, 'terminal:data', { terminalId, data });
                });

                term.onExit(({ exitCode, signal }) => {
                    terminals.delete(terminalId);
                    emitEvent(ctx, 'terminal:exit', { terminalId, exitCode, signal });
                });

                return { terminalId, created: true };
            },
        ),

        write: handler((input: { terminalId: string; data: string }) => {
            terminals.get(input.terminalId)?.write(input.data);
        }),

        resize: handler((input: { terminalId: string; cols: number; rows: number }) => {
            terminals.get(input.terminalId)?.resize(input.cols, input.rows);
        }),

        kill: handler((input: { terminalId: string }) => {
            terminals.get(input.terminalId)?.kill();
            terminals.delete(input.terminalId);
        }),
    },

    system: {
        homeDir: handler(() => ({ home: os.homedir() })),
        terminalProfile: handler(() => detectTerminalProfile()),
        workspaceIcon: handler(
            async (input: { cwd: string }): Promise<{ icon: string | null }> => ({
                icon: await findWorkspaceIcon(input.cwd),
            }),
        ),
    },
});

export type AppRouter = typeof router;

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

async function findWorkspaceIcon(cwd: string): Promise<string | null> {
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

function getUserShell(): string {
    if (process.env.PIMUX_SHELL) return process.env.PIMUX_SHELL;
    if (process.platform === 'win32') return process.env.ComSpec ?? 'powershell.exe';

    const shell = process.env.SHELL || os.userInfo().shell;
    return shell || 'bash';
}

function getShellArgs(shell: string): string[] {
    if (process.env.PIMUX_SHELL_ARGS) return splitArgs(process.env.PIMUX_SHELL_ARGS);
    if (process.platform === 'win32') {
        const name = shellName(shell);
        return name.includes('powershell') || name === 'pwsh' ? ['-NoLogo'] : [];
    }

    const loginSetting = process.env.PIMUX_LOGIN_SHELL;
    const shouldUseLoginShell =
        loginSetting === '1' || (loginSetting !== '0' && process.platform === 'darwin');
    if (!shouldUseLoginShell) return [];

    return /^(bash|zsh|fish)$/.test(shellName(shell)) ? ['-l'] : [];
}

function getTerminalEnv(input: {
    cwd: string;
    shell: string;
    workspaceId: string;
    tabId: string;
    piStatusPort?: number;
}) {
    return {
        ...process.env,
        SHELL: input.shell,
        PWD: input.cwd,
        TERM: process.env.PIMUX_TERM ?? 'xterm-256color',
        COLORTERM: 'truecolor',
        TERM_PROGRAM: 'pimux',
        TERM_PROGRAM_VERSION: '0.1.0',
        LANG: process.env.LANG || 'en_US.UTF-8',
        PIMUX_WORKSPACE_ID: input.workspaceId,
        PIMUX_PI_TAB_ID: input.tabId,
        ...(input.piStatusPort ? { PIMUX_STATUS_PORT: String(input.piStatusPort) } : {}),
    };
}

function getPiLaunchCommand(sessionFile?: string): string {
    const resumeArgs = sessionFile ? ` --session ${shellQuote(sessionFile)}` : '';
    return `pi${resumeArgs} -e ${shellQuote(getPiStatusExtensionPath())}`;
}

function shellQuote(value: string): string {
    if (process.platform === 'win32') return `"${value.replace(/"/g, '\\"')}"`;
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function shellName(shell: string): string {
    return (
        shell
            .split(/[\\/]/)
            .pop()
            ?.toLowerCase()
            .replace(/\.exe$/, '') ?? shell.toLowerCase()
    );
}

function splitArgs(value: string): string[] {
    return (
        value
            .match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
            ?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? []
    );
}

export function killAllTerminals(): void {
    for (const term of terminals.values()) term.kill();
    terminals.clear();
}
