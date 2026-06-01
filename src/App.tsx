import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import type { PanelImperativeHandle, PanelSize } from 'react-resizable-panels';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
    DEFAULT_SIDEBAR_WIDTH,
    DEFAULT_TAB_GROUP_ID,
    SIDEBAR_COLLAPSED_WIDTH,
    SIDEBAR_COLLAPSE_THRESHOLD,
    SIDEBAR_LAYOUT_KEY,
    STORAGE_KEY,
} from '@/lib/constants';
import { useModifierKeyPressed } from '@/modules/hotkeys';
import { loadState, type Workspace, type StoredState } from '@/modules/workspace';
import { WorkspacePicker } from '@/modules/workspace/WorkspacePicker';
import { WorkspacePreviewOverlay } from '@/modules/workspace/WorkspacePreviewOverlay';
import { Sidebar } from '@/modules/sidebar';
import { createTab, isTerminalBackedTab, type TabKind, type WorkspaceTab } from '@/modules/tabs';
import { EmptyApp, EmptyTabs, TabDragPreview } from '@/modules/workbench';
import {
    ensureTabLayout,
    insertGroupInLayout,
    tabGroupId,
    TabLayoutRenderer,
    type TabSplitDirection,
} from '@/modules/workbench/TabLayout';
import {
    orderedWorkspaceIds,
    useAppHotkeys,
    type TerminalZoomAction,
} from '@/modules/app/useAppHotkeys';
import { events, ipc } from './ipc';
import type { PiStatusEvent, PiThemeEvent } from '../shared/events';

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
    const next = [...items];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    return next;
}

type SidebarLayoutState = {
    collapsed: boolean;
    lastExpandedWidth: number;
};

function loadSidebarLayoutState(): SidebarLayoutState {
    try {
        const raw = localStorage.getItem(SIDEBAR_LAYOUT_KEY);
        if (!raw) return { collapsed: false, lastExpandedWidth: DEFAULT_SIDEBAR_WIDTH };
        const parsed = JSON.parse(raw) as Partial<SidebarLayoutState>;
        return {
            collapsed: parsed.collapsed === true,
            lastExpandedWidth:
                typeof parsed.lastExpandedWidth === 'number' &&
                parsed.lastExpandedWidth > SIDEBAR_COLLAPSE_THRESHOLD
                    ? parsed.lastExpandedWidth
                    : DEFAULT_SIDEBAR_WIDTH,
        };
    } catch {
        return { collapsed: false, lastExpandedWidth: DEFAULT_SIDEBAR_WIDTH };
    }
}

function persistSidebarLayoutState(layout: SidebarLayoutState) {
    localStorage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(layout));
}

function touchWorkspace(state: StoredState, workspaceId: string, updatedAt: number): StoredState {
    return {
        ...state,
        workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId ? { ...workspace, updatedAt } : workspace,
        ),
    };
}

function normalizePiTitle(title: string): string | null {
    const normalized = title.replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    return normalized.length > 48 ? `${normalized.slice(0, 47)}…` : normalized;
}

