import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function listDirectories(input: {
    cwd: string;
}): Promise<{ cwd: string; entries: { name: string; path: string }[] }> {
    const cwd = path.resolve(input.cwd || os.homedir());
    const entries = await readdir(cwd, { withFileTypes: true });
    return {
        cwd,
        entries: entries
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
            .map((entry) => ({ name: entry.name, path: path.join(cwd, entry.name) }))
            .toSorted((a, b) => a.name.localeCompare(b.name)),
    };
}
