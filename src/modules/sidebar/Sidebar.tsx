import { useEffect, useMemo, useState } from 'react';
import {
    CodeIcon,
    CopyIcon,
    FolderIcon,
    FolderOpenIcon,
    FolderPlusIcon,
    GlobeIcon,
    NotePencilIcon,
    PiIcon,
    PlusIcon,
    PushPinIcon,
    PushPinSlashIcon,
    SlidersHorizontalIcon,
    TerminalWindowIcon,
    TextTIcon,
    TrashIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn, copyText } from '@/lib/utils';
import { ipc } from '@/ipc';
import { groupWorkspaces, type ProjectGroupMode, type ProjectSortMode } from './grouping';
import { relativeTime } from './time';
import type { SidebarProps } from './types';
import { tabDefinitions } from '@/modules/tabs/registry';
import type { BrowserTab, TabKind, WorkspaceTab } from '@/modules/tabs/types';

type TabSortMode = 'last-used' | 'created';
type DeleteTarget =
    | { kind: 'workspace'; id: string; title: string }
    | { kind: 'tab'; id: string; title: string };

type SidebarSettings = {
    projectSort: ProjectSortMode;
    tabSort: TabSortMode;
    visibleTabs: number;
    projectGroup: ProjectGroupMode;
};

const SIDEBAR_SETTINGS_KEY = 'pimux:sidebar-settings';
const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = {
    projectSort: 'last-used',
    tabSort: 'last-used',
    visibleTabs: 3,
    projectGroup: 'separate',
};

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
    onAddTab,
    onToggleWorkspacePin,
    onToggleTabPin,
    onRemoveWorkspace,
    onRemoveTab,
}: SidebarProps) {
    const [hoveredWorkspaceId, setHoveredWorkspaceId] = useState<string | null>(null);
    const [openWorkspaceIds, setOpenWorkspaceIds] = useState<string[]>(() =>
        activeWorkspaceId ? [activeWorkspaceId] : [],
    );
    const [workspaceIcons, setWorkspaceIcons] = useState<Record<string, string | null>>({});
    const [settings, setSettings] = useState<SidebarSettings>(() => loadSidebarSettings());
    const [expandedTabWorkspaceIds, setExpandedTabWorkspaceIds] = useState<Set<string>>(
        () => new Set(),
    );
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

    const tabsByWorkspace = useMemo(() => {
        const tabIndex = new Map(tabs.map((tab, index) => [tab.id, index]));
        const map = new Map<string, WorkspaceTab[]>();
        for (const tab of tabs) {
            const list = map.get(tab.workspaceId) ?? [];
            list.push(tab);
            map.set(tab.workspaceId, list);
        }
        for (const list of map.values()) {
            list.sort((a, b) => {
                const pinned = Number(b.pinned === true) - Number(a.pinned === true);
                if (pinned !== 0) return pinned;
                return settings.tabSort === 'last-used'
                    ? b.updatedAt - a.updatedAt
                    : (tabIndex.get(a.id) ?? 0) - (tabIndex.get(b.id) ?? 0);
            });
        }
        return map;
    }, [tabs, settings.tabSort]);

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
        () =>
            groupWorkspaces(workspaces, workspaceLastUsedAt, {
                sortMode: settings.projectSort,
                groupMode: settings.projectGroup,
                homeDir,
            }),
        [workspaces, workspaceLastUsedAt, settings.projectSort, settings.projectGroup, homeDir],
    );

    useEffect(() => {
        localStorage.setItem(SIDEBAR_SETTINGS_KEY, JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        if (!activeWorkspaceId) return;
        setOpenWorkspaceIds((current) =>
            current.includes(activeWorkspaceId) ? current : [...current, activeWorkspaceId],
        );
    }, [activeWorkspaceId]);

    useEffect(() => {
        let cancelled = false;
        const missing = workspaces.filter((workspace) => !(workspace.id in workspaceIcons));
        if (missing.length === 0) return;

        void Promise.all(
            missing.map(async (workspace) => {
                try {
                    const result = await ipc.system.workspaceIcon({ cwd: workspace.cwd });
                    return [workspace.id, result.icon] as const;
                } catch {
                    return [workspace.id, null] as const;
                }
            }),
        ).then((entries) => {
            if (cancelled) return;
            setWorkspaceIcons((current) => ({ ...current, ...Object.fromEntries(entries) }));
        });

        return () => {
            cancelled = true;
        };
    }, [workspaces, workspaceIcons]);

    return (
        <>
            <aside className="flex h-full w-full flex-col bg-sidebar">
                <ScrollArea className="min-h-0 flex-1 px-1 py-2">
                    <div className="mx-2 my-1 flex items-center justify-between">
                        <h1 className="text-xs font-medium tracking-wider text-muted-foreground/60 uppercase">
                            Projects
                        </h1>
                        <div className="flex items-center gap-0.5">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="size-7 text-muted-foreground hover:text-foreground"
                                onClick={onCreateWorkspace}
                            >
                                <FolderPlusIcon />
                                <span className="sr-only">New workspace</span>
                            </Button>
                            <SidebarSettingsMenu settings={settings} onChange={setSettings} />
                        </div>
                    </div>
                    <div>
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
                                    <Accordion
                                        multiple
                                        value={openWorkspaceIds}
                                        onValueChange={(value) => setOpenWorkspaceIds(value)}
                                        className="w-full gap-0 overflow-visible rounded-none border-0 bg-transparent"
                                    >
                                        {group.workspaces.map((workspace) => {
                                            const active = workspace.id === activeWorkspaceId;
                                            const hovered = hoveredWorkspaceId === workspace.id;
                                            const open = openWorkspaceIds.includes(workspace.id);
                                            const workspaceTabs =
                                                tabsByWorkspace.get(workspace.id) ?? [];
                                            const tabsExpanded = expandedTabWorkspaceIds.has(
                                                workspace.id,
                                            );
                                            const visibleTabs = tabsExpanded
                                                ? workspaceTabs
                                                : workspaceTabs.slice(0, settings.visibleTabs);
                                            const hiddenTabCount = Math.max(
                                                0,
                                                workspaceTabs.length - visibleTabs.length,
                                            );
                                            const workspaceStatus = firstVisibleStatus(
                                                workspaceTabs,
                                                piStatuses,
                                            );
                                            const lastUsedAt =
                                                workspaceLastUsedAt.get(workspace.id) ??
                                                workspace.updatedAt;
                                            const showAddTab = hovered;
                                            const showSummary = !hovered && !open;

                                            return (
                                                <AccordionItem
                                                    key={workspace.id}
                                                    value={workspace.id}
                                                    onMouseEnter={() =>
                                                        setHoveredWorkspaceId(workspace.id)
                                                    }
                                                    onMouseLeave={() => setHoveredWorkspaceId(null)}
                                                    className="w-full border-0 bg-transparent not-last:border-b-0 data-open:bg-transparent"
                                                >
                                                    <ContextMenu>
                                                        <ContextMenuTrigger
                                                            render={
                                                                <div
                                                                    className={cn(
                                                                        'flex h-8 w-full items-center gap-1 rounded-md pr-2 transition-colors',
                                                                        active
                                                                            ? 'bg-accent text-foreground'
                                                                            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                                                                    )}
                                                                />
                                                            }
                                                        >
                                                            <AccordionTrigger className="h-6 w-6 flex-none items-center justify-center gap-0 rounded-sm p-0 text-muted-foreground no-underline hover:bg-accent/50 hover:no-underline **:data-[slot=accordion-trigger-icon]:size-3.5">
                                                                <span className="sr-only">
                                                                    Toggle workspace
                                                                </span>
                                                            </AccordionTrigger>
                                                            <button
                                                                type="button"
                                                                aria-current={active}
                                                                onClick={() =>
                                                                    onSelectWorkspace(workspace.id)
                                                                }
                                                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                                            >
                                                                <WorkspaceIcon
                                                                    src={
                                                                        workspaceIcons[workspace.id]
                                                                    }
                                                                />
                                                                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                                                                    {workspace.title}
                                                                </span>
                                                                {workspace.pinned ? (
                                                                    <PushPinIcon className="size-3 shrink-0" />
                                                                ) : null}
                                                                {showSummary ? (
                                                                    workspaceStatus ? (
                                                                        <StatusLabel
                                                                            status={
                                                                                workspaceStatus.status
                                                                            }
                                                                        />
                                                                    ) : (
                                                                        <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground/70">
                                                                            {workspaceTabs.length
                                                                                ? workspaceTabs.length +
                                                                                  ' tabs'
                                                                                : relativeTime(
                                                                                      lastUsedAt,
                                                                                  )}
                                                                        </span>
                                                                    )
                                                                ) : null}
                                                            </button>
                                                            {showAddTab ? (
                                                                <AddTabMenu
                                                                    onAddTab={(kind) =>
                                                                        onAddTab(workspace.id, kind)
                                                                    }
                                                                />
                                                            ) : null}
                                                        </ContextMenuTrigger>
                                                        <WorkspaceContextMenuContent
                                                            workspace={workspace}
                                                            onTogglePin={() =>
                                                                onToggleWorkspacePin(workspace.id)
                                                            }
                                                            onDelete={() =>
                                                                setDeleteTarget({
                                                                    kind: 'workspace',
                                                                    id: workspace.id,
                                                                    title: workspace.title,
                                                                })
                                                            }
                                                        />
                                                    </ContextMenu>
                                                    <AccordionContent className="w-full pb-1">
                                                        {workspaceTabs.length > 0 ? (
                                                            <ul className="flex flex-col gap-0.5">
                                                                {visibleTabs.map((tab) => (
                                                                    <TabRow
                                                                        key={tab.id}
                                                                        tab={tab}
                                                                        active={
                                                                            tab.id === activeTabId
                                                                        }
                                                                        status={piStatuses[tab.id]}
                                                                        workspace={workspace}
                                                                        onSelectTab={onSelectTab}
                                                                        onTogglePin={() =>
                                                                            onToggleTabPin(tab.id)
                                                                        }
                                                                        onDelete={() => {
                                                                            if (
                                                                                shouldConfirmTabDelete(
                                                                                    tab,
                                                                                    piStatuses[
                                                                                        tab.id
                                                                                    ],
                                                                                )
                                                                            ) {
                                                                                setDeleteTarget({
                                                                                    kind: 'tab',
                                                                                    id: tab.id,
                                                                                    title: tab.title,
                                                                                });
                                                                                return;
                                                                            }
                                                                            onRemoveTab(tab.id);
                                                                        }}
                                                                    />
                                                                ))}
                                                                {hiddenTabCount > 0 ? (
                                                                    <li>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                setExpandedTabWorkspaceIds(
                                                                                    (current) => {
                                                                                        const next =
                                                                                            new Set(
                                                                                                current,
                                                                                            );
                                                                                        next.add(
                                                                                            workspace.id,
                                                                                        );
                                                                                        return next;
                                                                                    },
                                                                                )
                                                                            }
                                                                            className="flex h-7 w-full items-center rounded-md px-7 text-left text-[11.5px] text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
                                                                        >
                                                                            +{hiddenTabCount} more
                                                                        </button>
                                                                    </li>
                                                                ) : null}
                                                            </ul>
                                                        ) : (
                                                            <p className="px-3 py-1 text-[11.5px] text-muted-foreground">
                                                                No tabs
                                                            </p>
                                                        )}
                                                    </AccordionContent>
                                                </AccordionItem>
                                            );
                                        })}
                                    </Accordion>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </aside>
            <DeleteConfirmDialog
                target={deleteTarget}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
                onConfirm={() => {
                    if (!deleteTarget) return;
                    if (deleteTarget.kind === 'workspace') onRemoveWorkspace(deleteTarget.id);
                    else onRemoveTab(deleteTarget.id);
                    setDeleteTarget(null);
                }}
            />
        </>
    );
}

