import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { getIpcSocketPath, isWindowsPipe } from '../shared/ipcSocket';
import type { CliAction, CliRequest, CliResponse } from '../shared/cli';

export type SendOptions = {
    timeoutMs?: number;
};

export async function sendCliAction(
    action: CliAction,
    options: SendOptions = {},
): Promise<CliResponse> {
    const id = randomUUID();
    const request: CliRequest = { id, action };
    const socketPath = getIpcSocketPath();
    const timeoutMs = options.timeoutMs ?? 10_000;

    return new Promise((resolve, reject) => {
        const socket = net.createConnection(socketPath);
        let buffer = '';
        let settled = false;
        const timeout = setTimeout(() => {
            finish(() => reject(new Error(`Pimux app did not respond within ${timeoutMs}ms`)));
        }, timeoutMs);

        function finish(fn: () => void) {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            socket.destroy();
            fn();
        }

        socket.on('connect', () => {
            socket.write(`${JSON.stringify(request)}\n`);
        });

        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            const newline = buffer.indexOf('\n');
            if (newline < 0) return;
            const line = buffer.slice(0, newline);
            try {
                const response = JSON.parse(line) as CliResponse;
                if (response.id !== id) throw new Error('Mismatched response id');
                finish(() => resolve(response));
            } catch (error) {
                finish(() => reject(error));
            }
        });

        socket.on('error', (error: NodeJS.ErrnoException) => {
            if (!isWindowsPipe(socketPath) && error.code === 'ECONNREFUSED') {
                try {
                    unlinkSync(socketPath);
                } catch {
                    // ignore stale socket cleanup errors
                }
            }
            finish(() => reject(error));
        });
    });
}
