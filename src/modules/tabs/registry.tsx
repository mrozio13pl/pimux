import type { ReactNode } from 'react';
import { GlobeIcon, NotePencilIcon, PiIcon, TerminalWindowIcon } from '@phosphor-icons/react';
import type { Workspace } from '@/modules/workspace/types';
import { BrowserTab } from './builtin/BrowserTab';
import { ScratchTab } from './builtin/ScratchTab';
import { TerminalTab } from './builtin/TerminalTab';
import type { TabDefinition, TabKind, TabOfKind, TabRenderProps, WorkspaceTab } from './types';

export const tabDefinitionsByKind = {
    pi: {
        kind: 'pi',
        label: 'Pi',
        shortcut: 'pi',
        Icon: PiIcon,
        create(workspace: Workspace) {
            return {
                id: crypto.randomUUID(),
                kind: 'pi',
                title: 'Pi',
                workspaceId: workspace.id,
                updatedAt: Date.now(),
            };
        },
        render(props: TabRenderProps<TabOfKind<'pi'>>) {
            return <TerminalTab {...props} />;
        },
    },
    terminal: {
        kind: 'terminal',
        label: 'Shell',
        shortcut: 'PTY',
        Icon: TerminalWindowIcon,
        create(workspace: Workspace) {
            return {
                id: crypto.randomUUID(),
                kind: 'terminal',
                title: 'Shell',
                workspaceId: workspace.id,
                updatedAt: Date.now(),
            };
        },
        render(props: TabRenderProps<TabOfKind<'terminal'>>) {
            return <TerminalTab {...props} />;
        },
    },
    scratch: {
        kind: 'scratch',
        label: 'Scratch',
        shortcut: undefined,
        Icon: NotePencilIcon,
        create(workspace: Workspace) {
            return {
                id: crypto.randomUUID(),
                kind: 'scratch',
                title: 'Scratch',
                workspaceId: workspace.id,
                updatedAt: Date.now(),
                text: '# Scratch\n\nEditor tabs are intentionally tiny for now. Terminal is the first real tool.',
            };
        },
        render(props: TabRenderProps<TabOfKind<'scratch'>>) {
            return <ScratchTab {...props} />;
        },
    },
    browser: {
        kind: 'browser',
        label: 'Browser',
        shortcut: undefined,
        Icon: GlobeIcon,
        create(workspace: Workspace) {
            return {
                id: crypto.randomUUID(),
                kind: 'browser',
                title: 'Browser',
                workspaceId: workspace.id,
                updatedAt: Date.now(),
                url: 'https://example.com',
            };
        },
        render(props: TabRenderProps<TabOfKind<'browser'>>) {
            return <BrowserTab {...props} />;
        },
    },
} satisfies { [K in TabKind]: TabDefinition<K> };

export const tabDefinitions = Object.values(tabDefinitionsByKind);

export function getTabDefinition<K extends TabKind>(kind: K): (typeof tabDefinitionsByKind)[K] {
    return tabDefinitionsByKind[kind];
}

export function createTab<K extends TabKind>(kind: K, workspace: Workspace): TabOfKind<K> {
    return tabDefinitionsByKind[kind].create(workspace) as TabOfKind<K>;
}

export function renderTab(tab: WorkspaceTab, props: Omit<TabRenderProps, 'tab'>): ReactNode {
    switch (tab.kind) {
        case 'pi':
            return tabDefinitionsByKind.pi.render({ ...props, tab });
        case 'terminal':
            return tabDefinitionsByKind.terminal.render({ ...props, tab });
        case 'scratch':
            return tabDefinitionsByKind.scratch.render({ ...props, tab });
        case 'browser':
            return tabDefinitionsByKind.browser.render({ ...props, tab });
    }
}
