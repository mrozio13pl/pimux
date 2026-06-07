import { useEffect, useMemo, useState } from 'react';
import { ArrowElbowLeftUpIcon, ArrowLeftIcon, FolderIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ipc } from '@/ipc';
import { Kbd } from '@/components/ui/kbd';

type DirectoryEntry = {
    name: string;
    path: string;
};

type WorkspacePickerProps = {
    open: boolean;
    initialCwd: string | null;
    onClose(): void;
    onAdd(cwd: string): void;
};

export function WorkspacePicker({ open, initialCwd, onClose, onAdd }: WorkspacePickerProps) {
    const [cwd, setCwd] = useState(initialCwd ?? '');
    const [draft, setDraft] = useState(initialCwd ? withTrailingSlash(initialCwd) : '');
    const [entries, setEntries] = useState<DirectoryEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        if (!open) return;
        const start = initialCwd ?? '';
        setCwd(start);
        setDraft(start ? withTrailingSlash(start) : '');
        setError(null);
        setSelectedIndex(1);
        focusInputSoon();
    }, [open, initialCwd]);

    useEffect(() => {
        if (!open || !cwd) return;
        let cancelled = false;
        ipc.system
            .listDirectories({ cwd })
            .then((result) => {
                if (cancelled) return;
                setCwd(result.cwd);
                setEntries(result.entries);
                setError(null);
            })
            .catch((reason) => {
                if (cancelled) return;
                setEntries([]);
                setError(humanizeDirectoryError(reason));
            });
        return () => {
            cancelled = true;
        };
    }, [open, cwd]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey))
                onAdd(cleanPath(draft || cwd));
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, cwd, draft, onAdd, onClose]);

    const parent = useMemo(() => parentDir(cwd), [cwd]);
    const query = useMemo(() => pathQuery(draft, cwd), [draft, cwd]);
    const visibleEntries = useMemo(() => {
        if (!query) return entries;
        return entries.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));
    }, [entries, query]);

    const selectableRows = useMemo(
        () => [
            ...(parent ? [{ kind: 'parent' as const, path: parent }] : []),
            ...visibleEntries.map((entry) => ({ kind: 'entry' as const, path: entry.path })),
        ],
        [parent, visibleEntries],
    );

    useEffect(() => {
        setSelectedIndex(parent && visibleEntries.length > 0 ? 1 : 0);
    }, [query, cwd, parent, visibleEntries.length]);

    if (!open) return null;

    const chooseDirectory = (path: string) => {
        setDraft(withTrailingSlash(path));
        setCwd(path);
        setSelectedIndex(1);
        focusInputSoon();
    };

    const chooseSelected = () => {
        const selected = selectableRows[selectedIndex] ?? selectableRows[0];
        if (selected) chooseDirectory(selected.path);
    };

    const openDraft = () => {
        const exact = visibleEntries.find(
            (entry) => entry.name.toLowerCase() === query.toLowerCase(),
        );
        if (exact) {
            chooseDirectory(exact.path);
            return;
        }
        if (visibleEntries.length === 1 && query) {
            chooseDirectory(visibleEntries[0].path);
            return;
        }
        setCwd(cleanPath(draft));
    };

    return (
        <div
            className="fixed inset-0 z-50 grid place-items-start bg-background/70 pt-14 backdrop-blur-md"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <Command
                shouldFilter={false}
                className="mx-auto h-auto max-h-[min(380px,calc(100vh-72px))] w-[min(620px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-border/70 bg-popover shadow-2xl"
            >
                <div className="flex h-12 items-center gap-2 border-b px-3">
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="shrink-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => (parent ? chooseDirectory(parent) : onClose())}
                                >
                                    <ArrowLeftIcon className="size-4" />
                                    <span className="sr-only">Back</span>
                                </Button>
                            }
                        />
                        <TooltipContent>{parent ? 'Parent directory' : 'Close'}</TooltipContent>
                    </Tooltip>
                    <CommandInput
                        value={draft}
                        onValueChange={setDraft}
                        onKeyDown={(event) => {
                            if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                setSelectedIndex((index) =>
                                    selectableRows.length === 0
                                        ? 0
                                        : (index + 1) % selectableRows.length,
                                );
                            }
                            if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                setSelectedIndex((index) =>
                                    selectableRows.length === 0
                                        ? 0
                                        : (index - 1 + selectableRows.length) %
                                          selectableRows.length,
                                );
                            }
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                if (selectableRows.length > 0) chooseSelected();
                                else openDraft();
                            }
                            if (
                                event.key === 'Backspace' &&
                                draft === withTrailingSlash(cwd) &&
                                parent
                            ) {
                                event.preventDefault();
                                chooseDirectory(parent);
                            }
                        }}
                        className="h-9 px-1 font-mono text-[13px]"
                        placeholder="Path to workspace"
                    />
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="xs"
                                    className="text-xs! shrink-0 rounded-full font-semibold!"
                                    onClick={() => onAdd(cleanPath(draft || cwd))}
                                >
                                    Add
                                </Button>
                            }
                        />
                        <TooltipContent>Add selected workspace</TooltipContent>
                    </Tooltip>
                </div>
                <CommandList className="max-h-72 min-h-0">
                    <CommandGroup heading="Directories">
                        {parent ? (
                            <button
                                type="button"
                                onClick={() => chooseDirectory(parent)}
                                onMouseEnter={() => setSelectedIndex(0)}
                                className={rowClassName(selectedIndex === 0)}
                            >
                                <ArrowElbowLeftUpIcon className="size-4" />
                                ..
                            </button>
                        ) : null}
                        {visibleEntries.map((entry, index) => {
                            const rowIndex = parent ? index + 1 : index;
                            return (
                                <button
                                    key={entry.path}
                                    type="button"
                                    onClick={() => chooseDirectory(entry.path)}
                                    onMouseEnter={() => setSelectedIndex(rowIndex)}
                                    className={rowClassName(selectedIndex === rowIndex)}
                                >
                                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                                    <span className="truncate font-medium">{entry.name}</span>
                                </button>
                            );
                        })}
                        {error ? (
                            <div className="px-2 py-2 text-xs leading-relaxed text-destructive">
                                {error}
                            </div>
                        ) : null}
                        {!error && visibleEntries.length === 0 ? (
                            <div className="px-2 py-2 text-xs text-muted-foreground">
                                No matching directories.
                            </div>
                        ) : null}
                    </CommandGroup>
                </CommandList>
                <div className="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
                    <span>
                        <Kbd>↑↓</Kbd> Navigate
                    </span>
                    <span>
                        <Kbd>Enter</Kbd> Open
                    </span>
                    <span>
                        <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> Add
                    </span>
                    <span>
                        <Kbd>Esc</Kbd> Close
                    </span>
                </div>
            </Command>
        </div>
    );
}

