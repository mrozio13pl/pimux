import { contextBridge, ipcRenderer } from 'electron';
import type { AppEvents } from '../shared/events';
import type { EventBridge, Invoke } from '../shared/rpc';

type PimuxBridge = EventBridge<AppEvents> & {
    invoke: Invoke;
};

const bridge: PimuxBridge = {
    invoke: (path, input) => ipcRenderer.invoke('rpc:call', { path: [...path], input }),
    on: (channel, cb) => {
        const listener = (_event: Electron.IpcRendererEvent, payload: AppEvents[typeof channel]) =>
            cb(payload);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.off(channel, listener);
    },
};

contextBridge.exposeInMainWorld('pimux', bridge);
