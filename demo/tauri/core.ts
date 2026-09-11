import { FIXTURE_VIEWS, FIXTURE_WORKSPACES, transcriptFor } from '../fixtures';

export class Channel<T> {
    onmessage: (message: T) => void = () => {};
}

export function convertFileSrc(path: string) {
    return path;
}

interface SpawnArgs {
    viewId: string;
    cwd: string;
    onData: Channel<number[]>;
    onProcess: Channel<{ type: string }>;
}

const encoder = new TextEncoder();
const spawned = new Set<string>();
const pending = new Set<string>();

function settle() {
    if (pending.size === 0) (window as unknown as { demoReady?: boolean }).demoReady = true;
}

function stream(viewId: string, { onData, onProcess }: SpawnArgs) {
    const chunks = transcriptFor(viewId);
    if (chunks.length === 0) return settle();

    pending.add(viewId);
    (window as unknown as { demoReady?: boolean }).demoReady = false;

    let index = 0;
    const tick = () => {
        if (index >= chunks.length) {
            pending.delete(viewId);
            onProcess.onmessage({ type: 'idle' });
            return settle();
        }
        const { text, delay } = chunks[index++];
        onData.onmessage([...encoder.encode(text)]);
        setTimeout(tick, delay);
    };
    setTimeout(tick, 60);
}

type CommandArgs = Record<string, unknown>;

const commands: Record<string, (args: CommandArgs) => unknown> = {
    views_load: () => FIXTURE_VIEWS,
    views_save: () => undefined,
    workspace_info: ({ cwd }) => FIXTURE_WORKSPACES[(cwd as string | null) ?? ''] ?? FIXTURE_WORKSPACES[''],
    pty_sessions_list: () => [],
    custom_sources_load: () => [],
    lobehub_icons_load: () => undefined,
    sessions_refresh: () => 0,
    sessions_search: () => [],
    directory_children: () => ({ entries: [] }),
    pty_spawn: (args) => {
        const spawn = args as unknown as SpawnArgs;
        if (spawned.has(spawn.viewId)) return;
        spawned.add(spawn.viewId);
        stream(spawn.viewId, spawn);
    },
    pty_write: () => undefined,
    pty_resize: () => undefined,
    pty_detach: () => undefined,
    pty_kill: () => undefined,
};

export function invoke<T>(command: string, args: CommandArgs = {}): Promise<T> {
    const handler = commands[command];
    if (!handler) return Promise.reject(new Error(`demo: unhandled command "${command}"`));
    return Promise.resolve(handler(args) as T);
}
