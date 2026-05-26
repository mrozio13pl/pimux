import { clipboard, contextBridge, ipcRenderer } from 'electron';
import type { AppEvents } from '../shared/events';
import type { EventBridge, Invoke } from '../shared/rpc';

type PimuxBridge = EventBridge<AppEvents> & {
    invoke: Invoke;
    clipboard: {
        readText(): Promise<string>;
        writeText(value: string): Promise<void>;
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
    on: (channel, cb) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: AppEvents[typeof channel]) =>
            cb(payload);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.off(channel, listener);
    },
};

contextBridge.exposeInMainWorld('pimux', bridge);
