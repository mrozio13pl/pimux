#!/usr/bin/env node
import { setTimeout as delay } from 'node:timers/promises';
import { parseCliArgs } from './parse';
import { sendCliAction } from './ipc';
import { launchPimuxApp } from './launch';
import type { CliAction, CliJsonOutput } from '../shared/cli';

function toJsonOutput(action: CliAction): CliJsonOutput {
    if (action.type === 'focusApp') return { ok: true, action: action.type };
    if (action.type === 'openWorkspace') return { ok: true, action: action.type, cwd: action.cwd };
    return { ok: true, action: action.type, kind: action.kind, cwd: action.cwd };
}

function printJson(value: CliJsonOutput) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function sendWithLaunchFallback(action: CliAction) {
    try {
        return await sendCliAction(action);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ECONNREFUSED') throw error;
    }

    launchPimuxApp();
    const deadline = Date.now() + 15_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
        await delay(250);
        try {
            return await sendCliAction(action, { timeoutMs: 2_000 });
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error('Pimux app did not start');
}

async function main() {
    const parsed = parseCliArgs(process.argv.slice(2));
    const response = await sendWithLaunchFallback(parsed.action);
    if (!response.ok) throw new Error(response.error);
    if (parsed.json) printJson(toJsonOutput(parsed.action));
}

main().catch((error) => {
    const json = process.argv.slice(2).includes('--json');
    const message = error instanceof Error ? error.message : String(error);
    if (json) printJson({ ok: false, error: message });
    else process.stderr.write(`${message}\n`);
    process.exit(1);
});
