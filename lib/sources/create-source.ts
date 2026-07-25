import type { ReactNode } from 'react';
import type { Terminal } from 'ghostty-web';

export const DEFAULT_SOURCE_ID = 'builtin:pi' as const;
export type BuiltinSourceId = 'builtin:pi' | 'builtin:shell';
export type CustomSourceId = `custom:${string}`;
export type SourceId = BuiltinSourceId | CustomSourceId;

export interface SourceExecutionContext {
    cwd: string;
}

export interface SourceViewUpdate {
    title?: string;
    description?: string;
    status?: 'idle' | 'error' | 'finished' | 'working';
    sessionId?: string;
    userSubmitted?: boolean;
}

export type SourceProcessEvent = { type: 'started'; title: string } | { type: 'idle' } | { type: 'exited' };

export interface SourceTerminalBinding {
    onProcessEvent?: (event: SourceProcessEvent) => void;
    dispose?: () => void;
}

export interface SourceViewButton {
    initial: SourceViewUpdate;
    connect: (terminal: Terminal, update: (patch: SourceViewUpdate) => void) => SourceTerminalBinding | void;
}

export type SourceDefinition<Id extends `${string}:${string}`> = {
    id: Id;
    title: string;
    icon: ReactNode;
} & (
    | {
          experimental: boolean;
          planned?: never;
          executable: (context: SourceExecutionContext) => { cwd: string; sourceId: NoInfer<Id> };
          viewButton: SourceViewButton;
      }
    | {
          planned: true;
          experimental?: never;
          executable?: never;
          viewButton?: never;
      }
);

export function createSource<const Id extends `${string}:${string}`, const Definition extends SourceDefinition<Id>>(
    source: Definition,
) {
    return Object.freeze(source);
}