function rowClassName(selected: boolean): string {
    return [
        'flex h-7.5 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors',
        selected ? 'bg-accent text-foreground' : 'hover:bg-accent hover:text-foreground',
    ].join(' ');
}

function focusInputSoon(): void {
    window.setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('[data-slot="command-input"]');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
    }, 0);
}

function pathQuery(draft: string, cwd: string): string {
    const cleanDraft = draft.replace(/\\/g, '/');
    if (cleanDraft === withTrailingSlash(cwd)) return '';
    if (cleanDraft.endsWith('/')) return '';
    return cleanDraft.split('/').at(-1) ?? '';
}

function withTrailingSlash(value: string): string {
    const normalized = value.replace(/\\/g, '/');
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function cleanPath(value: string): string {
    const normalized = value.trim().replace(/\\/g, '/');
    if (normalized === '/') return normalized;
    return normalized.replace(/\/+$/, '');
}

function humanizeDirectoryError(reason: unknown): string {
    const message = reason instanceof Error ? reason.message : String(reason);
    const enoent = message.match(/ENOENT[^']*'([^']+)'/);
    if (enoent) return `Directory does not exist: ${enoent[1]}`;
    const eacces = message.match(/EACCES[^']*'([^']+)'/);
    if (eacces) return `Permission denied: ${eacces[1]}`;
    return 'Could not read directory.';
}

function parentDir(value: string): string | null {
    const normalized = value.replace(/\\/g, '/').replace(/\/$/, '');
    const index = normalized.lastIndexOf('/');
    if (index <= 0) return normalized === '/' ? null : '/';
    return normalized.slice(0, index);
}
