import { useEffect, useMemo, useRef, useState } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
    useHybridHotkeys,
    useModifierKeyPressed,
    type HybridHotkeyBinding,
} from '@/modules/hotkeys';
import { loadState, STORAGE_KEY, type Workspace, type StoredState } from '@/modules/workspace';
import { WorkspacePicker } from '@/modules/workspace/WorkspacePicker';
import { WorkspacePreviewOverlay } from '@/modules/workspace/WorkspacePreviewOverlay';
import { workspaceHotkeyLabel } from '@/modules/workspace/hotkeys';
import { Sidebar } from '@/modules/sidebar';
import {
    createTab,
    isTerminalBackedTab,
    renderTab,
    type TabKind,
    type WorkspaceTab,
} from '@/modules/tabs';
import { EmptyApp, EmptyTabs, TabStrip } from '@/modules/workbench';
import { events, ipc } from './ipc';
import type { PiStatusEvent } from '../shared/events';

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
    const [workspaceOrderIds, setWorkspaceOrderIds] = useState<string[]>([]);
    const [workspacePreviewIndex, setWorkspacePreviewIndex] = useState(0);
    const [deleteWorkspaceRequest, setDeleteWorkspaceRequest] = useState<{
        id: string;
        nonce: number;
    } | null>(null);
    const showHotkeyIndicators = useModifierKeyPressed('Control');

    const activeWorkspace =
        state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? null;
    const workspacesById = new Map(state.workspaces.map((workspace) => [workspace.id, workspace]));
    const workspaceTabs = state.tabs.filter((tab) => tab.workspaceId === state.activeWorkspaceId);
    const activeTab =
        workspaceTabs.find((tab) => tab.id === state.activeTabId) ?? workspaceTabs[0] ?? null;

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [state]);

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

    const hotkeyBindings = useMemo<HybridHotkeyBinding[]>(
        () => [
            {
                keys: 'Control+o',
                command: 'workspace.picker.open',
                description: 'Open workspace picker',
                allowInInputs: true,
            },
            {
                keys: 'Control+Space o',
                command: 'workspace.picker.open',
                description: 'Open workspace picker',
                allowInInputs: true,
            },
            {
                keys: 'Control+Space c',
                command: 'tab.add',
                args: { kind: 'pi' },
                description: 'New Pi tab',
                allowInInputs: true,
            },
            {
                keys: 'Control+Space t',
                command: 'tab.add',
                args: { kind: 'terminal' },
                description: 'New shell tab',
                allowInInputs: true,
            },
            {
                keys: 'Control+Space s',
                command: 'tab.add',
                args: { kind: 'scratch' },
                description: 'New scratch tab',
                allowInInputs: true,
            },
            {
                keys: 'Control+Space b',
                command: 'tab.add',
                args: { kind: 'browser' },
                description: 'New browser tab',
                allowInInputs: true,
            },
            {
                keys: 'Control+w',
                command: 'tab.close.active',
                description: 'Close current tab',
                allowInInputs: true,
            },
            {
                keys: 'Control+Shift+w',
                command: 'workspace.delete.active.confirm',
                description: 'Delete current workspace',
                allowInInputs: true,
            },
            {
                keys: 'Control+Space d',
                command: 'workspace.delete.active.confirm',
                description: 'Delete current workspace',
                allowInInputs: true,
            },
            {
                keys: 'Control+Space [Control]+ArrowLeft',
                command: 'workspace.preview.move',
                args: { delta: -1 },
                description: 'Move left',
                stay: true,
                allowInInputs: true,
            },
            {
                keys: 'Control+Space [Control]+ArrowRight',
                command: 'workspace.preview.move',
                args: { delta: 1 },
                description: 'Move right',
                stay: true,
                allowInInputs: true,
            },
            {
                keys: 'Control+Space [Control]+ArrowUp',
                command: 'workspace.preview.move',
                args: { delta: -5 },
                description: 'Move up',
                stay: true,
                allowInInputs: true,
            },
            {
                keys: 'Control+Space [Control]+ArrowDown',
                command: 'workspace.preview.move',
                args: { delta: 5 },
                description: 'Move down',
                stay: true,
                allowInInputs: true,
            },
            {
                keys: 'Control+Space [Control]+Enter',
                command: 'workspace.preview.select',
                description: 'Select workspace',
                allowInInputs: true,
            },
            ...Array.from({ length: 10 }, (_, index) => ({
                keys: `Control+Space [Control]+${workspaceHotkeyLabel(index)}`,
                command: 'workspace.focus',
                args: { index },
                description: `Focus workspace ${workspaceHotkeyLabel(index)}`,
                allowInInputs: true,
            })),
            ...Array.from({ length: 9 }, (_, index) => ({
                keys: `Control+${index + 1}`,
                command: 'tab.focus',
                args: { index },
                description: `Focus tab ${index + 1}`,
                allowInInputs: true,
            })),
        ],
        [],
    );

    const hotkeyCommands = {
        'workspace.picker.open': () => setWorkspacePickerOpen(true),
        'workspace.focus': (args?: unknown) => focusWorkspace(readIndexArg(args)),
        'workspace.preview.move': (args?: unknown) => moveWorkspacePreview(readDeltaArg(args)),
        'workspace.preview.select': () => focusWorkspace(workspacePreviewIndex),
        'workspace.delete.active.confirm': () => confirmDeleteActiveWorkspace(),
        'tab.focus': (args?: unknown) => focusTab(readIndexArg(args)),
        'tab.add': (args?: unknown) => addTab(readTabKindArg(args) ?? 'pi'),
        'tab.close.active': () => {
            if (activeTab) closeTab(activeTab.id);
        },
    };

    const hotkeys = useHybridHotkeys({
        prefixKey: 'Control+Space',
        bindings: hotkeyBindings,
        commands: hotkeyCommands,
    });
    const previousHotkeyTableRef = useRef(hotkeys.activeTable);

    useEffect(() => {
        const previousTable = previousHotkeyTableRef.current;
        previousHotkeyTableRef.current = hotkeys.activeTable;
        if (hotkeys.activeTable === 'root' || previousTable !== 'root') return;

        const orderedIds = workspaceOrderIds.length
            ? workspaceOrderIds
            : state.workspaces.map((workspace) => workspace.id);
        const activeIndex = orderedIds.indexOf(state.activeWorkspaceId ?? '');
        setWorkspacePreviewIndex(Math.max(0, activeIndex));
    }, [hotkeys.activeTable, state.activeWorkspaceId, state.workspaces, workspaceOrderIds]);

    function createWorkspace() {
        setWorkspacePickerOpen(true);
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
        const firstTab = createTab('pi', workspace);

        setState((prev) => ({
            ...prev,
            workspaces: [workspace, ...prev.workspaces],
            activeWorkspaceId: id,
            tabs: [...prev.tabs, firstTab],
            activeTabId: firstTab.id,
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
        const workspaceTabs = state.tabs
            .filter((tab) => tab.workspaceId === workspaceId)
            .toSorted((a, b) => b.updatedAt - a.updatedAt);
        setState((prev) => ({
            ...prev,
            activeWorkspaceId: workspaceId,
            activeTabId: workspaceTabs[0]?.id ?? null,
        }));
    }

    function selectTab(tabId: string) {
        const tab = state.tabs.find((candidate) => candidate.id === tabId);
        if (!tab) return;
        setState((prev) => ({ ...prev, activeWorkspaceId: tab.workspaceId, activeTabId: tabId }));
        setPiStatuses((prev) => {
            const status = prev[tabId]?.status;
            if (status !== 'done' && status !== 'exited' && status !== 'error') return prev;
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
        const tab = workspaceTabs[index];
        if (tab) selectTab(tab.id);
    }

    function addTab(kind: TabKind) {
        if (!activeWorkspace) return;
        addTabToWorkspace(activeWorkspace.id, kind);
    }

    function addTabToWorkspace(workspaceId: string, kind: TabKind) {
        const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
        if (!workspace) return;
        const tab = createTab(kind, workspace);
        setState((prev) => {
            let lastWorkspaceTabIndex = -1;
            for (let index = prev.tabs.length - 1; index >= 0; index -= 1) {
                if (prev.tabs[index].workspaceId === workspace.id) {
                    lastWorkspaceTabIndex = index;
                    break;
                }
            }
            const tabs = [...prev.tabs];
            tabs.splice(lastWorkspaceTabIndex + 1, 0, tab);
            return touchWorkspace(
                { ...prev, activeWorkspaceId: workspace.id, tabs, activeTabId: tab.id },
                workspace.id,
                tab.updatedAt,
            );
        });
    }

    function closeTab(tabId: string) {
        const tab = state.tabs.find((candidate) => candidate.id === tabId);
        if (tab && isTerminalBackedTab(tab)) void ipc.terminal.kill({ terminalId: tab.id });

        setState((prev) => {
            const remaining = prev.tabs.filter((tab) => tab.id !== tabId);
            const nextForWorkspace = remaining.find(
                (tab) => tab.workspaceId === prev.activeWorkspaceId,
            );
            return {
                ...prev,
                tabs: remaining,
                activeTabId:
                    prev.activeTabId === tabId ? (nextForWorkspace?.id ?? null) : prev.activeTabId,
            };
        });
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
            const activeTabId =
                prev.activeWorkspaceId === workspaceId
                    ? (tabs.find((tab) => tab.workspaceId === activeWorkspaceId)?.id ?? null)
                    : prev.activeTabId;
            return { ...prev, workspaces, tabs, activeWorkspaceId, activeTabId };
        });
        setPiStatuses((prev) => {
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
                    defaultSize="280px"
                    minSize="220px"
                    maxSize="420px"
                    groupResizeBehavior="preserve-pixel-size"
                >
                    <Sidebar
                        workspaces={state.workspaces}
                        tabs={state.tabs}
                        activeWorkspaceId={state.activeWorkspaceId}
                        activeTabId={state.activeTabId}
                        piStatuses={piStatuses}
                        homeDir={homeDir}
                        showHotkeyIndicators={
                            showHotkeyIndicators || hotkeys.activeTable !== 'root'
                        }
                        deleteWorkspaceRequest={deleteWorkspaceRequest}
                        onSelectWorkspace={selectWorkspace}
                        onWorkspaceOrderChange={setWorkspaceOrderIds}
                        onSelectTab={selectTab}
                        onCreateWorkspace={createWorkspace}
                        onAddTab={addTabToWorkspace}
                        onToggleWorkspacePin={toggleWorkspacePin}
                        onToggleTabPin={toggleTabPin}
                        onRemoveWorkspace={removeWorkspace}
                        onRemoveTab={closeTab}
                    />
                </ResizablePanel>
                <ResizableHandle />

                <ResizablePanel id="workspace" minSize="480px">
                    <main className="flex h-full min-w-0 flex-1 flex-col">
                        {activeWorkspace ? (
                            <>
                                <TabStrip
                                    tabs={workspaceTabs}
                                    workspace={activeWorkspace}
                                    activeTabId={activeTab?.id ?? null}
                                    piStatuses={piStatuses}
                                    onSelectTab={selectTab}
                                    onCloseTab={closeTab}
                                    onAddTab={addTab}
                                    onToggleTabPin={toggleTabPin}
                                    showHotkeyIndicators={showHotkeyIndicators}
                                />
                                <section className="relative min-h-0 flex-1 overflow-hidden">
                                    {workspaceTabs.length > 0 ? (
                                        workspaceTabs.map((tab) => {
                                            const workspace = workspacesById.get(tab.workspaceId);
                                            if (!workspace) return null;
                                            const active = tab.id === activeTab?.id;
                                            return (
                                                <div
                                                    key={tab.id}
                                                    aria-hidden={!active}
                                                    className={
                                                        active
                                                            ? 'absolute inset-0'
                                                            : 'pointer-events-none absolute inset-0 opacity-0'
                                                    }
                                                >
                                                    {renderTab(tab, { workspace, updateTab })}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <EmptyTabs onOpenTerminal={() => addTab('terminal')} />
                                    )}
                                </section>
                            </>
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

function readDeltaArg(args: unknown): number | null {
    if (typeof args !== 'object' || args === null || !('delta' in args)) return null;
    const delta = (args as { delta?: unknown }).delta;
    return typeof delta === 'number' ? delta : null;
}

function readIndexArg(args: unknown): number | null {
    if (typeof args !== 'object' || args === null || !('index' in args)) return null;
    const index = (args as { index?: unknown }).index;
    return typeof index === 'number' ? index : null;
}

function readTabKindArg(args: unknown): TabKind | null {
    if (typeof args !== 'object' || args === null || !('kind' in args)) return null;
    const kind = (args as { kind?: unknown }).kind;
    return kind === 'pi' || kind === 'terminal' || kind === 'scratch' || kind === 'browser'
        ? kind
        : null;
}
