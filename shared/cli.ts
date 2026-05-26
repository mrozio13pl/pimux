export const CLI_TAB_KINDS = ['terminal', 'pi', 'scratch', 'browser'] as const;

export type CliTabKind = (typeof CLI_TAB_KINDS)[number];

export type CliAction =
    | { type: 'focusApp' }
    | { type: 'openWorkspace'; cwd: string }
    | { type: 'createTab'; kind: CliTabKind; cwd: string };

export type CliRequest = {
    id: string;
    action: CliAction;
};

export type CliResponse =
    | { id: string; ok: true; result?: unknown }
    | { id: string; ok: false; error: string };

export type CliRendererResult = {
    id: string;
    ok: boolean;
    error?: string;
    result?: unknown;
};

export type CliJsonOutput =
    | { ok: true; action: 'focusApp' }
    | { ok: true; action: 'openWorkspace'; cwd: string }
    | { ok: true; action: 'createTab'; kind: CliTabKind; cwd: string }
    | { ok: false; error: string };
