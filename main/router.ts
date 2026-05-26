import { dialog, shell } from 'electron';
import os from 'node:os';
import { defineRouter, handler, type HandlerContext } from '../shared/rpc';
import { detectTerminalProfile } from './terminal-profile';
import { readPiTheme } from './pi-theme';
import { listDirectories } from './helpers/directories';
import { getWorkspaceDiff, type DiffSource } from './helpers/diffs';
import { openPathInEditor } from './helpers/editor';
import {
    createTerminal,
    killAllTerminals,
    killTerminal,
    resizeTerminal,
    writeTerminal,
} from './helpers/terminal';
import { findWorkspaceIcon } from './helpers/workspace-icon';

export const router = defineRouter({
    dialog: {
        chooseDirectory: handler(async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory', 'createDirectory'],
                title: 'Choose workspace directory',
            });
            return result.canceled ? null : (result.filePaths[0] ?? null);
        }),
    },

    terminal: {
        create: handler(
            (
                input: {
                    tabId: string;
                    workspaceId: string;
                    cwd: string;
                    cols: number;
                    rows: number;
                    mode?: 'shell' | 'pi';
                    piSessionFile?: string;
                },
                ctx: HandlerContext,
            ) => createTerminal(input, ctx),
        ),
        write: handler(writeTerminal),
        resize: handler(resizeTerminal),
        kill: handler(killTerminal),
    },

    system: {
        homeDir: handler(() => ({ home: os.homedir() })),
        terminalProfile: handler(() => detectTerminalProfile()),
        piTheme: handler((input?: { cwd?: string }) => readPiTheme(input?.cwd)),
        openEditor: handler((input: { path: string; line?: number }) =>
            openPathInEditor(input.path, input.line),
        ),
        revealInFileManager: handler(async (input: { path: string }) => {
            await shell.openPath(input.path);
        }),
        workspaceIcon: handler(
            async (input: { cwd: string }): Promise<{ icon: string | null }> => ({
                icon: await findWorkspaceIcon(input.cwd),
            }),
        ),
        listDirectories: handler(listDirectories),
    },

    diffs: {
        get: handler((input: { cwd: string; source: DiffSource }) => getWorkspaceDiff(input)),
    },
});

export type AppRouter = typeof router;
export { killAllTerminals };
