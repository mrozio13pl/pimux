import os from 'node:os';
import path from 'node:path';

export function getIpcSocketPath(): string {
    if (process.platform === 'win32') return `\\\\.\\pipe\\pimux-${os.userInfo().username}`;

    const runtimeDir = process.env.XDG_RUNTIME_DIR;
    if (runtimeDir) return path.join(runtimeDir, 'pimux.sock');

    return path.join(os.tmpdir(), `pimux-${process.getuid?.() ?? os.userInfo().uid}.sock`);
}

export function isWindowsPipe(socketPath: string): boolean {
    return socketPath.startsWith('\\\\.\\pipe\\');
}
