import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, FolderOpenIcon, GearIcon, PenIcon } from '@phosphor-icons/react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { formatForDisplay, type Hotkey } from '@tanstack/react-hotkeys';
import { useMemo, useState } from 'react';
import { FolderPicker } from '@/components/folder-picker';
import { NewViewButton } from '@/components/sidebar/new-view-button';
import { WorkspaceIcon } from '@/components/sidebar/view-footer';
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
} from '@/components/ui/command';
import { InputGroupButton } from '@/components/ui/input-group';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import type { ExecutableSource } from '@/lib/sources';
import { useAppHotkey, useAppHotkeyValue, useSettings } from '@/lib/settings';
import type { View } from '@/lib/views';
import { ViewFinder, type SessionSearchResult } from '@/components/view-finder';

const useNativeFolderPicker = /Windows|Macintosh|Mac OS X/.test(navigator.userAgent);
type CommandPage = 'commands' | 'project' | 'source';

interface AppCommandsProps {
    sources: ReadonlyArray<ExecutableSource>;
    views: ReadonlyArray<View>;
    currentViewId?: string;
    currentCwd: string;
    openProjects: ReadonlyArray<string>;
    shellOutput: ReadonlyMap<string, string>;
    onSelectView: (id: string) => void;
    onOpenSession: (session: SessionSearchResult) => void;
    onOpenView: (cwd: string, source: ExecutableSource) => void;
    onOpenFolder: () => void;
    onOpenSettings: () => void;
}

function projectName(cwd: string) {
    return (
        cwd
            .replace(/[\\/]+$/, '')
            .split(/[\\/]/)
            .pop() || cwd
    );
}

function HotkeyShortcut({ hotkey }: { hotkey?: Hotkey }) {
    if (!hotkey) return null;
    return (
        <CommandShortcut>
            <Kbd>{formatForDisplay(hotkey)}</Kbd>
        </CommandShortcut>
    );
}

function CommandFooter({ back }: { back: boolean }) {
    return (
        <div className="-m-1 mt-1.5 flex items-center gap-2 rounded-b-lg border-t bg-muted/50 px-4 py-3 text-sm text-muted-foreground [&_div]:flex [&_div]:gap-1">
            <div>
                <KbdGroup>
                    <Kbd>
                        <ArrowUpIcon weight="bold" />
                    </Kbd>
                    <Kbd>
                        <ArrowDownIcon weight="bold" />
                    </Kbd>
                </KbdGroup>{' '}
                Navigate
            </div>
            <div>
                <Kbd>Enter</Kbd> Select
            </div>
            {back && (
                <div>
                    <Kbd>Backspace</Kbd> Back
                </div>
            )}
            <div>
                <Kbd>Esc</Kbd> Close
            </div>
        </div>
    );
}

