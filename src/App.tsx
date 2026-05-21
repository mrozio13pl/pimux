import { useEffect, useState } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { TooltipProvider } from '@/components/ui/tooltip';
import { loadState, STORAGE_KEY, type Workspace, type StoredState } from '@/modules/workspace';
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
    const [piStatuses, setPiStatuses] = useState<Record<string, PiStatusEvent>>({});

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

    async function createWorkspace() {
        const cwd = await ipc.dialog.chooseDirectory();
        if (!cwd) return;

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
                        onSelectWorkspace={selectWorkspace}
                        onSelectTab={selectTab}
                        onCreateWorkspace={createWorkspace}
                        onAddTab={addTabToWorkspace}
                    />
                </ResizablePanel>
                <ResizableHandle />

                <ResizablePanel id="workspace" minSize="480px">
                    <main className="flex h-full min-w-0 flex-1 flex-col">
                        {activeWorkspace ? (
                            <>
                                <TabStrip
                                    tabs={workspaceTabs}
                                    activeTabId={activeTab?.id ?? null}
                                    onSelectTab={selectTab}
                                    onCloseTab={closeTab}
                                    onAddTab={addTab}
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
        </TooltipProvider>
    );
}
