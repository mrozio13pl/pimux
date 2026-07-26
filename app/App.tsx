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
import { useCallback, useMemo, useRef, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { AppCommands } from '@/components/commands';
import { FolderPicker } from '@/components/folder-picker';
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
    const defaultSource = useSettings((state) => state.values.defaultSource);
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
    const [folderPickerOpen, setFolderPickerOpen] = useState(false);
    const [folderPickerSourceId, setFolderPickerSourceId] = useState<ExecutableSource['id']>();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const currentViewId = views.some((view) => view.id === activeViewId) ? activeViewId : views[0]?.id;
    const currentView = views.find((view) => view.id === currentViewId);
    const terminalViewIds = useRef<string[]>([]);
    const viewIds = new Set(views.map((view) => view.id));
    terminalViewIds.current = [
        ...terminalViewIds.current.filter((id) => viewIds.has(id)),
        ...views.map((view) => view.id).filter((id) => !terminalViewIds.current.includes(id)),
    ];
    const terminalViews = terminalViewIds.current.flatMap((id) => {
        const view = views.find((candidate) => candidate.id === id);
        return view ? [view] : [];
    });

    const openViewInDirectory = useCallback(
        (cwd: string) => {
            const view = openView({ cwd, sourceId: folderPickerSourceId || currentView?.sourceId || defaultSource });
            setActiveViewId(view.id);
            setFolderPickerSourceId(undefined);
        },
        [currentView, defaultSource, folderPickerSourceId, openView],
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
                    setActiveViewId(view.id);
                })
                .catch(console.error);
        },
        [currentView, defaultCwd, defaultSource, openView],
    );

    const openSourceAt = useCallback(
        (cwd: string, source: ExecutableSource) => {
            const view = openView(source.executable({ cwd }));
            setActiveViewId(view.id);
        },
        [openView],
    );

    const openSourceHere = useCallback(
        (source: ExecutableSource) => {
            const cwd = currentView?.cwd || defaultCwd;
            if (cwd) openSourceAt(cwd, source);
        },
        [currentView, defaultCwd, openSourceAt],
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

    const switchView = useCallback(
        (index: number) => {
            const view = index < 0 ? views[views.length - 1] : views[index];
            if (view) setActiveViewId(view.id);
        },
        [views],
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
                                currentCwd={currentView?.cwd || defaultCwd}
                                openProjects={views.map((view) => view.cwd)}
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
                                    items={views.map((view) => view.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {views.map((view) => (
                                        <ViewButton
                                            key={view.id}
                                            view={view}
                                            active={view.id === currentViewId}
                                            onClick={() => setActiveViewId(view.id)}
                                            onDelete={deleteView}
                                            onTogglePin={togglePinnedView}
                                            onTitleChange={(id, title, lockTitle) =>
                                                updateView(id, { title, lockTitle })
                                            }
                                            reorderRevision={reorderRevision}
                                        />
                                    ))}
                                </SortableContext>
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
                {views.length === 0 && (
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
                                    if (userSubmitted) promoteRecentView(view.id);
                                })
                            }
                            onKeyEvent={handleTerminalKey}
                            onSubmit={
                                view.sourceId === BUILTIN_SOURCES.shell.id
                                    ? () => promoteRecentView(view.id)
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
