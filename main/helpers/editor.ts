import { shell } from 'electron';
import openEditor from 'open-editor';
import { access } from 'node:fs/promises';
import path from 'node:path';

const EDITOR_CANDIDATES = [
    'cursor',
    'code',
    'windsurf',
    'zed',
    'subl',
    'atom',
    'webstorm',
] as const;

export async function openPathInEditor(filePath: string): Promise<void> {
    const editor = await findEditor();
    if (editor) {
        await openEditor([filePath], { editor });
        return;
    }
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
}

async function findEditor(): Promise<string | undefined> {
    if (process.env.VISUAL) return process.env.VISUAL;
    if (process.env.EDITOR) return process.env.EDITOR;

    for (const candidate of EDITOR_CANDIDATES) {
        const binary = await findOnPath(candidate);
        if (binary) return binary;
    }
    return undefined;
}

async function findOnPath(command: string): Promise<string | undefined> {
    const pathValue = process.env.PATH ?? '';
    const extensions = process.platform === 'win32' ? ['', '.cmd', '.exe', '.bat'] : [''];
    for (const directory of pathValue.split(path.delimiter)) {
        if (!directory) continue;
        for (const extension of extensions) {
            const candidate = path.join(directory, `${command}${extension}`);
            try {
                await access(candidate);
                return candidate;
            } catch {
                // keep looking
            }
        }
    }
    return undefined;
}