function loadSidebarSettings(): SidebarSettings {
    try {
        const raw = localStorage.getItem(SIDEBAR_SETTINGS_KEY);
        if (!raw) return DEFAULT_SIDEBAR_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<SidebarSettings>;
        return {
            projectSort: isProjectSortMode(parsed.projectSort)
                ? parsed.projectSort
                : DEFAULT_SIDEBAR_SETTINGS.projectSort,
            tabSort: isTabSortMode(parsed.tabSort)
                ? parsed.tabSort
                : isTabSortMode((parsed as { threadSort?: unknown }).threadSort)
                  ? (parsed as { threadSort: TabSortMode }).threadSort
                  : DEFAULT_SIDEBAR_SETTINGS.tabSort,
            visibleTabs:
                typeof parsed.visibleTabs === 'number'
                    ? Math.min(12, Math.max(1, Math.round(parsed.visibleTabs)))
                    : typeof (parsed as { visibleThreads?: unknown }).visibleThreads === 'number'
                      ? Math.min(
                            12,
                            Math.max(
                                1,
                                Math.round((parsed as { visibleThreads: number }).visibleThreads),
                            ),
                        )
                      : DEFAULT_SIDEBAR_SETTINGS.visibleTabs,
            projectGroup: isProjectGroupMode(parsed.projectGroup)
                ? parsed.projectGroup
                : DEFAULT_SIDEBAR_SETTINGS.projectGroup,
        };
    } catch {
        return DEFAULT_SIDEBAR_SETTINGS;
    }
}

