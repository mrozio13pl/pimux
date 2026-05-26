import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const maxBuffer = 50 * 1024 * 1024;

export type DiffSource = 'all' | 'staged' | 'unstaged' | 'pi-session';

export type DiffResult = {
    source: DiffSource;
    isGit: boolean;
    patch: string;
    error?: string;
};

export async function getWorkspaceDiff(input: {
    cwd: string;
    source: DiffSource;
}): Promise<DiffResult> {
    const isGit = await isGitWorkspace(input.cwd);
    if (isGit && input.source !== 'pi-session') {
        return {
            source: input.source,
            isGit,
            patch: await gitDiff(input.cwd, input.source),
        };
    }

    return {
        source: 'pi-session',
        isGit,
        patch: await piSessionPatch(input.cwd),
    };
}

async function isGitWorkspace(cwd: string): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
            cwd,
        });
        return stdout.trim() === 'true';
    } catch {
        return false;
    }
}

async function gitDiff(cwd: string, source: Exclude<DiffSource, 'pi-session'>): Promise<string> {
    const args = ['diff', '--no-ext-diff', '--no-color'];
    if (source === 'all') args.push('HEAD');
    if (source === 'staged') args.push('--cached');
    try {
        const { stdout } = await execFileAsync('git', args, {
            cwd,
            maxBuffer,
        });
        const untracked =
            source === 'all' || source === 'unstaged' ? await gitUntrackedDiff(cwd) : '';
        return [stdout, untracked].filter((chunk) => chunk.trim()).join('\n');
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(detail, { cause: error });
    }
}

async function gitUntrackedDiff(cwd: string): Promise<string> {
    const { stdout } = await execFileAsync(
        'git',
        ['ls-files', '--others', '--exclude-standard', '-z'],
        {
            cwd,
            maxBuffer,
        },
    );
    const files = stdout.split('\0').filter(Boolean);
    const patches: string[] = [];
    for (const file of files) {
        const patch = await gitNoIndexNewFilePatch(cwd, file);
        if (patch.trim()) patches.push(patch);
    }
    return patches.join('\n');
}

async function gitNoIndexNewFilePatch(cwd: string, file: string): Promise<string> {
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['diff', '--no-ext-diff', '--no-color', '--no-index', '--', '/dev/null', file],
            { cwd, maxBuffer },
        );
        return stdout;
    } catch (error) {
        if (isExecErrorWithStdout(error)) return error.stdout;
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(detail, { cause: error });
    }
}

function isExecErrorWithStdout(error: unknown): error is { stdout: string } {
    return isRecord(error) && typeof error.stdout === 'string';
}

async function piSessionPatch(cwd: string): Promise<string> {
    const sessionFiles = await findPiSessionFiles(cwd);
    const chunks: string[] = [];
    for (const file of sessionFiles) chunks.push(...(await patchesFromSessionFile(cwd, file)));
    return chunks.join('\n');
}

async function findPiSessionFiles(cwd: string): Promise<string[]> {
    const root = join(os.homedir(), '.pi', 'agent', 'sessions');
    let dirs: string[] = [];
    try {
        dirs = await readdir(root);
    } catch {
        return [];
    }

    const matches: string[] = [];
    for (const dir of dirs) {
        const fullDir = join(root, dir);
        let entries: string[] = [];
        try {
            if (!(await stat(fullDir)).isDirectory()) continue;
            entries = (await readdir(fullDir)).filter((entry) => entry.endsWith('.jsonl'));
        } catch {
            continue;
        }
        for (const entry of entries) {
            const file = join(fullDir, entry);
            try {
                const firstLine = (await readFile(file, 'utf8')).split('\n', 1)[0];
                const session = JSON.parse(firstLine) as { type?: unknown; cwd?: unknown };
                if (session.type === 'session' && session.cwd === cwd) matches.push(file);
            } catch {
                // Ignore malformed/partial sessions.
            }
        }
    }
    return matches.toSorted();
}

async function patchesFromSessionFile(cwd: string, sessionFile: string): Promise<string[]> {
    const raw = await readFile(sessionFile, 'utf8');
    const toolCalls = new Map<string, { name?: string; arguments?: Record<string, unknown> }>();
    const patches: string[] = [];

    for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        let entry: unknown;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        if (!isRecord(entry) || !isRecord(entry.message)) continue;
        const message = entry.message;
        const content = Array.isArray(message.content) ? message.content : [];
        for (const part of content) {
            if (!isRecord(part) || part.type !== 'toolCall' || typeof part.id !== 'string')
                continue;
            toolCalls.set(part.id, {
                name: typeof part.name === 'string' ? part.name : undefined,
                arguments: isRecord(part.arguments) ? part.arguments : undefined,
            });
        }

        if (message.role !== 'toolResult' || typeof message.toolCallId !== 'string') continue;
        if (message.toolName !== 'edit' && message.toolName !== 'write') continue;
        const diff =
            isRecord(message.details) && typeof message.details.diff === 'string'
                ? message.details.diff
                : null;
        if (!diff) continue;
        const call = toolCalls.get(message.toolCallId);
        const path = readToolPath(call?.arguments);
        if (!path) continue;
        patches.push(toUnifiedPatch(cwd, path, diff));
    }

    return patches;
}

function readToolPath(args: Record<string, unknown> | undefined): string | null {
    if (!args) return null;
    for (const key of ['path', 'file', 'filePath']) {
        const value = args[key];
        if (typeof value === 'string' && value.trim()) return value;
    }
    return null;
}

function toUnifiedPatch(cwd: string, filePath: string, piDiff: string): string {
    const path = filePath.startsWith('/') ? relative(cwd, filePath) : filePath;
    const body = piDiff
        .split('\n')
        .map(toUnifiedLine)
        .filter((line): line is string => line != null)
        .join('\n');
    return [
        `diff --git a/${path} b/${path}`,
        `--- a/${path}`,
        `+++ b/${path}`,
        '@@ -1,999999 +1,999999 @@',
        body,
        '',
    ].join('\n');
}

function toUnifiedLine(line: string): string | null {
    if (/^\s*\.\.\./.test(line)) return null;
    const match = /^([ +-])\s*\d+\s?(.*)$/.exec(line);
    if (match) return `${match[1]}${match[2]}`;
    if (!line.trim()) return ' ';
    return ` ${line}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object';
}
