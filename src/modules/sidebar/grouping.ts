import type { Workspace } from '@/modules/workspace/types';

export type ProjectSortMode = 'last-used' | 'created' | 'manual';
export type ProjectGroupMode = 'separate' | 'repository' | 'repository-path';

export type WorkspaceGroup = {
    key: string;
    label: string | null;
    workspaces: Workspace[];
};

export function groupWorkspaces(
    workspaces: Workspace[],
    workspaceLastUsedAt: ReadonlyMap<string, number> = new Map(),
    options: {
        sortMode?: ProjectSortMode;
        groupMode?: ProjectGroupMode;
        homeDir?: string | null;
    } = {},
): WorkspaceGroup[] {
    const sortMode = options.sortMode ?? 'last-used';
    const groupMode = options.groupMode ?? 'separate';
    const sorted = sortWorkspaces(workspaces, workspaceLastUsedAt, sortMode);

    if (groupMode === 'separate') return [{ key: 'all', label: null, workspaces: sorted }];

    const groups = new Map<string, WorkspaceGroup>();
    for (const workspace of sorted) {
        const label =
            groupMode === 'repository'
                ? repositoryLabel(workspace)
                : repositoryPathLabel(workspace, options.homeDir);
        const key = label || 'Other';
        const group = groups.get(key) ?? { key, label: key, workspaces: [] };
        group.workspaces.push(workspace);
        groups.set(key, group);
    }

    return [...groups.values()];
}

function sortWorkspaces(
    workspaces: Workspace[],
    workspaceLastUsedAt: ReadonlyMap<string, number>,
    sortMode: ProjectSortMode,
): Workspace[] {
    const lastUsedAt = (workspace: Workspace) =>
        Math.max(workspace.updatedAt, workspaceLastUsedAt.get(workspace.id) ?? 0);
    const pinnedFirst = (a: Workspace, b: Workspace) =>
        Number(b.pinned === true) - Number(a.pinned === true);

    switch (sortMode) {
        case 'created':
            return [...workspaces].toSorted((a, b) => pinnedFirst(a, b) || b.createdAt - a.createdAt);
        case 'manual':
            return [...workspaces].toSorted(pinnedFirst);
        case 'last-used':
        default:
            return [...workspaces].toSorted(
                (a, b) => pinnedFirst(a, b) || lastUsedAt(b) - lastUsedAt(a),
            );
    }
}

function repositoryLabel(workspace: Workspace): string {
    return basename(dirname(workspace.cwd)) || basename(workspace.cwd) || workspace.cwd;
}

function repositoryPathLabel(workspace: Workspace, homeDir: string | null | undefined): string {
    const parent = dirname(workspace.cwd);
    if (!homeDir) return parent;
    const normalizedHome = normalizePath(homeDir);
    const normalizedParent = normalizePath(parent);
    if (normalizedParent === normalizedHome) return '~';
    if (normalizedParent.startsWith(`${normalizedHome}/`)) {
        return `~/${normalizedParent.slice(normalizedHome.length + 1)}`;
    }
    return parent;
}

function dirname(value: string): string {
    const normalized = normalizePath(value).replace(/\/$/, '');
    const index = normalized.lastIndexOf('/');
    if (index <= 0) return normalized.startsWith('/') ? '/' : '';
    return normalized.slice(0, index);
}

function basename(value: string): string {
    const normalized = normalizePath(value).replace(/\/$/, '');
    const index = normalized.lastIndexOf('/');
    return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function normalizePath(value: string): string {
    return value.replace(/\\/g, '/');
}
