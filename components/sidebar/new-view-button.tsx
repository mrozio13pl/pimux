import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, FolderOpenIcon, PenIcon } from '@phosphor-icons/react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useMemo, useState } from 'react';
import { FolderPicker } from '@/components/folder-picker';
import { WorkspaceIcon } from '@/components/sidebar/view-footer';
import { Button } from '@/components/ui/button';
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
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { InputGroupButton } from '@/components/ui/input-group';
import type { ExecutableSource } from '@/lib/sources';
import { useAppHotkey, useSettings } from '@/lib/settings';

const useNativeFolderPicker = /Windows|Macintosh|Mac OS X/.test(navigator.userAgent);

interface NewViewButtonProps {
    sources: ReadonlyArray<ExecutableSource>;
    currentCwd: string;
    openProjects: ReadonlyArray<string>;
    onOpenView: (cwd: string, source: ExecutableSource) => void;
}

function projectName(cwd: string) {
    return (
        cwd
            .replace(/[\\/]+$/, '')
            .split(/[\\/]/)
            .pop() || cwd
    );
}

export function NewViewButton({ sources, currentCwd, openProjects, onOpenView }: NewViewButtonProps) {
    const recentViews = useSettings((state) => state.recentViews);
    const defaultSource = useSettings((state) => state.values.defaultSource);
    const [open, setOpen] = useState(false);
    const [folderPickerOpen, setFolderPickerOpen] = useState(false);
    const [step, setStep] = useState<'project' | 'source'>('project');
    const [cwd, setCwd] = useState(currentCwd);
    const projects = useMemo(
        () => [...new Set([currentCwd, ...openProjects, ...recentViews.map((recent) => recent.cwd)].filter(Boolean))],
        [currentCwd, openProjects, recentViews],
    );
    const orderedSources = useMemo(
        () =>
            [...sources].sort((left, right) => Number(right.id === defaultSource) - Number(left.id === defaultSource)),
        [defaultSource, sources],
    );

    function showProjects() {
        setStep('project');
        setOpen(true);
    }

    function selectProject(project: string) {
        setCwd(project);
        setStep('source');
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

    useAppHotkey('view.new', 'Mod+N', showProjects);

    return (
        <>
            <Button
                className="w-full"
                variant="outline"
                size="lg"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={showProjects}
            >
                <PenIcon data-icon="inline-start" weight="bold" />
                New View
            </Button>
            <CommandDialog
                open={open}
                onOpenChange={setOpen}
                title="New view"
                description="Choose a project, then choose a source."
                className="sm:max-w-xl"
            >
                <Command
                    key={step}
                    onKeyDownCapture={(event) => {
                        if (
                            event.key === 'Backspace' &&
                            step === 'source' &&
                            !(event.currentTarget.querySelector('[cmdk-input]') as HTMLInputElement)?.value
                        ) {
                            event.preventDefault();
                            setStep('project');
                            return;
                        }
                        if (!event.ctrlKey || !/^Digit[1-9]$/.test(event.code)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget
                            .querySelector<HTMLElement>(`[data-shortcut="${event.code.at(-1)}"]:not([hidden])`)
                            ?.click();
                    }}
                >
                    <CommandInput
                        autoFocus
                        placeholder={step === 'project' ? 'Search projects…' : 'Search sources…'}
                        startAddon={
                            step === 'source' ? (
                                <InputGroupButton
                                    size="icon-xs"
                                    aria-label="Back to projects"
                                    onClick={() => setStep('project')}
                                >
                                    <ArrowLeftIcon />
                                </InputGroupButton>
                            ) : undefined
                        }
                    />
                    <CommandList className="max-h-96">
                        <CommandEmpty>No results found.</CommandEmpty>
                        {step === 'project' ? (
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
                        {step === 'source' && (
                            <div>
                                <Kbd>Backspace</Kbd> Back
                            </div>
                        )}
                        <div>
                            <Kbd>Esc</Kbd> Close
                        </div>
                    </div>
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
