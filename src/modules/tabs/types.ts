import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { Workspace } from '@/modules/workspace/types';

export type BaseWorkspaceTab<K extends string> = {
    id: string;
    kind: K;
    title: string;
    workspaceId: string;
    updatedAt: number;
};

export type TerminalBackedTab<K extends 'terminal' | 'pi'> = BaseWorkspaceTab<K> & {
    scrollback?: string;
};

export type TerminalTab = TerminalBackedTab<'terminal'>;
export type PiTab = TerminalBackedTab<'pi'> & {
    sessionFile?: string;
};

export type ScratchTab = BaseWorkspaceTab<'scratch'> & {
    text: string;
};

export type BrowserTab = BaseWorkspaceTab<'browser'> & {
    url: string;
    favicon?: string;
};

export type WorkspaceTab = TerminalTab | PiTab | ScratchTab | BrowserTab;
export type TabKind = WorkspaceTab['kind'];
export type TerminalBackedTabKind = TerminalBackedTab<TabKind & ('terminal' | 'pi')>['kind'];

export type TabOfKind<K extends TabKind> = Extract<WorkspaceTab, { kind: K }>;
export type UpdateTab = (tab: WorkspaceTab) => void;

export type TabRenderProps<T extends WorkspaceTab = WorkspaceTab> = {
    tab: T;
    workspace: Workspace;
    updateTab: UpdateTab;
};

export type TabDefinition<K extends TabKind = TabKind> = {
    kind: K;
    label: string;
    shortcut?: string;
    Icon: Icon;
    create(workspace: Workspace): TabOfKind<K>;
    render(props: TabRenderProps<TabOfKind<K>>): ReactNode;
};

export function isTerminalBackedTab(tab: WorkspaceTab): tab is TerminalTab | PiTab {
    return tab.kind === 'terminal' || tab.kind === 'pi';
}
