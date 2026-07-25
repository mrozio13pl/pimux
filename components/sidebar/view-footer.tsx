import { GitBranchIcon, FolderSimpleIcon } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import useSWR from 'swr';

interface WorkspaceInfo {
    icon: string | null;
    path: string;
    branch: string | null;
    isGit: boolean;
}

function useWorkspace(cwd?: string) {
    return useSWR<WorkspaceInfo>(['workspace-info', cwd ?? null], ([, path]) =>
        invoke('workspace_info', { cwd: path }),
    );
}

export function WorkspaceIcon({ cwd }: { cwd?: string }) {
    const { data: workspace } = useWorkspace(cwd);
    return workspace?.icon ? (
        <img src={workspace.icon} alt="" className="size-4 shrink-0 rounded-sm" />
    ) : (
        <FolderSimpleIcon weight="bold" />
    );
}

export function ViewFooter({ cwd }: { cwd?: string }) {
    const { data: workspace } = useWorkspace(cwd);

    return (
        <div className="flex min-w-0 items-center gap-1 overflow-hidden pt-1 text-xs text-muted-foreground">
            {workspace?.icon ? (
                <img src={workspace.icon} alt="" className="size-4 shrink-0 rounded-sm" />
            ) : (
                <FolderSimpleIcon className="size-4 shrink-0" weight="bold" />
            )}
            <span className="truncate" title={workspace?.path}>
                {workspace?.path ?? cwd}
            </span>
            {workspace?.isGit && (
                <>
                    <GitBranchIcon className="size-4 shrink-0" weight="bold" />
                    {!!workspace.branch && <span className="shrink-0">{workspace.branch}</span>}
                </>
            )}
        </div>
    );
}
