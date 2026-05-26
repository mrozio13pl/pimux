import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import type { Input } from 'electron';
import { join } from 'node:path';
import { attachRpc } from './ipc';
import { installCliIpcHandlers, startCliServer } from './cli-server';
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

function createWindow(): BrowserWindow {
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

    win.webContents.on('before-input-event', (event, input) => {
        const key = nativeHotkeyKey(input);
        if (!key) return;
        win.webContents.send('native:hotkey', { key });
        event.preventDefault();
    });

    installAppMenu(win);

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        win.setMenuBarVisibility(false);
        win.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return win;
}

function installAppMenu(win: BrowserWindow): void {
    const sendTerminalCommand = (command: 'copy' | 'paste' | 'selectAll' | 'find' | 'clear') => {
        if (!win.isDestroyed()) win.webContents.send('terminal:command', { command });
    };
    const terminalAccelerator = (mac: string, other: string) =>
        process.platform === 'darwin' ? mac : other;

    Menu.setApplicationMenu(
        Menu.buildFromTemplate([
            { role: 'appMenu' },
            {
                label: 'Edit',
                submenu: [
                    {
                        label: 'Copy',
                        accelerator: terminalAccelerator('Cmd+C', 'Ctrl+Shift+C'),
                        click: () => sendTerminalCommand('copy'),
                    },
                    {
                        label: 'Paste',
                        accelerator: terminalAccelerator('Cmd+V', 'Ctrl+Shift+V'),
                        click: () => sendTerminalCommand('paste'),
                    },
                    {
                        label: 'Select All',
                        accelerator: terminalAccelerator('Cmd+A', 'Ctrl+Shift+A'),
                        click: () => sendTerminalCommand('selectAll'),
                    },
                    { type: 'separator' },
                    {
                        label: 'Find',
                        accelerator: terminalAccelerator('Cmd+F', 'Ctrl+F'),
                        click: () => sendTerminalCommand('find'),
                    },
                    { type: 'separator' },
                    { label: 'Clear Scrollback', click: () => sendTerminalCommand('clear') },
                ],
            },
            { role: 'viewMenu' },
            { role: 'windowMenu' },
        ]),
    );
}

function nativeHotkeyKey(input: Input): string | null {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return null;
    if (/^[1-9]$/.test(input.key)) return `Control+${input.key}`;
    if (input.key.toLowerCase() === 'w') return input.shift ? 'Control+Shift+w' : 'Control+w';
    return null;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win || win.isDestroyed()) return;
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
    });

    app.whenReady().then(() => {
        attachRpc(ipcMain, router);
        installCliIpcHandlers();
        startCliServer();
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

app.on('window-all-closed', () => {
    killAllTerminals();
    if (process.platform !== 'darwin') app.quit();
});
