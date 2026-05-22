import type { HandlerContext } from './rpc';

export type TerminalEvent = {
    terminalId: string;
};

export type TerminalDataEvent = TerminalEvent & {
    data: string;
};

export type TerminalExitEvent = TerminalEvent & {
    exitCode: number;
    signal?: number;
};

export type PiStatus =
    | 'idle'
    | 'thinking'
    | 'answering'
    | 'running-tool'
    | 'done'
    | 'exited'
    | 'error';

export type PiStatusEvent = {
    tabId: string;
    status: PiStatus;
    detail?: string;
    timestamp: number;
};

export type PiTitleEvent = {
    tabId: string;
    title: string;
    timestamp: number;
};

export type PiSessionEvent = {
    tabId: string;
    sessionFile: string;
    timestamp: number;
};

export type PiThemeEvent = {
    tabId: string;
    name?: string;
    primary?: string;
    ring?: string;
    selection?: string;
    accentAnsi?: string;
    colors?: Record<string, string>;
    timestamp: number;
};

export type NativeHotkeyEvent = {
    key: string;
};

export type AppEvents = {
    'native:hotkey': NativeHotkeyEvent;
    'terminal:data': TerminalDataEvent;
    'terminal:exit': TerminalExitEvent;
    'pi:status': PiStatusEvent;
    'pi:title': PiTitleEvent;
    'pi:session': PiSessionEvent;
    'pi:theme': PiThemeEvent;
};

export function emitEvent<K extends keyof AppEvents>(
    ctx: HandlerContext,
    channel: K,
    payload: AppEvents[K],
): void {
    if (!ctx.sender.isDestroyed()) ctx.sender.send(channel, payload);
}
