import type { Workspace } from '@/modules/workspace/types';
import type { PiStatusEvent } from '../../../shared/events';
import type { TabKind, WorkspaceTab } from '@/modules/tabs/types';

export type SidebarProps = {
    workspaces: Workspace[];
    tabs: WorkspaceTab[];
    activeWorkspaceId: string | null;
    activeTabId: string | null;
    piStatuses: Record<string, PiStatusEvent>;
    homeDir: string | null;
    onSelectWorkspace(workspaceId: string): void;
    onSelectTab(tabId: string): void;
    onCreateWorkspace(): void;
    onAddTab(workspaceId: string, kind: TabKind): void;
};