export function AppCommands({
    sources,
    views,
    currentViewId,
    currentCwd,
    openProjects,
    shellOutput,
    onSelectView,
    onOpenSession,
    onOpenView,
    onOpenFolder,
    onOpenSettings,
}: AppCommandsProps) {
    const recentViews = useSettings((state) => state.recentViews);
    const defaultSource = useSettings((state) => state.values.defaultSource);
    const openFolderHotkey = useAppHotkeyValue('view.open', 'Control+Shift+N');
    const openSettingsHotkey = useAppHotkeyValue('pimux.open-settings', 'Mod+I');
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState<CommandPage>('commands');
    const [folderPickerOpen, setFolderPickerOpen] = useState(false);
    const [cwd, setCwd] = useState(currentCwd);
    const [commandQuery, setCommandQuery] = useState('');
    const projects = useMemo(
        () => [...new Set([currentCwd, ...openProjects, ...recentViews.map((recent) => recent.cwd)].filter(Boolean))],
        [currentCwd, openProjects, recentViews],
    );
    const orderedSources = useMemo(
        () =>
            [...sources].sort((left, right) => Number(right.id === defaultSource) - Number(left.id === defaultSource)),
        [defaultSource, sources],
    );
    function showCommands() {
        if (open && page === 'commands') {
            setOpen(false);
            return;
        }
        setCommandQuery('');
        setPage('commands');
        setOpen(true);
    }

    function showNewView() {
        setCwd(currentCwd);
        setPage('project');
        setOpen(true);
    }

    function selectView(id: string) {
        onSelectView(id);
        setOpen(false);
    }

    function selectSession(session: SessionSearchResult) {
        onOpenSession(session);
        setOpen(false);
    }

    function goBack() {
        setPage(page === 'source' ? 'project' : 'commands');
    }

    function selectProject(project: string) {
        setCwd(project);
        setPage('source');
    }

    function selectSource(source: ExecutableSource) {
        onOpenView(cwd, source);
        setOpen(false);
    }

    async function browse() {
        if (!useNativeFolderPicker) {
            setOpen(false);
            setFolderPickerOpen(true);
            return;
        }
        const project = await openDialog({
            defaultPath: currentCwd,
            directory: true,
            multiple: false,
            title: 'Choose project',
        });
        if (typeof project === 'string') selectProject(project);
    }

    function openFolder() {
        setOpen(false);
        onOpenFolder();
    }

    function openSettings() {
        setOpen(false);
        onOpenSettings();
    }

    useAppHotkey('pimux.commands', 'Mod+K', showCommands, 'Open command palette');
    const newViewHotkey = useAppHotkey('view.new', 'Mod+N', showNewView, 'New view');

    return (
        <>
            <NewViewButton open={open && (page === 'project' || page === 'source')} onClick={showNewView} />
            <CommandDialog
                open={open}
                onOpenChange={setOpen}
                title={page === 'commands' ? 'Commands' : 'New view'}
                description={
                    page === 'commands'
                        ? 'Search commands, open views, and local agent sessions.'
                        : 'Choose a project, then choose a source.'
                }
                className="sm:max-w-xl"
            >
                <Command
                    key={page}
                    onKeyDownCapture={(event) => {
                        const input = event.currentTarget.querySelector('[cmdk-input]') as HTMLInputElement;
                        if (event.key === 'Backspace' && page !== 'commands' && !input?.value) {
                            event.preventDefault();
                            goBack();
                            return;
                        }
                        if (
                            (page !== 'project' && page !== 'source') ||
                            !event.ctrlKey ||
                            !/^Digit[1-9]$/.test(event.code)
                        )
                            return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget
                            .querySelector<HTMLElement>(`[data-shortcut="${event.code.at(-1)}"]:not([hidden])`)
                            ?.click();
                    }}
                >
                    <CommandInput
                        autoFocus
                        value={page === 'commands' ? commandQuery : undefined}
                        onValueChange={page === 'commands' ? setCommandQuery : undefined}
                        placeholder={
                            page === 'commands'
                                ? 'Search commands, views, and sessions…'
                                : page === 'project'
                                  ? 'Search projects…'
                                  : 'Search sources…'
                        }
                        startAddon={
                            page !== 'commands' ? (
                                <InputGroupButton size="icon-xs" aria-label="Back" onClick={goBack}>
                                    <ArrowLeftIcon />
                                </InputGroupButton>
                            ) : undefined
                        }
                    />
                    <CommandList className="max-h-96 scroll-fade-b">
                        <CommandEmpty>No results found.</CommandEmpty>
                        {page === 'commands' ? (
                            <>
                                <CommandGroup heading="Actions">
                                    <CommandItem value="New view project source" onSelect={showNewView}>
                                        <PenIcon />
                                        New View
                                        <HotkeyShortcut hotkey={newViewHotkey} />
                                    </CommandItem>
                                    <CommandItem value="Add project folder directory" onSelect={openFolder}>
                                        <FolderOpenIcon />
                                        Add project
                                        <HotkeyShortcut hotkey={openFolderHotkey} />
                                    </CommandItem>
                                    <CommandItem value="Open settings preferences" onSelect={openSettings}>
                                        <GearIcon />
                                        Open settings
                                        <HotkeyShortcut hotkey={openSettingsHotkey} />
                                    </CommandItem>
                                </CommandGroup>
                                <ViewFinder
                                    sources={sources}
                                    views={views}
                                    currentViewId={currentViewId}
                                    shellOutput={shellOutput}
                                    query={commandQuery}
                                    onSelectView={selectView}
                                    onSelectSession={selectSession}
                                />
                            </>
                        ) : page === 'project' ? (
                            <CommandGroup heading="Projects">
                                {projects.map((project, index) => (
                                    <CommandItem
                                        key={project}
                                        value={`${projectName(project)} ${project}`}
                                        data-shortcut={index < 9 ? index + 1 : undefined}
                                        onSelect={() => selectProject(project)}
                                    >
                                        <WorkspaceIcon cwd={project} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">{projectName(project)}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {project}
                                            </span>
                                        </span>
                                        {index < 9 && (
                                            <CommandShortcut>
                                                <Kbd>Ctrl {index + 1}</Kbd>
                                            </CommandShortcut>
                                        )}
                                    </CommandItem>
                                ))}
                                <CommandItem
                                    value="Choose another project folder directory"
                                    data-shortcut={projects.length < 9 ? projects.length + 1 : undefined}
                                    onSelect={() => void browse()}
                                >
                                    <FolderOpenIcon />
                                    Choose another project…
                                    {projects.length < 9 && (
                                        <CommandShortcut>
                                            <Kbd>Ctrl {projects.length + 1}</Kbd>
                                        </CommandShortcut>
                                    )}
                                </CommandItem>
                            </CommandGroup>
                        ) : (
                            <CommandGroup heading="Sources">
                                {orderedSources.map((source, index) => (
                                    <CommandItem
                                        key={source.id}
                                        value={source.title}
                                        data-shortcut={index < 9 ? index + 1 : undefined}
                                        onSelect={() => selectSource(source)}
                                    >
                                        {source.icon}
                                        <span className="font-medium">{source.title}</span>
                                        {source.experimental && (
                                            <span className="rounded-sm bg-muted px-2 py-px text-xs text-muted-foreground">
                                                Experimental
                                            </span>
                                        )}
                                        {index < 9 && (
                                            <CommandShortcut>
                                                <Kbd>Ctrl {index + 1}</Kbd>
                                            </CommandShortcut>
                                        )}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                    <CommandFooter back={page !== 'commands'} />
                </Command>
            </CommandDialog>
            {!useNativeFolderPicker && (
                <FolderPicker
                    initialCwd={currentCwd}
                    open={folderPickerOpen}
                    onOpenChange={setFolderPickerOpen}
                    onSelect={(project) => {
                        selectProject(project);
                        setOpen(true);
                    }}
                />
            )}
        </>
    );
}
