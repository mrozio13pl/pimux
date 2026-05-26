import { clipboard, contextBridge, ipcRenderer } from 'electron';
import type { AppEvents } from '../shared/events';
import type { CliRendererResult, CliRequest } from '../shared/cli';
import type { EventBridge, Invoke } from '../shared/rpc';

type PimuxBridge = EventBridge<AppEvents> & {
    invoke: Invoke;
    clipboard: {
        readText(): Promise<string>;
        writeText(value: string): Promise<void>;
    };
    cli: {
        onCommand(callback: (request: CliRequest) => void): () => void;
        sendResult(result: CliRendererResult): void;
        ready(): void;
    };
};

const bridge: PimuxBridge = {
    invoke: (path, input) => ipcRenderer.invoke('rpc:call', { path: [...path], input }),
    clipboard: {
        readText: () => Promise.resolve(clipboard.readText()),
        writeText: (value) => {
            clipboard.writeText(value);
            return Promise.resolve();
        },
    },
    cli: {
        onCommand: (callback) => {
            const listener = (_event: Electron.IpcRendererEvent, request: CliRequest) =>
                callback(request);
            ipcRenderer.on('cli:command', listener);
            return () => ipcRenderer.off('cli:command', listener);
        },
        sendResult: (result) => ipcRenderer.send('cli:command-result', result),
        ready: () => ipcRenderer.send('cli:renderer-ready'),
    },
    on: (channel, cb) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: AppEvents[typeof channel]) =>
            cb(payload);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.off(channel, listener);
    },
};

contextBridge.exposeInMainWorld('pimux', bridge);
