import type { ReactNode } from 'react';
import type { Terminal } from 'ghostty-web';
import type { ViewStatusType } from '@/components/sidebar/view-status';

export const DEFAULT_SOURCE_ID = 'builtin:pi' as const;
export type BuiltinSourceId = 'builtin:pi' | 'builtin:claudecode' | 'builtin:shell';
export type CustomSourceId = `custom:${string}`;
export type SourceId = BuiltinSourceId | CustomSourceId;

export interface SourceExecutionContext {
    cwd: string;
}

export interface SourceViewUpdate {
    title?: string;
    description?: string;
    status?: ViewStatusType;
    sessionId?: string;
    model?: string;
    userSubmitted?: boolean;
}

export type SourceProcessEvent =
    | { type: 'started'; title: string }
    | { type: 'idle' }
    | { type: 'exited' }
    | { type: 'update'; update: SourceViewUpdate };

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
    command?: string;
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
