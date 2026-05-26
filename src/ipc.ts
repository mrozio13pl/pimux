import type { AppEvents } from '../shared/events';
import type { CliRendererResult, CliRequest } from '../shared/cli';
import { createClient, type EventBridge, type Invoke } from '../shared/rpc';
import type { AppRouter } from '../main/router';

export type PimuxBridge = EventBridge<AppEvents> & {
    invoke: Invoke;
    clipboard: {
        readText(): Promise<string>;
        writeText(value: string): Promise<void>;
    };
    cli: {
        onCommand(callback: (request: CliRequest) => void): () => void;
        sendResult(result: CliRendererResult): void;
        ready(): void;
    };
};

export const ipc = createClient<AppRouter>(window.pimux.invoke);
export const events = window.pimux;