export function App() {
    const [state, setState] = useState<StoredState>(() => loadState());
    const [homeDir, setHomeDir] = useState<string | null>(null);
    const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
    const [piStatuses, setPiStatuses] = useState<Record<string, PiStatusEvent>>({});
    const [piThemes, setPiThemes] = useState<Record<string, PiThemeEvent>>({});
    const [startupPiTheme, setStartupPiTheme] = useState<PiThemeEvent | null>(null);
    const [workspaceOrderIds, setWorkspaceOrderIds] = useState<string[]>([]);
    const [workspacePreviewIndex, setWorkspacePreviewIndex] = useState(0);
    const [draggingTab, setDraggingTab] = useState<WorkspaceTab | null>(null);
    const [activeGroupId, setActiveGroupId] = useState(DEFAULT_TAB_GROUP_ID);
    const [focusToken, setFocusToken] = useState(0);
    const [sidebarLayout, setSidebarLayout] = useState<SidebarLayoutState>(() =>
        loadSidebarLayoutState(),
    );
    const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
    const [deleteWorkspaceRequest, setDeleteWorkspaceRequest] = useState<{
        id: string;
        nonce: number;
    } | null>(null);
    const showHotkeyIndicators = useModifierKeyPressed('Control');
    const tabDragSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    const activeWorkspace =
        state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? null;
    const workspacesById = new Map(state.workspaces.map((workspace) => [workspace.id, workspace]));
    const workspaceTabs = state.tabs.filter((tab) => tab.workspaceId === state.activeWorkspaceId);
    const activeTab =
        workspaceTabs.find((tab) => tab.id === state.activeTabId) ?? workspaceTabs[0] ?? null;
    const tabGroups = useMemo(() => {
        const groups = new Map<string, WorkspaceTab[]>();
        for (const tab of workspaceTabs) {
            const id = tabGroupId(tab);
            const groupTabs = groups.get(id) ?? [];
            groupTabs.push(tab);
            groups.set(id, groupTabs);
        }
        return groups;
    }, [workspaceTabs]);
    const tabLayout = useMemo(
        () => ensureTabLayout(activeWorkspace?.tabLayout, [...tabGroups.keys()]),
        [activeWorkspace?.tabLayout, tabGroups],
    );

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [state]);

    useEffect(() => {
        if (activeTab) setActiveGroupId(tabGroupId(activeTab));
    }, [activeTab]);

    useEffect(() => {
        let cancelled = false;
        ipc.system
            .piTheme({})
            .then((theme) => {
                if (cancelled) return;
                setStartupPiTheme({ tabId: '__startup__', ...theme, timestamp: Date.now() });
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        return events.on('pi:status', (event) => {
            setPiStatuses((prev) => ({ ...prev, [event.tabId]: event }));
        });
    }, []);

    useEffect(() => {
        return events.on('pi:title', (event) => {
            const title = normalizePiTitle(event.title);
            if (!title) return;
            setState((prev) => ({
                ...prev,
                tabs: prev.tabs.map((tab) =>
                    tab.id === event.tabId && tab.kind === 'pi' ? { ...tab, title } : tab,
                ),
            }));
        });
    }, []);

    useEffect(() => {
        return events.on('pi:session', (event) => {
            setState((prev) => ({
                ...prev,
                tabs: prev.tabs.map((tab) =>
                    tab.id === event.tabId && tab.kind === 'pi'
                        ? { ...tab, sessionFile: event.sessionFile }
                        : tab,
                ),
            }));
        });
    }, []);

    useEffect(() => {
        return events.on('pi:theme', (event) => {
            setPiThemes((prev) => ({ ...prev, [event.tabId]: event }));
        });
    }, []);

    useEffect(() => {
        const theme =
            activeTab?.kind === 'pi' ? (piThemes[activeTab.id] ?? startupPiTheme) : startupPiTheme;
        applyPiTheme(theme);
    }, [activeTab, piThemes, startupPiTheme]);

    useEffect(() => {
        let cancelled = false;
        ipc.system
            .homeDir()
            .then((result) => {
                if (!cancelled) setHomeDir(result.home);
            })
            .catch(() => {
                // Leave homeDir null; group labels will show absolute paths.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        window.pimux.cli.ready();
        return window.pimux.cli.onCommand((request) => {
            try {
                if (request.action.type === 'openWorkspace') {
                    openWorkspaceFromCli(request.action.cwd);
                } else if (request.action.type === 'createTab') {
                    createTabFromCli(request.action.kind, request.action.cwd);
                }
                window.pimux.cli.sendResult({ id: request.id, ok: true });
            } catch (error) {
                window.pimux.cli.sendResult({
                    id: request.id,
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        });
    }, []);

    function saveSidebarLayout(next: SidebarLayoutState) {
        setSidebarLayout(next);
        persistSidebarLayoutState(next);
    }

    function handleSidebarResize(size: PanelSize) {
        const collapsed = size.inPixels <= SIDEBAR_COLLAPSE_THRESHOLD;
        const next = collapsed
            ? { ...sidebarLayout, collapsed: true }
            : { collapsed: false, lastExpandedWidth: size.inPixels };
        if (
            next.collapsed === sidebarLayout.collapsed &&
            next.lastExpandedWidth === sidebarLayout.lastExpandedWidth
        ) {
            return;
        }
        saveSidebarLayout(next);
    }

    function toggleSidebar() {
        if (sidebarLayout.collapsed) {
            const width =
                sidebarLayout.lastExpandedWidth > SIDEBAR_COLLAPSE_THRESHOLD
                    ? sidebarLayout.lastExpandedWidth
                    : DEFAULT_SIDEBAR_WIDTH;
            saveSidebarLayout({ collapsed: false, lastExpandedWidth: width });
            sidebarPanelRef.current?.resize(width);
            return;
        }

        saveSidebarLayout({ ...sidebarLayout, collapsed: true });
        sidebarPanelRef.current?.resize(SIDEBAR_COLLAPSED_WIDTH);
    }

    const hotkeyActions = {
        openWorkspacePicker: () => setWorkspacePickerOpen(true),
        focusWorkspace,
        moveWorkspacePreview,
        selectWorkspacePreview: () => focusWorkspace(workspacePreviewIndex),
        confirmDeleteActiveWorkspace,
        focusTab,
        addTab,
        closeActiveTab: () => {
            if (activeTab) closeTab(activeTab.id);
        },
        terminalZoom: (action: TerminalZoomAction) => {
            if (!activeTab || !isTerminalBackedTab(activeTab)) return;
            window.dispatchEvent(
                new CustomEvent('pimux:terminal-zoom', {
                    detail: { tabId: activeTab.id, action },
                }),
            );
        },
        toggleSidebar,
        primeWorkspacePreview: () => {
            const orderedIds = orderedWorkspaceIds(workspaceOrderIds, state.workspaces);
            const activeIndex = orderedIds.indexOf(state.activeWorkspaceId ?? '');
            setWorkspacePreviewIndex(Math.max(0, activeIndex));
        },
    };
    const hotkeys = useAppHotkeys(hotkeyActions);

    function createWorkspace() {
        setWorkspacePickerOpen(true);
    }

    function openWorkspaceFromCli(cwd: string) {
        setWorkspacePickerOpen(false);
        setState((prev) => {
            const existing = prev.workspaces.find((workspace) => workspace.cwd === cwd);
            if (existing) {
                const workspaceTabs = prev.tabs.filter((tab) => tab.workspaceId === existing.id);
                const activeTabId = workspaceTabs.some((tab) => tab.id === existing.activeTabId)
                    ? (existing.activeTabId ?? null)
                    : (workspaceTabs[0]?.id ?? null);
                return { ...prev, activeWorkspaceId: existing.id, activeTabId };
            }

            const id = crypto.randomUUID();
            const now = Date.now();
            const title = cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd;
            const workspace: Workspace = { id, title, cwd, createdAt: now, updatedAt: now };
            return {
                ...prev,
                workspaces: [workspace, ...prev.workspaces],
                activeWorkspaceId: id,
                activeTabId: null,
            };
        });
        requestContentFocus();
    }

    function createTabFromCli(kind: 'terminal' | 'pi' | 'scratch' | 'browser', cwd: string) {
        setWorkspacePickerOpen(false);
        setState((prev) => {
            const existing = prev.workspaces.find((workspace) => workspace.cwd === cwd);
            const now = Date.now();
            const workspace =
                existing ??
                ({
                    id: crypto.randomUUID(),
                    title: cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd,
                    cwd,
                    createdAt: now,
                    updatedAt: now,
                } satisfies Workspace);
            const tab = createTab(kind, workspace);
            const tabs = [...prev.tabs];
            let lastWorkspaceTabIndex = -1;
            for (let index = tabs.length - 1; index >= 0; index -= 1) {
                if (tabs[index].workspaceId === workspace.id) {
                    lastWorkspaceTabIndex = index;
                    break;
                }
            }
            tabs.splice(lastWorkspaceTabIndex + 1, 0, tab);
            const workspaces = existing
                ? prev.workspaces.map((candidate) =>
                      candidate.id === workspace.id
                          ? { ...candidate, activeTabId: tab.id, updatedAt: tab.updatedAt }
                          : candidate,
                  )
                : [
                      { ...workspace, activeTabId: tab.id, updatedAt: tab.updatedAt },
                      ...prev.workspaces,
                  ];
            return {
                ...prev,
                workspaces,
                activeWorkspaceId: workspace.id,
                tabs,
                activeTabId: tab.id,
            };
        });
        requestContentFocus();
    }

    function requestContentFocus() {
        setFocusToken((current) => current + 1);
    }

    function addWorkspace(cwd: string) {
        if (!cwd) return;
        setWorkspacePickerOpen(false);

        const existing = state.workspaces.find((workspace) => workspace.cwd === cwd);
        if (existing) {
            selectWorkspace(existing.id);
            return;
        }

        const id = crypto.randomUUID();
        const now = Date.now();
        const title = cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd;
        const workspace: Workspace = { id, title, cwd, createdAt: now, updatedAt: now };

        setState((prev) => ({
            ...prev,
            workspaces: [workspace, ...prev.workspaces],
            activeWorkspaceId: id,
            activeTabId: null,
        }));
    }

    function confirmDeleteActiveWorkspace() {
        const workspaceId = state.activeWorkspaceId;
        if (!workspaceId) return;
        setDeleteWorkspaceRequest((current) => ({
            id: workspaceId,
            nonce: (current?.nonce ?? 0) + 1,
        }));
    }

    function selectWorkspace(workspaceId: string) {
        const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
        const selectedWorkspaceTabs = state.tabs.filter((tab) => tab.workspaceId === workspaceId);
        const activeTabId = selectedWorkspaceTabs.some((tab) => tab.id === workspace?.activeTabId)
            ? (workspace?.activeTabId ?? null)
            : (selectedWorkspaceTabs[0]?.id ?? null);
        const activeTab = selectedWorkspaceTabs.find((tab) => tab.id === activeTabId);
        if (activeTab) setActiveGroupId(tabGroupId(activeTab));
        setState((prev) => ({
            ...prev,
            activeWorkspaceId: workspaceId,
            activeTabId,
        }));
        requestContentFocus();
    }

    function selectTab(tabId: string) {
        const tab = state.tabs.find((candidate) => candidate.id === tabId);
        if (!tab) return;
        setActiveGroupId(tabGroupId(tab));
        setState((prev) => ({
            ...prev,
            activeWorkspaceId: tab.workspaceId,
            activeTabId: tabId,
            workspaces: prev.workspaces.map((workspace) =>
                workspace.id === tab.workspaceId ? { ...workspace, activeTabId: tabId } : workspace,
            ),
        }));
        requestContentFocus();
        setPiStatuses((prev) => {
            const status = prev[tabId]?.status;
            if (status !== 'done' && status !== 'exited' && status !== 'error') return prev;
            const next = { ...prev };
            delete next[tabId];
            return next;
        });
        setPiThemes((prev) => {
            const next = { ...prev };
            delete next[tabId];
            return next;
        });
    }

    function focusWorkspace(index: number | null) {
        if (index == null) return;
        const orderedIds = workspaceOrderIds.length
            ? workspaceOrderIds
            : state.workspaces.map((workspace) => workspace.id);
        const workspaceId = orderedIds[index];
        if (workspaceId) selectWorkspace(workspaceId);
    }

    function moveWorkspacePreview(delta: number | null) {
        if (delta == null) return;
        const maxIndex = Math.min(
            9,
            (workspaceOrderIds.length ? workspaceOrderIds.length : state.workspaces.length) - 1,
        );
        if (maxIndex < 0) return;
        setWorkspacePreviewIndex((current) => Math.min(maxIndex, Math.max(0, current + delta)));
    }

    function focusTab(index: number | null) {
        if (index == null) return;
        const currentGroupId =
            activeGroupId || (activeTab ? tabGroupId(activeTab) : DEFAULT_TAB_GROUP_ID);
        const currentGroupTabs = workspaceTabs.filter((tab) => tabGroupId(tab) === currentGroupId);
        const tab = currentGroupTabs[index];
        if (tab) selectTab(tab.id);
    }

    function addTab(kind: TabKind) {
        if (!activeWorkspace) return;
        addTabToWorkspace(activeWorkspace.id, kind, activeTab ? tabGroupId(activeTab) : undefined);
    }

    function addTabToWorkspace(workspaceId: string, kind: TabKind, groupId?: string) {
        const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
        if (!workspace) return;
        const tab = {
            ...createTab(kind, workspace),
            groupId: groupId === DEFAULT_TAB_GROUP_ID ? undefined : groupId,
        };
        setActiveGroupId(tabGroupId(tab));
        setState((prev) => {
            let lastWorkspaceTabIndex = -1;
            for (let index = prev.tabs.length - 1; index >= 0; index -= 1) {
                if (
                    prev.tabs[index].workspaceId === workspace.id &&
                    tabGroupId(prev.tabs[index]) === tabGroupId(tab)
                ) {
                    lastWorkspaceTabIndex = index;
                    break;
                }
            }
            const tabs = [...prev.tabs];
            tabs.splice(lastWorkspaceTabIndex + 1, 0, tab);
            return touchWorkspace(
                {
                    ...prev,
                    activeWorkspaceId: workspace.id,
                    workspaces: prev.workspaces.map((candidate) =>
                        candidate.id === workspace.id
                            ? { ...candidate, activeTabId: tab.id }
                            : candidate,
                    ),
                    tabs,
                    activeTabId: tab.id,
                },
                workspace.id,
                tab.updatedAt,
            );
        });
        requestContentFocus();
    }

    function closeTab(tabId: string) {
        const tab = state.tabs.find((candidate) => candidate.id === tabId);
        if (tab && isTerminalBackedTab(tab)) void ipc.terminal.kill({ terminalId: tab.id });

        setState((prev) => {
            const closingTab = prev.tabs.find((candidate) => candidate.id === tabId);
            const beforeWorkspaceTabs = prev.tabs.filter(
                (candidate) => candidate.workspaceId === closingTab?.workspaceId,
            );
            const closingWorkspaceIndex = beforeWorkspaceTabs.findIndex(
                (candidate) => candidate.id === tabId,
            );
            const remaining = prev.tabs.filter((candidate) => candidate.id !== tabId);
            const remainingWorkspaceTabs = remaining.filter(
                (candidate) => candidate.workspaceId === closingTab?.workspaceId,
            );
            const nextForWorkspace =
                remainingWorkspaceTabs[
                    Math.min(closingWorkspaceIndex, remainingWorkspaceTabs.length - 1)
                ] ??
                remainingWorkspaceTabs.at(-1) ??
                null;
            const activeTabId =
                prev.activeTabId === tabId ? (nextForWorkspace?.id ?? null) : prev.activeTabId;
            return {
                ...prev,
                tabs: remaining,
                activeTabId,
                workspaces: prev.workspaces.map((workspace) =>
                    workspace.id === closingTab?.workspaceId
                        ? { ...workspace, activeTabId: nextForWorkspace?.id }
                        : workspace,
                ),
            };
        });
        requestContentFocus();
    }

    function removeWorkspace(workspaceId: string) {
        for (const tab of state.tabs) {
            if (tab.workspaceId === workspaceId && isTerminalBackedTab(tab)) {
                void ipc.terminal.kill({ terminalId: tab.id });
            }
        }
        setState((prev) => {
            const workspaces = prev.workspaces.filter((workspace) => workspace.id !== workspaceId);
            const tabs = prev.tabs.filter((tab) => tab.workspaceId !== workspaceId);
            const activeWorkspaceId =
                prev.activeWorkspaceId === workspaceId
                    ? (workspaces[0]?.id ?? null)
                    : prev.activeWorkspaceId;
            const nextActiveWorkspace = workspaces.find(
                (workspace) => workspace.id === activeWorkspaceId,
            );
            const nextActiveWorkspaceTabs = tabs.filter(
                (tab) => tab.workspaceId === activeWorkspaceId,
            );
            const activeTabId =
                prev.activeWorkspaceId === workspaceId
                    ? nextActiveWorkspaceTabs.some(
                          (tab) => tab.id === nextActiveWorkspace?.activeTabId,
                      )
                        ? (nextActiveWorkspace?.activeTabId ?? null)
                        : (nextActiveWorkspaceTabs[0]?.id ?? null)
                    : prev.activeTabId;
            return { ...prev, workspaces, tabs, activeWorkspaceId, activeTabId };
        });
        setPiStatuses((prev) => {
            const next = { ...prev };
            for (const tab of state.tabs) if (tab.workspaceId === workspaceId) delete next[tab.id];
            return next;
        });
        setPiThemes((prev) => {
            const next = { ...prev };
            for (const tab of state.tabs) if (tab.workspaceId === workspaceId) delete next[tab.id];
            return next;
        });
    }

    function toggleWorkspacePin(workspaceId: string) {
        setState((prev) => ({
            ...prev,
            workspaces: prev.workspaces.map((workspace) =>
                workspace.id === workspaceId
                    ? { ...workspace, pinned: !workspace.pinned }
                    : workspace,
            ),
        }));
    }

    function toggleTabPin(tabId: string) {
        setState((prev) => ({
            ...prev,
            tabs: prev.tabs.map((tab) =>
                tab.id === tabId ? { ...tab, pinned: !tab.pinned } : tab,
            ),
        }));
    }

    function moveWorkspace(activeWorkspaceId: string, overWorkspaceId: string) {
        setState((prev) => {
            const from = prev.workspaces.findIndex(
                (workspace) => workspace.id === activeWorkspaceId,
            );
            const to = prev.workspaces.findIndex((workspace) => workspace.id === overWorkspaceId);
            if (from < 0 || to < 0 || from === to) return prev;
            return { ...prev, workspaces: moveItem(prev.workspaces, from, to) };
        });
    }

    function moveTab(
        tabId: string,
        overTabId: string | null,
        targetWorkspaceId: string,
        targetGroupId?: string,
    ) {
        setState((prev) => {
            const active = prev.tabs.find((tab) => tab.id === tabId);
            const workspace = prev.workspaces.find(
                (candidate) => candidate.id === targetWorkspaceId,
            );
            if (!active || !workspace) return prev;

            const overTab = overTabId ? prev.tabs.find((tab) => tab.id === overTabId) : null;
            const groupId = targetGroupId ?? overTab?.groupId ?? active.groupId;
            const moved = {
                ...active,
                workspaceId: targetWorkspaceId,
                groupId: groupId === DEFAULT_TAB_GROUP_ID ? undefined : groupId,
                updatedAt: Date.now(),
            };
            if (
                overTab &&
                active.workspaceId === targetWorkspaceId &&
                overTab.workspaceId === targetWorkspaceId &&
                tabGroupId(active) === tabGroupId(overTab) &&
                tabGroupId(active) === (groupId ?? DEFAULT_TAB_GROUP_ID)
            ) {
                const from = prev.tabs.findIndex((tab) => tab.id === tabId);
                const to = prev.tabs.findIndex((tab) => tab.id === overTab.id);
                if (from < 0 || to < 0 || from === to) return prev;
                const tabs = moveItem(prev.tabs, from, to).map((tab) =>
                    tab.id === tabId ? moved : tab,
                );
                return touchWorkspace(
                    {
                        ...prev,
                        tabs,
                        activeWorkspaceId: targetWorkspaceId,
                        activeTabId: tabId,
                        workspaces: prev.workspaces.map((workspace) =>
                            workspace.id === targetWorkspaceId
                                ? { ...workspace, activeTabId: tabId }
                                : workspace,
                        ),
                    },
                    targetWorkspaceId,
                    moved.updatedAt,
                );
            }

            const withoutActive = prev.tabs.filter((tab) => tab.id !== tabId);
            const overIndex = overTabId
                ? withoutActive.findIndex((tab) => tab.id === overTabId)
                : -1;
            const fallbackIndex = withoutActive.findLastIndex(
                (tab) =>
                    tab.workspaceId === targetWorkspaceId && tabGroupId(tab) === tabGroupId(moved),
            );
            const insertIndex = overIndex >= 0 ? overIndex : fallbackIndex + 1;
            const tabs = [...withoutActive];
            tabs.splice(insertIndex, 0, moved);
            return touchWorkspace(
                {
                    ...prev,
                    tabs,
                    activeWorkspaceId: targetWorkspaceId,
                    activeTabId: tabId,
                    workspaces: prev.workspaces.map((workspace) =>
                        workspace.id === targetWorkspaceId
                            ? { ...workspace, activeTabId: tabId }
                            : workspace,
                    ),
                },
                targetWorkspaceId,
                moved.updatedAt,
            );
        });
        requestContentFocus();
    }

    function splitTab(tabId: string, targetGroupId: string, direction: TabSplitDirection) {
        if (!activeWorkspace) return;
        const newGroupId = crypto.randomUUID();
        setState((prev) => {
            const active = prev.tabs.find((tab) => tab.id === tabId);
            if (!active) return prev;
            const targetIndexes = prev.tabs
                .map((tab, index) => ({ tab, index }))
                .filter(
                    ({ tab }) =>
                        tab.workspaceId === active.workspaceId && tabGroupId(tab) === targetGroupId,
                )
                .map(({ index }) => index);
            const before = direction === 'left' || direction === 'top';
            const anchorIndex = before
                ? Math.min(...targetIndexes)
                : Math.max(...targetIndexes) + 1;
            const withoutActive = prev.tabs.filter((tab) => tab.id !== tabId);
            const activeIndexBefore = prev.tabs.findIndex((tab) => tab.id === tabId);
            const insertIndex = Math.max(
                0,
                anchorIndex - (activeIndexBefore < anchorIndex ? 1 : 0),
            );
            const moved = { ...active, groupId: newGroupId, updatedAt: Date.now() };
            const tabs = [...withoutActive];
            tabs.splice(insertIndex, 0, moved);
            const movedWorkspaceTabs = tabs.filter((tab) => tab.workspaceId === active.workspaceId);
            const groupIds = [...new Set(movedWorkspaceTabs.map(tabGroupId))];
            const layoutWorkspace = prev.workspaces.find(
                (candidate) => candidate.id === active.workspaceId,
            );
            const nextLayout = insertGroupInLayout(
                ensureTabLayout(layoutWorkspace?.tabLayout, groupIds),
                targetGroupId,
                newGroupId,
                direction,
            );
            return touchWorkspace(
                {
                    ...prev,
                    workspaces: prev.workspaces.map((workspace) =>
                        workspace.id === active.workspaceId
                            ? { ...workspace, activeTabId: tabId, tabLayout: nextLayout }
                            : workspace,
                    ),
                    tabs,
                    activeWorkspaceId: active.workspaceId,
                    activeTabId: tabId,
                },
                active.workspaceId,
                moved.updatedAt,
            );
        });
        requestContentFocus();
    }

    function handleTabDragStart(event: DragStartEvent) {
        const tab = state.tabs.find((candidate) => candidate.id === event.active.id);
        setDraggingTab(tab ?? null);
    }

    function handleTabDragEnd(event: DragEndEvent) {
        setDraggingTab(null);
        const tabId = String(event.active.id);
        const overId = event.over?.id ? String(event.over.id) : null;
        if (!overId || tabId === overId || !activeWorkspace) return;
        if (overId.startsWith('split:')) {
            const [, groupId, direction] = overId.split(':');
            if (
                direction === 'left' ||
                direction === 'right' ||
                direction === 'top' ||
                direction === 'bottom'
            )
                splitTab(tabId, groupId, direction);
            return;
        }
        if (overId.startsWith('merge:')) {
            moveTab(tabId, null, activeWorkspace.id, overId.slice('merge:'.length));
            return;
        }
        moveTab(tabId, overId, activeWorkspace.id);
    }

    function updateTab(next: WorkspaceTab) {
        setState((prev) => ({
            ...prev,
            tabs: prev.tabs.map((tab) => (tab.id === next.id ? next : tab)),
        }));
    }

    return (
        <TooltipProvider delay={350}>
            <ResizablePanelGroup orientation="horizontal" className="bg-background text-foreground">
                <ResizablePanel
                    id="sidebar"
                    panelRef={sidebarPanelRef}
                    defaultSize={
                        sidebarLayout.collapsed
                            ? SIDEBAR_COLLAPSED_WIDTH
                            : sidebarLayout.lastExpandedWidth
                    }
                    minSize={SIDEBAR_COLLAPSED_WIDTH}
                    maxSize="420px"
                    groupResizeBehavior="preserve-pixel-size"
                    onResize={handleSidebarResize}
                >
                    <Sidebar
                        workspaces={state.workspaces}
                        tabs={state.tabs}
                        activeWorkspaceId={state.activeWorkspaceId}
                        activeTabId={state.activeTabId}
                        piStatuses={piStatuses}
                        homeDir={homeDir}
                        collapsed={sidebarLayout.collapsed}
                        showHotkeyIndicators={
                            showHotkeyIndicators || hotkeys.activeTable !== 'root'
                        }
                        deleteWorkspaceRequest={deleteWorkspaceRequest}
                        onSelectWorkspace={selectWorkspace}
                        onWorkspaceOrderChange={setWorkspaceOrderIds}
                        onMoveWorkspace={moveWorkspace}
                        onSelectTab={selectTab}
                        onCreateWorkspace={createWorkspace}
                        onToggleCollapsed={toggleSidebar}
                        onAddTab={addTabToWorkspace}
                        onToggleWorkspacePin={toggleWorkspacePin}
                        onToggleTabPin={toggleTabPin}
                        onMoveTab={moveTab}
                        onRemoveWorkspace={removeWorkspace}
                        onRemoveTab={closeTab}
                    />
                </ResizablePanel>
                <ResizableHandle />

                <ResizablePanel id="workspace" minSize="480px">
                    <main className="flex h-full min-w-0 flex-1 flex-col">
                        {activeWorkspace ? (
                            <DndContext
                                sensors={tabDragSensors}
                                collisionDetection={closestCenter}
                                onDragStart={handleTabDragStart}
                                onDragEnd={handleTabDragEnd}
                                onDragCancel={() => setDraggingTab(null)}
                            >
                                {workspaceTabs.length > 0 ? (
                                    <TabLayoutRenderer
                                        node={tabLayout}
                                        groups={tabGroups}
                                        workspace={activeWorkspace}
                                        activeTabId={activeTab?.id ?? null}
                                        activeGroupId={activeGroupId}
                                        focusToken={focusToken}
                                        piStatuses={piStatuses}
                                        dragging={draggingTab != null}
                                        workspacesById={workspacesById}
                                        showHotkeyIndicators={showHotkeyIndicators}
                                        onSelectTab={selectTab}
                                        onCloseTab={closeTab}
                                        onAddTab={addTabToWorkspace}
                                        onToggleTabPin={toggleTabPin}
                                        onActivateGroup={setActiveGroupId}
                                        updateTab={updateTab}
                                    />
                                ) : (
                                    <EmptyTabs onAddTab={addTab} />
                                )}
                                <DragOverlay>
                                    {draggingTab ? <TabDragPreview tab={draggingTab} /> : null}
                                </DragOverlay>
                            </DndContext>
                        ) : (
                            <EmptyApp onCreateWorkspace={createWorkspace} />
                        )}
                    </main>
                </ResizablePanel>
            </ResizablePanelGroup>
            {hotkeys.activeTable !== 'root' ? (
                <WorkspacePreviewOverlay
                    workspaces={state.workspaces}
                    tabs={state.tabs}
                    activeWorkspaceId={state.activeWorkspaceId}
                    workspaceOrderIds={workspaceOrderIds}
                    selectedIndex={workspacePreviewIndex}
                    bindings={
                        hotkeys.tables.find((table) => table.name === hotkeys.activeTable)
                            ?.bindings ?? []
                    }
                    onPreviewIndexChange={setWorkspacePreviewIndex}
                    onSelectWorkspace={(workspaceId) => {
                        selectWorkspace(workspaceId);
                        hotkeys.reset();
                    }}
                />
            ) : null}
            <WorkspacePicker
                open={workspacePickerOpen}
                initialCwd={homeDir}
                onClose={() => setWorkspacePickerOpen(false)}
                onAdd={addWorkspace}
            />
        </TooltipProvider>
    );
}

function applyPiTheme(theme: PiThemeEvent | null | undefined): void {
    if (!theme?.primary) return;
    document.documentElement.style.setProperty('--primary', theme.primary);
    document.documentElement.style.setProperty(
        '--ring',
        theme.ring ?? colorWithAlpha(theme.primary, 0.6),
    );
    document.documentElement.style.setProperty(
        '--selection',
        theme.selection ?? colorWithAlpha(theme.primary, 0.25),
    );
}

function colorWithAlpha(color: string, alpha: number): string {
    return color.startsWith('#')
        ? `${color}${Math.round(alpha * 255)
              .toString(16)
              .padStart(2, '0')}`
        : color;
}
