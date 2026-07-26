import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import stripAnsi from 'strip-ansi';
import { AppCommands } from '@/components/commands';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FolderPicker } from '@/components/folder-picker';
import type { SessionSearchResult } from '@/components/view-finder';
import { ViewButton } from '@/components/sidebar/view-button';
import { BUILTIN_SOURCES, SOURCES, type CustomSourceId, type ExecutableSource } from '@/lib/sources';
import { applySourceOverride, customSource, useCustomSources } from '@/lib/sources/custom';
import { useViews } from '@/lib/views';
import { Terminal } from '@/components/terminal';
import { GeneralSettingsDialog } from '@/components/settings/general';
import { HotkeysDialog } from '@/components/settings/hotkeys';
import { SourcesDialog } from '@/components/settings/sources';
import { cn } from '@/lib/utils';
import { renderHeroAscii } from '@/lib/hero-ascii';
import { isAppHotkey, useAppHotkey } from '@/lib/settings/hotkeys';
import { useSettings } from '@/lib/settings';
import { version } from '../package.json';

const useNativeFolderPicker = /Windows|Macintosh|Mac OS X/.test(navigator.userAgent);

function ViewSwitchHotkey({ index, switchView }: { index: number; switchView: (index: number) => void }) {
    useAppHotkey(`view.switch.${index + 1}`, `Ctrl+${index + 1}`, () => switchView(index === 8 ? -1 : index));
    return null;
}

function SourceHotkeys({
    source,
    openHere,
    chooseFolder,
}: {
    source: ExecutableSource;
    openHere: (source: ExecutableSource) => void;
    chooseFolder: (source: ExecutableSource) => void;
}) {
    useAppHotkey(`source.open:${source.id}`, undefined, () => openHere(source));
    useAppHotkey(`source.open-folder:${source.id}`, undefined, () => chooseFolder(source));
    return null;
}