function isProjectSortMode(value: unknown): value is ProjectSortMode {
    return value === 'last-used' || value === 'created' || value === 'manual';
}

function isTabSortMode(value: unknown): value is TabSortMode {
    return value === 'last-used' || value === 'created';
}

function isProjectGroupMode(value: unknown): value is ProjectGroupMode {
    return value === 'separate' || value === 'repository' || value === 'repository-path';
}

function SidebarSettingsMenu({
    settings,
    onChange,
}: {
    settings: SidebarSettings;
    onChange(update: SidebarSettings | ((current: SidebarSettings) => SidebarSettings)): void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 text-muted-foreground hover:text-foreground"
                    >
                        <SlidersHorizontalIcon />
                        <span className="sr-only">Sidebar settings</span>
                    </Button>
                }
            />
            <DropdownMenuContent align="start" className="min-w-56">
                <DropdownMenuRadioGroup
                    value={settings.projectSort}
                    onValueChange={(value) =>
                        onChange((current) => ({
                            ...current,
                            projectSort: value as ProjectSortMode,
                        }))
                    }
                >
                    <DropdownMenuLabel>Sort projects</DropdownMenuLabel>
                    <DropdownMenuRadioItem value="last-used">
                        Last user message
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="created">Created at</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="manual">Manual</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                    value={settings.tabSort}
                    onValueChange={(value) =>
                        onChange((current) => ({ ...current, tabSort: value as TabSortMode }))
                    }
                >
                    <DropdownMenuLabel>Sort tabs</DropdownMenuLabel>
                    <DropdownMenuRadioItem value="last-used">
                        Last user message
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="created">Created at</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuLabel>Visible tabs</DropdownMenuLabel>
                    <div className="mx-2 mb-1 flex h-8 items-center justify-between rounded-lg border border-ring px-1 text-sm">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={settings.visibleTabs <= 1}
                            onClick={(event) => {
                                event.preventDefault();
                                onChange((current) => ({
                                    ...current,
                                    visibleTabs: Math.max(1, current.visibleTabs - 1),
                                }));
                            }}
                        >
                            −
                        </Button>
                        <span>{settings.visibleTabs}</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={settings.visibleTabs >= 12}
                            onClick={(event) => {
                                event.preventDefault();
                                onChange((current) => ({
                                    ...current,
                                    visibleTabs: Math.min(12, current.visibleTabs + 1),
                                }));
                            }}
                        >
                            +
                        </Button>
                    </div>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                    value={settings.projectGroup}
                    onValueChange={(value) =>
                        onChange((current) => ({
                            ...current,
                            projectGroup: value as ProjectGroupMode,
                        }))
                    }
                >
                    <DropdownMenuLabel>Group projects</DropdownMenuLabel>
                    <DropdownMenuRadioItem value="repository">
                        Group by repository
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="repository-path">
                        Group by repository path
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="separate">Keep separate</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function AddTabMenu({ onAddTab }: { onAddTab(kind: TabKind): void }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <PlusIcon />
                        <span className="sr-only">Add tab</span>
                    </Button>
                }
            />
            <DropdownMenuContent align="start" className="min-w-44">
                {tabDefinitions.map((definition) => (
                    <DropdownMenuItem
                        key={definition.kind}
                        onClick={() => onAddTab(definition.kind)}
                    >
                        <definition.Icon />
                        {definition.label}
                        {definition.shortcut ? (
                            <DropdownMenuShortcut>{definition.shortcut}</DropdownMenuShortcut>
                        ) : null}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function WorkspaceIcon({ src }: { src: string | null | undefined }) {
    if (src) {
        return (
            <img
                src={src}
                alt=""
                className="size-4 shrink-0 rounded-sm object-contain"
                draggable={false}
            />
        );
    }
    return <FolderIcon className="size-4 shrink-0" />;
}

function WorkspaceContextMenuContent({
    workspace,
    onTogglePin,
    onDelete,
}: {
    workspace: SidebarProps['workspaces'][number];
    onTogglePin(): void;
    onDelete(): void;
}) {
    return (
        <ContextMenuContent className="min-w-56">
            <ContextMenuGroup>
                <ContextMenuItem onClick={onTogglePin}>
                    {workspace.pinned ? <PushPinSlashIcon /> : <PushPinIcon />}
                    {workspace.pinned ? 'Unpin project' : 'Pin project'}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => copyText(workspace.cwd)}>
                    <CopyIcon />
                    Copy path
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => void ipc.system.openEditor({ path: workspace.cwd })}
                >
                    <CodeIcon />
                    Open in editor
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => void ipc.system.revealInFileManager({ path: workspace.cwd })}
                >
                    <FolderOpenIcon />
                    Open in file manager
                </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
                <ContextMenuItem variant="destructive" onClick={onDelete}>
                    <TrashIcon />
                    Delete workspace
                </ContextMenuItem>
            </ContextMenuGroup>
        </ContextMenuContent>
    );
}

function TabContextMenuContent({
    tab,
    workspace,
    onTogglePin,
    onDelete,
}: {
    tab: WorkspaceTab;
    workspace: SidebarProps['workspaces'][number];
    onTogglePin(): void;
    onDelete(): void;
}) {
    return (
        <ContextMenuContent className="min-w-56">
            <ContextMenuGroup>
                <ContextMenuItem onClick={onTogglePin}>
                    {tab.pinned ? <PushPinSlashIcon /> : <PushPinIcon />}
                    {tab.pinned ? 'Unpin tab' : 'Pin tab'}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => copyText(tab.title)}>
                    <TextTIcon />
                    Copy title
                </ContextMenuItem>
                <ContextMenuItem onClick={() => copyText(workspace.cwd)}>
                    <CopyIcon />
                    Copy path
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => void ipc.system.openEditor({ path: workspace.cwd })}
                >
                    <CodeIcon />
                    Open in editor
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => void ipc.system.revealInFileManager({ path: workspace.cwd })}
                >
                    <FolderOpenIcon />
                    Open in file manager
                </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
                <ContextMenuItem variant="destructive" onClick={onDelete}>
                    <TrashIcon />
                    Delete tab
                </ContextMenuItem>
            </ContextMenuGroup>
        </ContextMenuContent>
    );
}

