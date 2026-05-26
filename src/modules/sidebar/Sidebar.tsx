import { useEffect, useMemo, useState } from 'react';
import {
    closestCenter,
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
    CaretLineLeftIcon,
    CaretLineRightIcon,
    FolderPlusIcon,
    GitDiffIcon,
    GlobeIcon,
    NotePencilIcon,
    PiIcon,
    PushPinIcon,
    TerminalWindowIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { ipc } from '@/ipc';
import { HotkeyIndicatorBadge } from '@/modules/hotkeys';
import { workspaceHotkeyLabel } from '@/modules/workspace';
import { groupWorkspaces } from './grouping';
import { relativeTime } from './time';
import type { SidebarProps } from './types';
import type { WorkspaceTab } from '@/modules/tabs/types';
import {
    AddTabMenu,
    DeleteConfirmDialog,
    firstVisibleStatus,
    loadSidebarSettings,
    persistSidebarSettings,
    shouldConfirmTabDelete,
    SidebarDragPreview,
    SidebarSettingsMenu,
    statusPresentation,
    StatusLabel,
    SortableWorkspaceItem,
    TabRow,
    WorkspaceContextMenuContent,
    WorkspaceDragHandle,
    WorkspaceIcon,
    WorkspaceTabDropZone,
    type DeleteTarget,
    type SidebarSettings,
} from './SidebarParts';

export function Sidebar({
    workspaces,
    tabs,
    activeWorkspaceId,
    activeTabId,
    piStatuses,
    homeDir,
    collapsed = false,
    showHotkeyIndicators = false,
    deleteWorkspaceRequest,
    onSelectWorkspace,
    onWorkspaceOrderChange,
    onMoveWorkspace,
    onSelectTab,
    onCreateWorkspace,
    onToggleCollapsed,
    onAddTab,
    onToggleWorkspacePin,
    onToggleTabPin,
    onMoveTab,
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
    const [dragging, setDragging] = useState<
        | { kind: 'workspace'; id: string; title: string }
        | { kind: 'tab'; id: string; title: string; tabKind: WorkspaceTab['kind'] }
        | null
    >(null);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    useEffect(() => {
        if (!deleteWorkspaceRequest) return;
        const workspace = workspaces.find(
            (candidate) => candidate.id === deleteWorkspaceRequest.id,
        );
        if (!workspace) return;
        setDeleteTarget({ kind: 'workspace', id: workspace.id, title: workspace.title });
    }, [deleteWorkspaceRequest, workspaces]);

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
                return settings.autoOrderTabs
                    ? b.updatedAt - a.updatedAt
                    : (tabIndex.get(a.id) ?? 0) - (tabIndex.get(b.id) ?? 0);
            });
        }
        return map;
    }, [tabs, settings.autoOrderTabs]);

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
                sortMode: settings.autoOrderWorkspaces
                    ? 'last-used'
                    : settings.projectSort === 'last-used'
                      ? 'manual'
                      : settings.projectSort,
                groupMode: settings.projectGroup,
                homeDir,
            }),
        [
            workspaces,
            workspaceLastUsedAt,
            settings.autoOrderWorkspaces,
            settings.projectSort,
            settings.projectGroup,
            homeDir,
        ],
    );

    const visibleWorkspaceIds = useMemo(
        () => groups.flatMap((group) => group.workspaces.map((workspace) => workspace.id)),
        [groups],
    );

    const workspaceHotkeyIndex = useMemo(
        () =>
            new Map(
                visibleWorkspaceIds
                    .slice(0, 10)
                    .map((id, index) => [id, workspaceHotkeyLabel(index)]),
            ),
        [visibleWorkspaceIds],
    );

    useEffect(() => {
        onWorkspaceOrderChange?.(visibleWorkspaceIds);
    }, [onWorkspaceOrderChange, visibleWorkspaceIds]);

    useEffect(() => {
        persistSidebarSettings(settings);
    }, [settings]);

    useEffect(() => {
        if (!activeWorkspaceId) return;
        setOpenWorkspaceIds((current) =>
            current.includes(activeWorkspaceId) ? current : [...current, activeWorkspaceId],
        );
    }, [activeWorkspaceId]);

    function handleDragStart(event: DragStartEvent) {
        const id = String(event.active.id);
        if (id.startsWith('workspace:')) {
            const workspaceId = id.slice('workspace:'.length);
            const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
            if (workspace)
                setDragging({ kind: 'workspace', id: workspace.id, title: workspace.title });
            return;
        }
        if (id.startsWith('tab:')) {
            const tabId = id.slice('tab:'.length);
            const tab = tabs.find((candidate) => candidate.id === tabId);
            if (tab) setDragging({ kind: 'tab', id: tab.id, title: tab.title, tabKind: tab.kind });
        }
    }

    function handleDragEnd(event: DragEndEvent) {
        setDragging(null);
        const activeId = String(event.active.id);
        const overId = event.over?.id ? String(event.over.id) : null;
        if (!overId) return;

        if (activeId.startsWith('workspace:') && overId.startsWith('workspace:')) {
            const activeWorkspaceId = activeId.slice('workspace:'.length);
            const overWorkspaceId = overId.slice('workspace:'.length);
            if (activeWorkspaceId === overWorkspaceId) return;
            setSettings((current) => ({
                ...current,
                projectSort: 'manual',
                autoOrderWorkspaces: false,
                projectGroup: 'separate',
            }));
            onMoveWorkspace?.(activeWorkspaceId, overWorkspaceId);
            return;
        }

        if (!activeId.startsWith('tab:')) return;
        const tabId = activeId.slice('tab:'.length);
        let targetWorkspaceId: string | null = null;
        let overTabId: string | null = null;
        if (overId.startsWith('tab:')) {
            overTabId = overId.slice('tab:'.length);
            targetWorkspaceId = tabs.find((tab) => tab.id === overTabId)?.workspaceId ?? null;
        } else if (overId.startsWith('workspace-tabs:')) {
            targetWorkspaceId = overId.slice('workspace-tabs:'.length);
        } else if (overId.startsWith('workspace:')) {
            targetWorkspaceId = overId.slice('workspace:'.length);
        }
        if (!targetWorkspaceId) return;
        setSettings((current) => ({ ...current, tabSort: 'manual', autoOrderTabs: false }));
        onMoveTab?.(tabId, overTabId, targetWorkspaceId);
        setOpenWorkspaceIds((current) =>
            current.includes(targetWorkspaceId) ? current : [...current, targetWorkspaceId],
        );
    }

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

    if (collapsed) {
        return (
            <aside className="flex h-full w-full flex-col bg-sidebar py-2">
                <div className="flex justify-center px-1 pb-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        onClick={onToggleCollapsed}
                    >
                        <CaretLineRightIcon />
                        <span className="sr-only">Expand sidebar</span>
                    </Button>
                </div>
                <ScrollArea className="min-h-0 flex-1 px-1">
                    <Accordion
                        multiple
                        value={openWorkspaceIds}
                        onValueChange={(value) => setOpenWorkspaceIds(value)}
                        className="flex flex-col gap-1"
                    >
                        {workspaces.map((workspace) => {
                            const active = workspace.id === activeWorkspaceId;
                            const workspaceTabs = tabsByWorkspace.get(workspace.id) ?? [];

                            return (
                                <AccordionItem
                                    key={workspace.id}
                                    value={workspace.id}
                                    className="flex flex-col items-center border-0 bg-transparent not-last:border-b-0 data-open:bg-transparent"
                                >
                                    <div
                                        className={cn(
                                            'flex h-8 w-full items-center justify-center rounded-md transition-colors',
                                            active
                                                ? 'bg-accent/50 text-foreground'
                                                : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                                        )}
                                    >
                                        <AccordionTrigger
                                            className="h-7 w-7 flex-none items-center justify-center gap-0 rounded-sm p-0 text-current no-underline hover:bg-accent/50 hover:no-underline **:data-[slot=accordion-trigger-icon]:m-0 **:data-[slot=accordion-trigger-icon]:size-3"
                                            title={workspace.title}
                                        >
                                            <span className="sr-only">
                                                Toggle {workspace.title}
                                            </span>
                                        </AccordionTrigger>
                                    </div>
                                    <AccordionContent className="w-full pb-1">
                                        <ul className="flex flex-col items-center gap-1 pt-1">
                                            {workspaceTabs.map((tab) => (
                                                <li key={tab.id}>
                                                    <button
                                                        type="button"
                                                        aria-current={tab.id === activeTabId}
                                                        onClick={() => onSelectTab(tab.id)}
                                                        className={cn(
                                                            'flex size-7 items-center justify-center rounded-md transition-colors',
                                                            tab.id === activeTabId
                                                                ? 'bg-accent/60 text-foreground'
                                                                : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                                                        )}
                                                        title={tab.title}
                                                    >
                                                        <CollapsedTabIcon
                                                            tab={tab}
                                                            status={piStatuses[tab.id]?.status}
                                                        />
                                                        <span className="sr-only">{tab.title}</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                </ScrollArea>
            </aside>
        );
    }

    return (
        <>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setDragging(null)}
            >
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
                                    onClick={onToggleCollapsed}
                                >
                                    <CaretLineLeftIcon />
                                    <span className="sr-only">Collapse sidebar</span>
                                </Button>
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
                                            <SortableContext
                                                items={group.workspaces.map(
                                                    (workspace) => `workspace:${workspace.id}`,
                                                )}
                                                strategy={verticalListSortingStrategy}
                                            >
                                                {group.workspaces.map((workspace) => {
                                                    const active =
                                                        workspace.id === activeWorkspaceId;
                                                    const hovered =
                                                        hoveredWorkspaceId === workspace.id;
                                                    const open = openWorkspaceIds.includes(
                                                        workspace.id,
                                                    );
                                                    const workspaceTabs =
                                                        tabsByWorkspace.get(workspace.id) ?? [];
                                                    const tabsExpanded =
                                                        expandedTabWorkspaceIds.has(workspace.id);
                                                    const visibleTabs = tabsExpanded
                                                        ? workspaceTabs
                                                        : workspaceTabs.slice(
                                                              0,
                                                              settings.visibleTabs,
                                                          );
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
                                                        <SortableWorkspaceItem
                                                            key={workspace.id}
                                                            id={workspace.id}
                                                            value={workspace.id}
                                                            onMouseEnter={() =>
                                                                setHoveredWorkspaceId(workspace.id)
                                                            }
                                                            onMouseLeave={() =>
                                                                setHoveredWorkspaceId(null)
                                                            }
                                                        >
                                                            <ContextMenu>
                                                                <ContextMenuTrigger
                                                                    render={
                                                                        <div
                                                                            className={cn(
                                                                                'flex h-8 w-full items-center gap-1 rounded-md pr-2 transition-colors',
                                                                                active
                                                                                    ? 'text-foreground'
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
                                                                            onSelectWorkspace(
                                                                                workspace.id,
                                                                            )
                                                                        }
                                                                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                                                    >
                                                                        <WorkspaceIcon
                                                                            src={
                                                                                workspaceIcons[
                                                                                    workspace.id
                                                                                ]
                                                                            }
                                                                        />
                                                                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                                                                            {workspace.title}
                                                                        </span>
                                                                        {workspace.pinned ? (
                                                                            <PushPinIcon className="size-3 shrink-0" />
                                                                        ) : null}
                                                                        <HotkeyIndicatorBadge
                                                                            visible={
                                                                                showHotkeyIndicators &&
                                                                                workspaceHotkeyIndex.has(
                                                                                    workspace.id,
                                                                                )
                                                                            }
                                                                            keys={`Ctrl+Space ${workspaceHotkeyIndex.get(workspace.id)}`}
                                                                        />
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
                                                                        <>
                                                                            <WorkspaceDragHandle />
                                                                            <AddTabMenu
                                                                                onAddTab={(kind) =>
                                                                                    onAddTab(
                                                                                        workspace.id,
                                                                                        kind,
                                                                                    )
                                                                                }
                                                                            />
                                                                        </>
                                                                    ) : null}
                                                                </ContextMenuTrigger>
                                                                <WorkspaceContextMenuContent
                                                                    workspace={workspace}
                                                                    onTogglePin={() =>
                                                                        onToggleWorkspacePin(
                                                                            workspace.id,
                                                                        )
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
                                                                <WorkspaceTabDropZone
                                                                    workspaceId={workspace.id}
                                                                >
                                                                    {workspaceTabs.length > 0 ? (
                                                                        <ul className="flex flex-col gap-0.5">
                                                                            <SortableContext
                                                                                items={visibleTabs.map(
                                                                                    (tab) =>
                                                                                        `tab:${tab.id}`,
                                                                                )}
                                                                                strategy={
                                                                                    verticalListSortingStrategy
                                                                                }
                                                                            >
                                                                                {visibleTabs.map(
                                                                                    (tab) => (
                                                                                        <TabRow
                                                                                            key={
                                                                                                tab.id
                                                                                            }
                                                                                            tab={
                                                                                                tab
                                                                                            }
                                                                                            active={
                                                                                                tab.id ===
                                                                                                activeTabId
                                                                                            }
                                                                                            status={
                                                                                                piStatuses[
                                                                                                    tab
                                                                                                        .id
                                                                                                ]
                                                                                            }
                                                                                            workspace={
                                                                                                workspace
                                                                                            }
                                                                                            onSelectTab={
                                                                                                onSelectTab
                                                                                            }
                                                                                            onTogglePin={() =>
                                                                                                onToggleTabPin(
                                                                                                    tab.id,
                                                                                                )
                                                                                            }
                                                                                            onDelete={() => {
                                                                                                if (
                                                                                                    shouldConfirmTabDelete(
                                                                                                        tab,
                                                                                                        piStatuses[
                                                                                                            tab
                                                                                                                .id
                                                                                                        ],
                                                                                                    )
                                                                                                ) {
                                                                                                    setDeleteTarget(
                                                                                                        {
                                                                                                            kind: 'tab',
                                                                                                            id: tab.id,
                                                                                                            title: tab.title,
                                                                                                        },
                                                                                                    );
                                                                                                    return;
                                                                                                }
                                                                                                onRemoveTab(
                                                                                                    tab.id,
                                                                                                );
                                                                                            }}
                                                                                        />
                                                                                    ),
                                                                                )}
                                                                            </SortableContext>
                                                                            {hiddenTabCount > 0 ? (
                                                                                <li>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            setExpandedTabWorkspaceIds(
                                                                                                (
                                                                                                    current,
                                                                                                ) => {
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
                                                                                        +
                                                                                        {
                                                                                            hiddenTabCount
                                                                                        }{' '}
                                                                                        more
                                                                                    </button>
                                                                                </li>
                                                                            ) : null}
                                                                        </ul>
                                                                    ) : (
                                                                        <p className="px-3 py-1 text-[11.5px] text-muted-foreground">
                                                                            No tabs — drop tab here
                                                                        </p>
                                                                    )}
                                                                </WorkspaceTabDropZone>
                                                            </AccordionContent>
                                                        </SortableWorkspaceItem>
                                                    );
                                                })}
                                            </SortableContext>
                                        </Accordion>
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </aside>
                <DragOverlay>
                    {dragging ? (
                        <SidebarDragPreview
                            title={dragging.title}
                            kind={dragging.kind}
                            tabKind={dragging.kind === 'tab' ? dragging.tabKind : undefined}
                        />
                    ) : null}
                </DragOverlay>
            </DndContext>
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

function CollapsedTabIcon({ tab, status }: { tab: WorkspaceTab; status?: string }) {
    if (tab.kind === 'browser' && tab.favicon) {
        return <img src={tab.favicon} alt="" className="size-3.5 rounded-sm object-contain" />;
    }

    const Icon =
        tab.kind === 'pi'
            ? PiIcon
            : tab.kind === 'terminal'
              ? TerminalWindowIcon
              : tab.kind === 'browser'
                ? GlobeIcon
                : tab.kind === 'diffs'
                  ? GitDiffIcon
                  : NotePencilIcon;

    return (
        <Icon
            className={cn(
                'size-3.5 shrink-0',
                tab.kind === 'pi' && statusPresentation(status)?.className,
            )}
        />
    );
}
