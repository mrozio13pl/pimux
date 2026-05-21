import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
    existsSync,
    mkdirSync,
    rmSync,
    writeFileSync,
    chmodSync,
    readdirSync,
    statSync,
} from 'node:fs';
import { homedir, platform as osPlatform } from 'node:os';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const electronPackage = require.resolve('electron/package.json');
const electronDir = dirname(electronPackage);
const { version } = require(electronPackage);
const platform =
    process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || osPlatform();
const arch = process.env.ELECTRON_INSTALL_ARCH || process.env.npm_config_arch || process.arch;
const platformPath = getPlatformPath(platform);
const electronBinary = join(electronDir, 'dist', platformPath);
const pathFile = join(electronDir, 'path.txt');

if (existsSync(electronBinary) && existsSync(pathFile)) process.exit(0);

// Electron's installer can leave a half-extracted dist/path.txt-missing install on newer Node/pnpm combos.
// Run it once to ensure the zip exists in cache, then repair by extracting with the system unzipper.
spawnSync(process.execPath, [join(electronDir, 'install.js')], { stdio: 'ignore' });

if (existsSync(electronBinary) && existsSync(pathFile)) process.exit(0);

const zipName = `electron-v${version}-${platform}-${arch}.zip`;
const cacheRoot = process.env.electron_config_cache || join(homedir(), '.cache', 'electron');
const zipPath = findFile(cacheRoot, zipName);

if (!zipPath) {
    console.warn(`[pimux] Electron binary missing and ${zipName} not found in ${cacheRoot}.`);
    console.warn('[pimux] Run: pnpm exec electron/install.js');
    process.exit(0);
}

rmSync(join(electronDir, 'dist'), { recursive: true, force: true });
rmSync(pathFile, { force: true });
mkdirSync(join(electronDir, 'dist'), { recursive: true });

const result = extractZip(zipPath, join(electronDir, 'dist'));
if (result.status !== 0) {
    console.warn(`[pimux] Failed to extract Electron zip: ${zipPath}`);
    if (result.stderr) console.warn(result.stderr.toString());
    process.exit(0);
}

writeFileSync(pathFile, platformPath);
try {
    chmodSync(electronBinary, 0o755);
} catch {
    // Windows/no-op.
}

function getPlatformPath(value) {
    switch (value) {
        case 'mas':
        case 'darwin':
            return 'Electron.app/Contents/MacOS/Electron';
        case 'freebsd':
        case 'openbsd':
        case 'linux':
            return 'electron';
        case 'win32':
            return 'electron.exe';
        default:
            throw new Error(`Electron builds are not available on platform: ${value}`);
    }
}

function findFile(root, name) {
    if (!existsSync(root)) return null;
    const entries = readdirSync(root);
    for (const entry of entries) {
        const path = join(root, entry);
        const stat = statSync(path);
        if (stat.isFile() && entry === name) return path;
        if (stat.isDirectory()) {
            const match = findFile(path, name);
            if (match) return match;
        }
    }
    return null;
}

function extractZip(zipPath, dest) {
    if (process.platform === 'win32') {
        return spawnSync(
            'powershell.exe',
            [
                '-NoProfile',
                '-Command',
                `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(dest)} -Force`,
            ],
            { encoding: 'utf8' },
        );
    }

    return spawnSync('unzip', ['-oq', zipPath, '-d', dest], { encoding: 'utf8' });
}
