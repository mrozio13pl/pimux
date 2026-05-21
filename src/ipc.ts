import type { AppEvents } from '../shared/events';
import { createClient, type EventBridge, type Invoke } from '../shared/rpc';
import type { AppRouter } from '../main/router';

export type PimuxBridge = EventBridge<AppEvents> & {
    invoke: Invoke;
};

export const ipc = createClient<AppRouter>(window.pimux.invoke);
export const events = window.pimux;
