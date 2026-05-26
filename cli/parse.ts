import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { cli, command } from 'cleye';
import { oneOf } from 'cleye/formats';
import { CLI_TAB_KINDS, type CliAction, type CliTabKind } from '../shared/cli';
import { name, version, description } from '@/package.json' with { type: 'json' };

const TabKind = oneOf(...CLI_TAB_KINDS);

export type ParsedCli = {
    action: CliAction;
    json: boolean;
};

function resolveDirectory(baseCwd: string, value: string): string {
    const cwd = resolve(baseCwd, value);
    let stats;
    try {
        stats = statSync(cwd);
    } catch {
        throw new Error(`Not a directory: ${cwd}`);
    }
    if (!stats.isDirectory()) throw new Error(`Not a directory: ${cwd}`);
    return cwd;
}

export function parseCliArgs(argv: string[], baseCwd = process.cwd()): ParsedCli {
    let action: CliAction | undefined;
    const json = argv.includes('--json');
    const parseArgv = argv.filter((arg) => arg !== '--json');

    const openCommand = command(
        {
            name: 'open',
            parameters: ['[cwd]'],
            flags: { json: Boolean },
            help: { description: 'Open or focus a workspace' },
        },
        (parsed) => {
            action = {
                type: 'openWorkspace',
                cwd: resolveDirectory(baseCwd, parsed._.cwd ?? '.'),
            };
        },
    );

    const tabCommand = command(
        {
            name: 'tab',
            parameters: ['<kind>', '[cwd]'],
            flags: { json: Boolean },
            help: { description: 'Create a tab in a workspace' },
        },
        (parsed) => {
            action = {
                type: 'createTab',
                kind: TabKind(parsed._.kind) as CliTabKind,
                cwd: resolveDirectory(baseCwd, parsed._.cwd ?? '.'),
            };
        },
    );

    const parsed = cli(
        {
            name,
            version,
            parameters: ['[cwd]'],
            commands: [openCommand, tabCommand],
            flags: { json: Boolean },
            strictFlags: true,
            help: {
                description,
                usage: 'pimux [cwd] | pimux <command>',
                examples: [
                    'pimux',
                    'pimux ~/project',
                    'pimux open ~/project',
                    'pimux tab pi ~/project',
                    'pimux tab terminal',
                    'pimux --json open .',
                ],
            },
        },
        undefined,
        parseArgv,
    );

    return {
        action:
            action ??
            (parsed._.cwd
                ? { type: 'openWorkspace', cwd: resolveDirectory(baseCwd, parsed._.cwd) }
                : { type: 'focusApp' }),
        json,
    };
}
