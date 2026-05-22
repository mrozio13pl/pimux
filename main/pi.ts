import { app } from 'electron';
import getPort, { portNumbers } from 'get-port';
import dgram from 'node:dgram';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { HandlerContext } from '../shared/rpc';
import { emitEvent } from '../shared/events';
import { ansiColorToHex, colorWithAlpha } from './pi-theme';
import piExtensionSource from '../pi/extension.ts?raw';

let server: dgram.Socket | null = null;
let port: number | null = null;
let ctx: HandlerContext | null = null;

export async function ensurePiStatusServer(nextCtx: HandlerContext): Promise<number> {
    ctx = nextCtx;
    if (server && port != null) return port;

    port = await getPort({ host: '127.0.0.1', port: portNumbers(10_000, 50_000) });
    server = dgram.createSocket('udp4');
    server.on('message', (message) => {
        if (!ctx) return;
        try {
            const event = JSON.parse(message.toString('utf8'));
            if (typeof event.tabId !== 'string') return;
            const timestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now();
            if (typeof event.status === 'string') {
                emitEvent(ctx, 'pi:status', {
                    tabId: event.tabId,
                    status: event.status,
                    detail: typeof event.detail === 'string' ? event.detail : undefined,
                    timestamp,
                });
                return;
            }
            if (typeof event.title === 'string') {
                emitEvent(ctx, 'pi:title', {
                    tabId: event.tabId,
                    title: event.title,
                    timestamp,
                });
                return;
            }
            if (typeof event.sessionFile === 'string') {
                emitEvent(ctx, 'pi:session', {
                    tabId: event.tabId,
                    sessionFile: event.sessionFile,
                    timestamp,
                });
                return;
            }
            if (event.theme && typeof event.theme === 'object') {
                const theme = event.theme as Record<string, unknown>;
                const accentAnsi =
                    typeof theme.accentAnsi === 'string' ? theme.accentAnsi : undefined;
                const primary =
                    typeof theme.primary === 'string'
                        ? theme.primary
                        : accentAnsi
                          ? ansiColorToHex(accentAnsi)
                          : undefined;
                emitEvent(ctx, 'pi:theme', {
                    tabId: event.tabId,
                    name: typeof theme.name === 'string' ? theme.name : undefined,
                    primary,
                    ring:
                        typeof theme.ring === 'string'
                            ? theme.ring
                            : primary
                              ? colorWithAlpha(primary, 0.6)
                              : undefined,
                    selection:
                        typeof theme.selection === 'string'
                            ? theme.selection
                            : primary
                              ? colorWithAlpha(primary, 0.25)
                              : undefined,
                    accentAnsi,
                    colors: isStringRecord(theme.colors) ? theme.colors : undefined,
                    timestamp,
                });
            }
        } catch {
            // Ignore malformed datagrams.
        }
    });

    await new Promise<void>((resolve, reject) => {
        server?.once('error', reject);
        server?.bind(port ?? 0, '127.0.0.1', () => {
            server?.off('error', reject);
            resolve();
        });
    });

    if (port == null) throw new Error('Failed to start pi status server');
    return port;
}

function isStringRecord(value: unknown): value is Record<string, string> {
    return (
        value != null &&
        typeof value === 'object' &&
        Object.values(value).every((entry) => typeof entry === 'string')
    );
}

export function getPiStatusExtensionPath(): string {
    const file = join(app.getPath('userData'), 'pimux-extension.ts');
    mkdirSync(dirname(file), { recursive: true });
    if (!existsSync(file) || readFileSync(file, 'utf8') !== piExtensionSource) {
        writeFileSync(file, piExtensionSource, 'utf8');
    }
    return file;
}
