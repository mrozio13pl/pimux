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
    showHotkeyIndicators?: boolean;
    deleteWorkspaceRequest?: { id: string; nonce: number } | null;
    onSelectWorkspace(workspaceId: string): void;
    onWorkspaceOrderChange?(workspaceIds: string[]): void;
    onMoveWorkspace?(activeWorkspaceId: string, overWorkspaceId: string): void;
    onSelectTab(tabId: string): void;
    onCreateWorkspace(): void;
    onAddTab(workspaceId: string, kind: TabKind): void;
    onToggleWorkspacePin(workspaceId: string): void;
    onToggleTabPin(tabId: string): void;
    onMoveTab?(tabId: string, overTabId: string | null, targetWorkspaceId: string): void;
    onRemoveWorkspace(workspaceId: string): void;
    onRemoveTab(tabId: string): void;
};
