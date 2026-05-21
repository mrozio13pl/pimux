import type { Workspace } from '@/modules/workspace/types';

export type WorkspaceGroup = {
    key: 'recent';
    label: string | null;
    workspaces: Workspace[];
};

/**
 * Sidebar is a recency list, not a filesystem tree. Keep one flat group so
 * workspaces do not jump between parent directory sections like `projects` or `/`.
 */
export function groupWorkspaces(
    workspaces: Workspace[],
    workspaceLastUsedAt: ReadonlyMap<string, number> = new Map(),
): WorkspaceGroup[] {
    const lastUsedAt = (workspace: Workspace) =>
        Math.max(workspace.updatedAt, workspaceLastUsedAt.get(workspace.id) ?? 0);
    const sorted = [...workspaces].toSorted((a, b) => lastUsedAt(b) - lastUsedAt(a));
    return [{ key: 'recent', label: null, workspaces: sorted }];
}