function DeleteConfirmDialog({
    target,
    onOpenChange,
    onConfirm,
}: {
    target: DeleteTarget | null;
    onOpenChange(open: boolean): void;
    onConfirm(): void;
}) {
    return (
        <AlertDialog open={target != null} onOpenChange={onOpenChange}>
            <AlertDialogContent onBackdropMouseDown={() => onOpenChange(false)}>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Remove {target?.kind === 'workspace' ? 'project' : 'tab'} from Pimux?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        All tabs from <i>{target?.title}</i> will be deleted. This action is not
                        recoverable.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onConfirm}>
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function TabRow({
    tab,
    active,
    status,
    workspace,
    onSelectTab,
    onTogglePin,
    onDelete,
}: {
    tab: WorkspaceTab;
    active: boolean;
    status: SidebarProps['piStatuses'][string] | undefined;
    workspace: SidebarProps['workspaces'][number];
    onSelectTab(tabId: string): void;
    onTogglePin(): void;
    onDelete(): void;
}) {
    const Icon =
        tab.kind === 'pi'
            ? PiIcon
            : tab.kind === 'terminal'
              ? TerminalWindowIcon
              : tab.kind === 'browser'
                ? GlobeIcon
                : NotePencilIcon;

    return (
        <li>
            <ContextMenu>
                <ContextMenuTrigger
                    render={
                        <button
                            type="button"
                            aria-current={active}
                            onClick={() => onSelectTab(tab.id)}
                            className={cn(
                                'flex h-7 w-full items-center gap-2 rounded-md pr-3 pl-7 text-left transition-colors',
                                active
                                    ? 'bg-accent/50 font-semibold text-foreground'
                                    : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                            )}
                        />
                    }
                >
                    <TabIcon tab={tab} Icon={Icon} />
                    <span
                        className={cn('min-w-0 flex-1 truncate text-[12px]', active && 'font-bold')}
                    >
                        {tab.title}
                    </span>
                    {tab.pinned ? <PushPinIcon className="size-3 shrink-0" /> : null}
                    {tab.kind === 'pi' ? <StatusLabel status={status?.status} /> : null}
                </ContextMenuTrigger>
                <TabContextMenuContent
                    tab={tab}
                    workspace={workspace}
                    onTogglePin={onTogglePin}
                    onDelete={onDelete}
                />
            </ContextMenu>
        </li>
    );
}

function TabIcon({ tab, Icon }: { tab: WorkspaceTab; Icon: typeof GlobeIcon }) {
    if (tab.kind === 'browser' && tab.favicon) return <BrowserFavicon tab={tab} />;
    return <Icon className="size-3.5 shrink-0" />;
}

function BrowserFavicon({ tab }: { tab: BrowserTab }) {
    return <img src={tab.favicon} alt="" className="size-3.5 shrink-0 rounded-sm object-contain" />;
}

function firstVisibleStatus(
    tabs: WorkspaceTab[],
    piStatuses: SidebarProps['piStatuses'],
): SidebarProps['piStatuses'][string] | undefined {
    return tabs
        .filter((tab) => tab.kind === 'pi')
        .map((tab) => piStatuses[tab.id])
        .filter((status) => statusPresentation(status?.status))
        .toSorted((a, b) => b.timestamp - a.timestamp)[0];
}

function shouldConfirmTabDelete(
    tab: WorkspaceTab,
    status: SidebarProps['piStatuses'][string] | undefined,
): boolean {
    return (
        tab.kind === 'pi' &&
        (status?.status === 'thinking' ||
            status?.status === 'answering' ||
            status?.status === 'running-tool')
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
