import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainEvent } from 'electron';
import { existsSync, statSync, unlinkSync, chmodSync } from 'node:fs';
import net from 'node:net';
import { getIpcSocketPath, isWindowsPipe } from '../shared/ipcSocket';
import type { CliAction, CliRendererResult, CliRequest, CliResponse } from '../shared/cli';

type PendingCommand = {
    request: CliRequest;
    socket: net.Socket;
    timeout: NodeJS.Timeout;
};

const pending = new Map<string, PendingCommand>();
const queued: PendingCommand[] = [];
let rendererReady = false;
let server: net.Server | null = null;

export function startCliServer() {
    if (server) return;
    const socketPath = getIpcSocketPath();
    if (!isWindowsPipe(socketPath)) {
        try {
            unlinkSync(socketPath);
        } catch {
            // ignore missing/stale socket cleanup errors
        }
    }

    server = net.createServer((socket) => {
        let buffer = '';
        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            let newline = buffer.indexOf('\n');
            while (newline >= 0) {
                const line = buffer.slice(0, newline);
                buffer = buffer.slice(newline + 1);
                handleLine(socket, line);
                newline = buffer.indexOf('\n');
            }
        });
    });

    server.listen(socketPath, () => {
        if (!isWindowsPipe(socketPath)) {
            try {
                chmodSync(socketPath, 0o600);
            } catch {
                // best-effort permissions
            }
        }
    });
}

export function installCliIpcHandlers() {
    ipcMain.on('cli:renderer-ready', () => {
        rendererReady = true;
        flushQueue();
    });

    ipcMain.on('cli:command-result', (_event: IpcMainEvent, result: CliRendererResult) => {
        const command = pending.get(result.id);
        if (!command) return;
        pending.delete(result.id);
        clearTimeout(command.timeout);
        writeResponse(
            command.socket,
            result.ok
                ? { id: result.id, ok: true, result: result.result }
                : { id: result.id, ok: false, error: result.error ?? 'Command failed' },
        );
    });
}

function handleLine(socket: net.Socket, line: string) {
    let request: CliRequest;
    try {
        request = JSON.parse(line) as CliRequest;
        validateRequest(request);
    } catch (error) {
        writeResponse(socket, {
            id: 'unknown',
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
        return;
    }

    focusWindow();

    if (request.action.type === 'focusApp') {
        writeResponse(socket, { id: request.id, ok: true });
        return;
    }

    const timeout = setTimeout(() => {
        pending.delete(request.id);
        writeResponse(socket, { id: request.id, ok: false, error: 'Command timed out' });
    }, 10_000);

    const command = { request, socket, timeout };
    pending.set(request.id, command);
    if (rendererReady) dispatch(command);
    else queued.push(command);
}

function flushQueue() {
    while (queued.length > 0) {
        const command = queued.shift();
        if (command && pending.has(command.request.id)) dispatch(command);
    }
}

function dispatch(command: PendingCommand) {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) {
        pending.delete(command.request.id);
        clearTimeout(command.timeout);
        writeResponse(command.socket, {
            id: command.request.id,
            ok: false,
            error: 'No Pimux window available',
        });
        return;
    }
    win.webContents.send('cli:command', command.request);
}

function focusWindow() {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

function validateRequest(request: CliRequest) {
    if (!request || typeof request !== 'object') throw new Error('Invalid request');
    if (typeof request.id !== 'string' || !request.id) throw new Error('Invalid request id');
    validateAction(request.action);
}

function validateAction(action: CliAction) {
    if (!action || typeof action !== 'object') throw new Error('Invalid action');
    if (action.type === 'focusApp') return;
    if (action.type === 'openWorkspace') {
        validateDirectory(action.cwd);
        return;
    }
    if (action.type === 'createTab') {
        if (!['terminal', 'pi', 'scratch', 'browser'].includes(action.kind)) {
            throw new Error(`Invalid tab kind: ${String(action.kind)}`);
        }
        validateDirectory(action.cwd);
        return;
    }
    throw new Error('Unknown action');
}

function validateDirectory(cwd: string) {
    if (typeof cwd !== 'string' || !cwd) throw new Error('Invalid cwd');
    if (!existsSync(cwd) || !statSync(cwd).isDirectory())
        throw new Error(`Not a directory: ${cwd}`);
}

function writeResponse(socket: net.Socket, response: CliResponse) {
    socket.write(`${JSON.stringify(response)}\n`, () => socket.end());
}