export function App() {
    const {
        views,
        defaultCwd,
        openView,
        updateView,
        updateViewFromSource,
        removeView,
        moveView,
        promoteView,
        toggleViewPin,
        toggleViewArchive,
        archiveInactiveViews,
        loading: loadingViews,
        error,
    } = useViews();
    const custom = useCustomSources();
    const sourceOverrides = useSettings((state) => state.sourceOverrides);
    const setSourceOverride = useSettings((state) => state.setSourceOverride);
    const customExecutableSources = useMemo(() => custom.sources.map(customSource), [custom.sources]);
    const builtinSources = useMemo(
        () => SOURCES.map((source) => applySourceOverride(source, sourceOverrides[source.id])),
        [sourceOverrides],
    );
    const builtinExecutableSources = useMemo(
        () =>
            builtinSources.filter(
                (source): source is Exclude<(typeof SOURCES)[number], { planned: true }> => !('planned' in source),
            ),
        [builtinSources],
    );
    const executableSources = useMemo<ExecutableSource[]>(
        () => [
            ...builtinExecutableSources.filter((source) => source.id !== BUILTIN_SOURCES.shell.id),
            ...customExecutableSources,
            builtinExecutableSources.find((source) => source.id === BUILTIN_SOURCES.shell.id)!,
        ],
        [builtinExecutableSources, customExecutableSources],
    );
    const sourceMenuSources = useMemo(
        () => [
            ...builtinSources.filter((source) => source.id !== BUILTIN_SOURCES.shell.id),
            ...customExecutableSources,
            builtinSources.find((source) => source.id === BUILTIN_SOURCES.shell.id)!,
        ],
        [builtinSources, customExecutableSources],
    );
    const availableSources = useMemo(
        () => sourceMenuSources.filter((source) => !('planned' in source)),
        [sourceMenuSources],
    );
    const { defaultSource, autoArchiveDays } = useSettings((state) => state.values);
    const [settingsHydrated, setSettingsHydrated] = useState(useSettings.persist.hasHydrated());
    useEffect(() => useSettings.persist.onFinishHydration(() => setSettingsHydrated(true)), []);
    const handleTerminalKey = useCallback((event: KeyboardEvent) => isAppHotkey(event), []);
    const [reorderRevision, setReorderRevision] = useState(0);
    const promoteRecentView = useCallback(
        (id: string) => {
            if (useSettings.getState().values.autoSortViews) {
                promoteView(id);
                setReorderRevision((revision) => revision + 1);
            }
        },
        [promoteView],
    );
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    const [activeViewId, setActiveViewId] = useState<string>();
    const shellOutput = useRef(new Map<string, string>());
    const [folderPickerOpen, setFolderPickerOpen] = useState(false);
    const [folderPickerSourceId, setFolderPickerSourceId] = useState<ExecutableSource['id']>();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const activeViews = useMemo(() => views.filter((view) => !view.archived), [views]);
    const archivedViews = useMemo(
        () => views.filter((view) => view.archived).sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0)),
        [views],
    );
    const currentViewId = views.some((view) => view.id === activeViewId) ? activeViewId : activeViews[0]?.id;
    const currentView = views.find((view) => view.id === currentViewId);

    useEffect(() => {
        if (!settingsHydrated) return;

        const archiveExpired = () => {
            const cutoff = Date.now() - autoArchiveDays * 86_400_000;
            archiveInactiveViews(cutoff);
            if (
                currentView &&
                !currentView.archived &&
                currentView.lastActiveAt !== undefined &&
                currentView.lastActiveAt <= cutoff
            ) {
                setActiveViewId(undefined);
            }
        };

        archiveExpired();
        const timer = window.setInterval(archiveExpired, 60_000);
        return () => window.clearInterval(timer);
    }, [archiveInactiveViews, autoArchiveDays, currentView, settingsHydrated]);

    const terminalViewIds = useRef<string[]>([]);
    const viewIds = new Set(views.map((view) => view.id));
    for (const id of shellOutput.current.keys()) {
        if (!viewIds.has(id)) shellOutput.current.delete(id);
    }
    terminalViewIds.current = [
        ...terminalViewIds.current.filter((id) => viewIds.has(id)),
        ...views.map((view) => view.id).filter((id) => !terminalViewIds.current.includes(id)),
    ];
    const terminalViews = terminalViewIds.current.flatMap((id) => {
        const view = views.find((candidate) => candidate.id === id);
        return view ? [view] : [];
    });
    const touchViewFromUser = useCallback(
        (id: string) => updateView(id, { archived: false, lastActiveAt: Date.now() }),
        [updateView],
    );
    const activateView = useCallback((id: string) => setActiveViewId(id), []);

    const openViewInDirectory = useCallback(
        (cwd: string) => {
            const view = openView({ cwd, sourceId: folderPickerSourceId || currentView?.sourceId || defaultSource });
            activateView(view.id);
            setFolderPickerSourceId(undefined);
        },
        [activateView, currentView, defaultSource, folderPickerSourceId, openView],
    );

    const openViewFromPicker = useCallback(
        (source?: ExecutableSource) => {
            const sourceId = source?.id || currentView?.sourceId || defaultSource;
            if (!useNativeFolderPicker) {
                setFolderPickerSourceId(sourceId);
                setFolderPickerOpen(true);
                return;
            }
            void openDialog({
                defaultPath: currentView?.cwd || defaultCwd,
                directory: true,
                multiple: false,
                title: 'Add project',
            })
                .then((cwd) => {
                    if (typeof cwd !== 'string') return;
                    const view = openView({ cwd, sourceId });
                    activateView(view.id);
                })
                .catch(console.error);
        },
        [activateView, currentView, defaultCwd, defaultSource, openView],
    );

    const openSourceAt = useCallback(
        (cwd: string, source: ExecutableSource) => {
            const view = openView(source.executable({ cwd }));
            activateView(view.id);
        },
        [activateView, openView],
    );

    const openSourceHere = useCallback(
        (source: ExecutableSource) => {
            const cwd = currentView?.cwd || defaultCwd;
            if (cwd) openSourceAt(cwd, source);
        },
        [currentView, defaultCwd, openSourceAt],
    );

    const openSearchSession = useCallback(
        (session: SessionSearchResult) => {
            const source = executableSources.find((candidate) => candidate.id === session.sourceId);
            if (!source) return;
            const view = openView({
                cwd: session.cwd,
                sourceId: source.id,
                sessionId: session.sessionId,
                resumeSession: true,
                title: session.title,
            });
            activateView(view.id);
        },
        [activateView, executableSources, openView],
    );

    async function removeCustomSource(id: CustomSourceId) {
        await custom.remove(id);
        if (useSettings.getState().values.defaultSource === id) {
            useSettings.getState().setSetting('defaultSource', BUILTIN_SOURCES.pi.id);
        }
    }

    function deleteView(id: string) {
        removeView(id);
        if (currentViewId === id) setActiveViewId(undefined);
    }

    function moveDraggedView(event: DragEndEvent) {
        if (event.over) moveView(String(event.active.id), String(event.over.id));
    }

    function togglePinnedView(id: string) {
        toggleViewPin(id);
        setReorderRevision((revision) => revision + 1);
    }

    function toggleArchivedView(id: string) {
        if (currentViewId === id && !views.find((view) => view.id === id)?.archived) setActiveViewId(undefined);
        toggleViewArchive(id);
    }

    const switchView = useCallback(
        (index: number) => {
            const view = index < 0 ? activeViews[activeViews.length - 1] : activeViews[index];
            if (view) activateView(view.id);
        },
        [activateView, activeViews],
    );

    useAppHotkey('view.open', 'Control+Shift+N', () => openViewFromPicker());

    if (loadingViews || custom.loading) return null;

    return (
        <main
            className={cn(
                'flex h-svh min-h-0 overflow-hidden bg-background p-2 transition-[gap] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
                views.length > 0 ? 'gap-2' : 'gap-0',
            )}
        >
            {Array.from({ length: 9 }, (_, index) => (
                <ViewSwitchHotkey key={index} index={index} switchView={switchView} />
            ))}
            {executableSources.map((source) => (
                <SourceHotkeys
                    key={source.id}
                    source={source}
                    openHere={openSourceHere}
                    chooseFolder={openViewFromPicker}
                />
            ))}
            <aside
                className={cn(
                    'h-full min-h-0 shrink-0 overflow-hidden transition-[width,opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
                    views.length > 0
                        ? 'w-sm translate-x-0 opacity-100'
                        : 'pointer-events-none w-0 -translate-x-4 opacity-0',
                )}
            >
                <div className="flex h-full w-sm flex-col justify-between space-y-2">
                    <div className="flex min-h-0 flex-1 flex-col space-y-2">
                        <div className="flex gap-2">
                            <AppCommands
                                sources={executableSources}
                                views={activeViews}
                                currentViewId={currentViewId}
                                currentCwd={currentView?.cwd || defaultCwd}
                                openProjects={activeViews.map((view) => view.cwd)}
                                shellOutput={shellOutput.current}
                                onSelectView={activateView}
                                onOpenSession={openSearchSession}
                                onOpenView={openSourceAt}
                                onOpenFolder={() => openViewFromPicker()}
                                onOpenSettings={() => setSettingsOpen(true)}
                            />
                        </div>

                        <div className="min-h-0 flex-1 scroll-fade-b space-y-2 overflow-y-auto">
                            {(error || custom.error) && (
                                <p className="px-3 py-2 text-sm text-destructive">{error || custom.error}</p>
                            )}

                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={moveDraggedView}
                            >
                                <SortableContext
                                    items={activeViews.map((view) => view.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {activeViews.map((view) => (
                                        <ViewButton
                                            key={view.id}
                                            view={view}
                                            active={view.id === currentViewId}
                                            onClick={() => activateView(view.id)}
                                            onDelete={deleteView}
                                            onTogglePin={togglePinnedView}
                                            onToggleArchive={toggleArchivedView}
                                            onTitleChange={(id, title, lockTitle) =>
                                                updateView(id, { title, lockTitle })
                                            }
                                            reorderRevision={reorderRevision}
                                        />
                                    ))}
                                </SortableContext>
                                {archivedViews.length > 0 && (
                                    <Accordion>
                                        <AccordionItem value="archive">
                                            <AccordionTrigger className="px-3 text-xs text-muted-foreground">
                                                Archive ({archivedViews.length})
                                            </AccordionTrigger>
                                            <AccordionContent className="flex flex-col gap-2 pb-2">
                                                {archivedViews.map((view) => (
                                                    <ViewButton
                                                        key={view.id}
                                                        view={view}
                                                        active={view.id === currentViewId}
                                                        onClick={() => activateView(view.id)}
                                                        onDelete={deleteView}
                                                        onTogglePin={togglePinnedView}
                                                        onToggleArchive={toggleArchivedView}
                                                        onTitleChange={(id, title, lockTitle) =>
                                                            updateView(id, { title, lockTitle })
                                                        }
                                                        reorderRevision={reorderRevision}
                                                    />
                                                ))}
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>
                                )}
                            </DndContext>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <GeneralSettingsDialog
                            sources={executableSources}
                            open={settingsOpen}
                            onOpenChange={setSettingsOpen}
                        />
                        <SourcesDialog
                            sources={availableSources}
                            customSources={custom.sources}
                            addSource={custom.add}
                            updateSource={custom.update}
                            sourceOverrides={sourceOverrides}
                            updateSourceOverride={setSourceOverride}
                            removeSource={removeCustomSource}
                        />
                        <HotkeysDialog />
                        <p className="text-muted-foreground">Pimux v{version}</p>
                    </div>
                </div>
            </aside>
            <div className="relative min-w-0 flex-1">
                {!currentViewId && (
                    <Terminal
                        className="absolute inset-0 size-full"
                        pty={false}
                        onReady={renderHeroAscii}
                        onKeyEvent={handleTerminalKey}
                    />
                )}
                {terminalViews.map((view) => {
                    const source =
                        executableSources.find((candidate) => candidate.id === view.sourceId) || BUILTIN_SOURCES.shell;
                    return (
                        <Terminal
                            key={view.id}
                            active={view.id === currentViewId}
                            aria-hidden={view.id !== currentViewId}
                            className={cn(
                                'absolute inset-0 size-full',
                                view.id === currentViewId ? 'z-10' : 'pointer-events-none',
                            )}
                            cwd={view.cwd}
                            sourceId={view.sourceId}
                            sessionId={view.sessionId}
                            resumeSession={view.resumeSession}
                            connectSource={(terminal) =>
                                source.viewButton.connect(terminal, (patch) => {
                                    const { userSubmitted, ...viewPatch } = patch;
                                    updateViewFromSource(view.id, viewPatch);
                                    if (userSubmitted) {
                                        touchViewFromUser(view.id);
                                        promoteRecentView(view.id);
                                    }
                                })
                            }
                            onKeyEvent={handleTerminalKey}
                            onOutput={
                                view.sourceId === BUILTIN_SOURCES.shell.id
                                    ? (text) => {
                                          const output = `${shellOutput.current.get(view.id) || ''}${stripAnsi(text)}`;
                                          shellOutput.current.set(view.id, output.slice(-65_536));
                                      }
                                    : undefined
                            }
                            onSubmit={
                                view.sourceId === BUILTIN_SOURCES.shell.id
                                    ? () => {
                                          touchViewFromUser(view.id);
                                          promoteRecentView(view.id);
                                      }
                                    : undefined
                            }
                        />
                    );
                })}
            </div>
            {!useNativeFolderPicker && (
                <FolderPicker
                    initialCwd={currentView?.cwd || defaultCwd}
                    open={folderPickerOpen}
                    onOpenChange={setFolderPickerOpen}
                    onSelect={openViewInDirectory}
                />
            )}
        </main>
    );
}

export default App;
