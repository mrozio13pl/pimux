import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { attachRpc } from './ipc';
import { killAllTerminals, router } from './router';

if (process.env.PIMUX_DISABLE_GPU === '1') {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-software-rasterizer');
}

if (process.env.PIMUX_NO_SANDBOX === '1') {
    app.commandLine.appendSwitch('no-sandbox');
}

app.commandLine.appendSwitch('disable-dev-shm-usage');

function createWindow(): void {
    const win = new BrowserWindow({
        width: 1320,
        height: 860,
        minWidth: 900,
        minHeight: 560,
        title: 'Pimux',
        backgroundColor: '#0a0a0a',
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webviewTag: true,
        },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        win.setMenuBarVisibility(false);
        win.loadFile(join(__dirname, '../renderer/index.html'));
    }
}

app.whenReady().then(() => {
    attachRpc(ipcMain, router);
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    killAllTerminals();
    if (process.platform !== 'darwin') app.quit();
});
