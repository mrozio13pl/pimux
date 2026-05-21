import { useMemo, useState } from 'react';
import {
    PlusIcon,
    TerminalWindowIcon,
    GlobeIcon,
    NotePencilIcon,
    PiIcon,
} from '@phosphor-icons/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { groupWorkspaces } from './grouping';
import { relativeTime } from './time';
import type { SidebarProps } from './types';
import type { WorkspaceTab } from '@/modules/tabs/types';

export function Sidebar({
    workspaces,
    tabs,
    activeWorkspaceId,
    activeTabId,
    piStatuses,
    homeDir,
    onSelectWorkspace,
    onSelectTab,
    onCreateWorkspace,
}: SidebarProps) {
    const [hoveredWorkspaceId, setHoveredWorkspaceId] = useState<string | null>(null);
    const tabsByWorkspace = useMemo(() => {
        const map = new Map<string, WorkspaceTab[]>();
        for (const tab of tabs) {
            const list = map.get(tab.workspaceId) ?? [];
            list.push(tab);
            map.set(tab.workspaceId, list);
        }
        for (const list of map.values()) list.sort((a, b) => b.updatedAt - a.updatedAt);
        return map;
    }, [tabs]);

    const workspaceLastUsedAt = useMemo(() => {
        const map = new Map<string, number>();
        for (const workspace of workspaces) map.set(workspace.id, workspace.updatedAt);
        for (const tab of tabs) {
            const statusAt = tab.kind === 'pi' ? (piStatuses[tab.id]?.timestamp ?? 0) : 0;
            map.set(
                tab.workspaceId,
                Math.max(map.get(tab.workspaceId) ?? 0, tab.updatedAt, statusAt),
            );
        }
        return map;
    }, [workspaces, tabs, piStatuses]);

    const groups = useMemo(
        () => groupWorkspaces(workspaces, workspaceLastUsedAt),
        [workspaces, workspaceLastUsedAt],
    );

    return (
        <aside className="flex h-full w-full flex-col bg-sidebar">
            <ScrollArea className="min-h-0 flex-1">
                <div className="px-1 py-2">
                    {workspaces.length === 0 ? (
                        <p className="mt-10 px-6 text-center text-xs leading-relaxed text-muted-foreground">
                            No workspaces yet. Bind a project directory to start a session.
                        </p>
                    ) : (
                        groups.map((group) => (
                            <div key={group.key} className="mt-1 first:mt-0">
                                {group.label ? (
                                    <div className="px-3 py-1 text-[11.5px] font-semibold text-muted-foreground">
                                        {group.label}
                                    </div>
                                ) : null}
                                <ul>
                                    {group.workspaces.map((workspace) => {
                                        const active = workspace.id === activeWorkspaceId;
                                        const hovered = hoveredWorkspaceId === workspace.id;
                                        const workspaceTabs =
                                            tabsByWorkspace.get(workspace.id) ?? [];
                                        const activeTabInWorkspace = workspaceTabs.some(
                                            (tab) => tab.id === activeTabId,
                                        );
                                        const showTabs =
                                            hovered || (active && activeTabInWorkspace);
                                        const statusTabs = workspaceTabs.filter(
                                            (tab) => tab.kind === 'pi' && piStatuses[tab.id],
                                        );
                                        return (
                                            <li
                                                key={workspace.id}
                                                onMouseEnter={() =>
                                                    setHoveredWorkspaceId(workspace.id)
                                                }
                                                onMouseLeave={() => setHoveredWorkspaceId(null)}
                                            >
                                                <button
                                                    type="button"
                                                    aria-current={active}
                                                    onClick={() => onSelectWorkspace(workspace.id)}
                                                    className={cn(
                                                        'flex h-8 w-full items-center gap-2 rounded-md pr-3 pl-4 text-left transition-colors',
                                                        active
                                                            ? 'bg-accent text-foreground'
                                                            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                                                    )}
                                                >
                                                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                                                        {workspace.title}
                                                    </span>
                                                    <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground/70">
                                                        {workspaceTabs.length ||
                                                            relativeTime(
                                                                workspaceLastUsedAt.get(
                                                                    workspace.id,
                                                                ) ?? workspace.updatedAt,
                                                            )}
                                                    </span>
                                                </button>

                                                {!showTabs && statusTabs.length > 0 ? (
                                                    <ul className="pb-1">
                                                        {statusTabs.map((tab) => (
                                                            <PiStatusRow
                                                                key={tab.id}
                                                                tab={tab}
                                                                status={piStatuses[tab.id]}
                                                                onSelectTab={onSelectTab}
                                                            />
                                                        ))}
                                                    </ul>
                                                ) : null}

                                                {showTabs && workspaceTabs.length > 0 && (
                                                    <ul className="pb-1">
                                                        {workspaceTabs.map((tab) => {
                                                            const tabActive =
                                                                tab.id === activeTabId;
                                                            const Icon =
                                                                tab.kind === 'pi'
                                                                    ? PiIcon
                                                                    : tab.kind === 'terminal'
                                                                      ? TerminalWindowIcon
                                                                      : tab.kind === 'browser'
                                                                        ? GlobeIcon
                                                                        : NotePencilIcon;
                                                            return (
                                                                <li key={tab.id}>
                                                                    <button
                                                                        type="button"
                                                                        aria-current={tabActive}
                                                                        onClick={() =>
                                                                            onSelectTab(tab.id)
                                                                        }
                                                                        className={cn(
                                                                            'flex h-7 w-full items-center gap-2 rounded-md pr-3 pl-7 text-left transition-colors',
                                                                            tabActive
                                                                                ? 'text-foreground'
                                                                                : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                                                                        )}
                                                                    >
                                                                        <Icon className="size-3.5 shrink-0" />
                                                                        <span className="min-w-0 flex-1 truncate text-[12px]">
                                                                            {tab.title}
                                                                        </span>
                                                                        {tab.kind === 'pi' ? (
                                                                            <StatusLabel
                                                                                status={
                                                                                    piStatuses[
                                                                                        tab.id
                                                                                    ]?.status
                                                                                }
                                                                            />
                                                                        ) : null}
                                                                    </button>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>

            <button
                type="button"
                onClick={onCreateWorkspace}
                className="flex h-9 shrink-0 items-center gap-2 border-t px-4 text-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            >
                <PlusIcon className="size-4" />
                New workspace
            </button>
        </aside>
    );
}

function PiStatusRow({
    tab,
    status,
    onSelectTab,
}: {
    tab: WorkspaceTab;
    status: SidebarProps['piStatuses'][string] | undefined;
    onSelectTab(tabId: string): void;
}) {
    return (
        <li>
            <button
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className="flex h-6 w-full items-center gap-2 rounded-md pr-3 pl-7 text-left text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
            >
                <PiIcon className="size-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[11.5px]">{tab.title}</span>
                <StatusLabel status={status?.status} />
            </button>
        </li>
    );
}

function StatusLabel({ status }: { status: string | undefined }) {
    const presentation = statusPresentation(status);
    if (!presentation) return null;

    return (
        <span
            className={cn(
                'flex shrink-0 items-center gap-1 text-[11px] leading-none',
                presentation.className,
            )}
        >
            <span className="size-1.5 rounded-full bg-current" />
            {presentation.label}
        </span>
    );
}

function statusPresentation(
    status: string | undefined,
): { label: string; className: string } | null {
    switch (status) {
        case 'thinking':
            return { label: 'Working', className: 'text-sky-400' };
        case 'answering':
            return { label: 'Working', className: 'text-sky-400' };
        case 'running-tool':
            return { label: 'Working', className: 'text-sky-400' };
        case 'done':
            return { label: 'Completed', className: 'text-emerald-400' };
        case 'error':
            return { label: 'Error', className: 'text-destructive' };
        case 'exited':
            return { label: 'Exited', className: 'text-muted-foreground' };
        default:
            return null;
    }
}
