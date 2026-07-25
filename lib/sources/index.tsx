import { ClaudeCode, OpenCode } from '@lobehub/icons';
import type { ReactNode } from 'react';
import {
    createSource,
    type SourceExecutionContext,
    type SourceId,
    type SourceViewButton,
} from '@/lib/sources/create-source';
import { piSource } from '@/lib/sources/pi';
import { shellSource } from '@/lib/sources/shell';

export * from '@/lib/sources/create-source';

export const SOURCES = [
    piSource,
    createSource({
        id: 'builtin:claudecode',
        title: 'Claude Code',
        icon: <ClaudeCode.Color className="size-4.5" />,
        planned: true,
    }),
    createSource({
        id: 'builtin:opencode',
        title: 'OpenCode',
        icon: <OpenCode />,
        planned: true,
    }),
    shellSource,
] as const;

export type Source = (typeof SOURCES)[number];
export interface ExecutableSource {
    id: SourceId;
    title: string;
    icon: ReactNode;
    experimental: boolean;
    executable: (context: SourceExecutionContext) => { cwd: string; sourceId: SourceId };
    viewButton: SourceViewButton;
}
export type AvailableSource = Source | ExecutableSource;

export const BUILTIN_SOURCES = {
    shell: shellSource,
    pi: piSource,
} as const;
export function getSource(id: string, sources = SOURCES) {
    return sources.find((source) => source.id === id);
}

export function getExecutableSource(id: string): ExecutableSource | undefined {
    const source = getSource(id);
    return source && !('planned' in source) ? source : undefined;
}
