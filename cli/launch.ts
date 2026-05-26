import { accessSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function canExecute(path: string): boolean {
    try {
        accessSync(path, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

function projectRoot(): string {
    const cwdPackage = join(process.cwd(), 'package.json');
    try {
        accessSync(cwdPackage, constants.R_OK);
        return process.cwd();
    } catch {
        return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    }
}

export function launchPimuxApp(): void {
    const explicit = process.env.PIMUX_APP_PATH;
    if (explicit) {
        spawn(explicit, [], { detached: true, stdio: 'ignore' }).unref();
        return;
    }

    const root = projectRoot();
    const devPackage = join(root, 'package.json');
    try {
        accessSync(devPackage, constants.R_OK);
        spawn('pnpm', ['dev'], {
            cwd: root,
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, PIMUX_CLI_LAUNCHED: '1' },
        }).unref();
        return;
    } catch {
        // not a source checkout
    }

    const candidates = [
        join(dirname(process.execPath), 'Pimux'),
        join(dirname(process.execPath), 'pimux-app'),
        '/usr/bin/pimux-app',
        '/opt/Pimux/pimux',
    ];
    const app = candidates.find(canExecute);
    if (!app)
        throw new Error('Could not find Pimux app. Set PIMUX_APP_PATH to the app executable.');
    spawn(app, [], { detached: true, stdio: 'ignore' }).unref();
}
