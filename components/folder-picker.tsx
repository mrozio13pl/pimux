import type { FileTreeDirectoryHandle } from '@pierre/trees';
import { FileTree, useFileTree } from '@pierre/trees/react';
import { FolderOpenIcon } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
    Breadcrumb,
    BreadcrumbEllipsis,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DirectoryEntry {
    path: string;
    absolutePath: string;
}

interface DirectoryBreadcrumb {
    label: string;
    path: string;
}

interface DirectoryListing {
    root: string;
    breadcrumbs: DirectoryBreadcrumb[];
    entries: DirectoryEntry[];
}

interface FolderPickerProps {
    initialCwd: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (cwd: string) => void;
}

export function FolderPicker({ initialCwd, open, onOpenChange, onSelect }: FolderPickerProps) {
    const [root, setRoot] = useState(initialCwd);
    const [selectedPaths, setSelectedPaths] = useState<readonly string[]>([]);
    const [breadcrumbs, setBreadcrumbs] = useState<DirectoryBreadcrumb[]>([]);
    const [search, setSearch] = useState<string | null>(null);
    const [error, setError] = useState<string>();
    const content = useRef<HTMLDivElement>(null);
    const searchInput = useRef<HTMLInputElement>(null);
    const entries = useRef(new Map<string, string>());
    const breadcrumbCache = useRef(new Map<string, DirectoryBreadcrumb[]>());
    const loaded = useRef(new Set<string>());
    const { model } = useFileTree({
        density: 'compact',
        icons: 'minimal',
        initialExpansion: 'closed',
        onSelectionChange: setSelectedPaths,
        paths: [],
    });

    const loadRoot = useCallback(
        async (cwd: string) => {
            setError(undefined);
            setSearch(null);
            model.setSearch(null);
            try {
                const listing = await invoke<DirectoryListing>('directory_children', { root: cwd, path: null });
                entries.current = new Map(listing.entries.map((entry) => [entry.path, entry.absolutePath]));
                breadcrumbCache.current = new Map([['', listing.breadcrumbs]]);
                loaded.current = new Set(['']);
                for (const path of model.getSelectedPaths()) model.getItem(path)?.deselect();
                model.resetPaths(listing.entries.map((entry) => entry.path));
                setSelectedPaths([]);
                setBreadcrumbs(listing.breadcrumbs);
                setRoot(listing.root);
            } catch (reason) {
                setError(reason instanceof Error ? reason.message : String(reason));
            }
        },
        [model],
    );

    useEffect(() => {
        if (open && initialCwd) void loadRoot(initialCwd);
    }, [initialCwd, loadRoot, open]);

    useEffect(() => {
        if (!open) {
            setSearch(null);
            model.setSearch(null);
            return;
        }
        const startSearch = (event: KeyboardEvent) => {
            if (
                event.key.length !== 1 ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey ||
                !content.current?.contains(event.target as Node)
            )
                return;
            const target = event.target;
            if (
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                (target instanceof HTMLElement && target.isContentEditable)
            )
                return;
            event.preventDefault();
            setSearch((current) => `${current || ''}${event.key}`);
        };
        window.addEventListener('keydown', startSearch, true);
        return () => window.removeEventListener('keydown', startSearch, true);
    }, [model, open]);

    useEffect(() => {
        if (search === null) return;
        model.setSearch(search);
        searchInput.current?.focus();
    }, [model, search]);

    const selectedPath = selectedPaths.at(-1);
    useEffect(() => {
        if (!open) return;
        if (!selectedPath) {
            setBreadcrumbs(breadcrumbCache.current.get('') || []);
            return;
        }
        const cached = breadcrumbCache.current.get(selectedPath);
        if (cached) {
            setBreadcrumbs(cached);
            return;
        }
        if (loaded.current.has(selectedPath)) return;
        loaded.current.add(selectedPath);
        let cancelled = false;
        void invoke<DirectoryListing>('directory_children', { root, path: selectedPath })
            .then((listing) => {
                if (cancelled) {
                    loaded.current.delete(selectedPath);
                    return;
                }
                for (const entry of listing.entries) entries.current.set(entry.path, entry.absolutePath);
                breadcrumbCache.current.set(selectedPath, listing.breadcrumbs);
                setBreadcrumbs(listing.breadcrumbs);
                model.batch(listing.entries.map((entry) => ({ type: 'add', path: entry.path })));
                const item = model.getItem(selectedPath);
                if (item?.isDirectory()) (item as FileTreeDirectoryHandle).expand();
            })
            .catch((reason: unknown) => {
                loaded.current.delete(selectedPath);
                if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
            });
        return () => {
            cancelled = true;
        };
    }, [model, open, root, selectedPath]);

    const selectedDirectory = (selectedPath && entries.current.get(selectedPath)) || root;
    const breadcrumbItems: Array<{ crumb: DirectoryBreadcrumb } | { hidden: DirectoryBreadcrumb[] }> =
        breadcrumbs.length > 5
            ? [
                  { crumb: breadcrumbs[0] },
                  { hidden: breadcrumbs.slice(1, -3) },
                  ...breadcrumbs.slice(-3).map((crumb) => ({ crumb })),
              ]
            : breadcrumbs.map((crumb) => ({ crumb }));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent ref={content} className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Open folder</DialogTitle>
                    <DialogDescription>Choose the working directory for the new view.</DialogDescription>
                </DialogHeader>

                <div className="flex min-w-0 items-center">
                    <Breadcrumb
                        className="min-w-0 flex-1 rounded-md border bg-muted/50 px-3 py-2"
                        title={selectedDirectory}
                    >
                        <BreadcrumbList className="flex-nowrap overflow-x-auto">
                            {breadcrumbItems.map((item, index) => {
                                if ('hidden' in item) {
                                    return (
                                        <Fragment key="hidden-folders">
                                            {index > 0 && <BreadcrumbSeparator />}
                                            <BreadcrumbItem>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        render={
                                                            <Button size="icon-sm" variant="ghost">
                                                                <BreadcrumbEllipsis />
                                                                <span className="sr-only">Toggle folders</span>
                                                            </Button>
                                                        }
                                                    />
                                                    <DropdownMenuContent align="start">
                                                        <DropdownMenuGroup>
                                                            {item.hidden.map((crumb) => (
                                                                <DropdownMenuItem
                                                                    key={crumb.path}
                                                                    onClick={() => void loadRoot(crumb.path)}
                                                                >
                                                                    {crumb.label}
                                                                </DropdownMenuItem>
                                                            ))}
                                                        </DropdownMenuGroup>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </BreadcrumbItem>
                                        </Fragment>
                                    );
                                }
                                const { crumb } = item;
                                const current = crumb.path === breadcrumbs.at(-1)?.path;
                                return (
                                    <Fragment key={crumb.path}>
                                        {index > 0 && <BreadcrumbSeparator />}
                                        <BreadcrumbItem className="shrink-0">
                                            {current ? (
                                                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                                            ) : (
                                                <BreadcrumbLink
                                                    render={<button type="button" />}
                                                    onClick={() => void loadRoot(crumb.path)}
                                                >
                                                    {crumb.label}
                                                </BreadcrumbLink>
                                            )}
                                        </BreadcrumbItem>
                                    </Fragment>
                                );
                            })}
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>

                {search !== null && (
                    <Input
                        ref={searchInput}
                        value={search}
                        aria-label="Search folders"
                        placeholder="Search folders…"
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Escape') return;
                            event.preventDefault();
                            event.stopPropagation();
                            setSearch(null);
                            model.setSearch(null);
                            requestAnimationFrame(() => content.current?.focus());
                        }}
                    />
                )}

                <div className="overflow-hidden rounded-md border">
                    <FileTree
                        model={model}
                        className="block h-88"
                        style={
                            {
                                '--trees-border-color-override': 'transparent',
                                '--trees-fg-override': 'var(--foreground)',
                                '--trees-selected-bg-override': 'var(--accent)',
                            } as React.CSSProperties
                        }
                    />
                </div>

                {error && (
                    <p className="text-sm text-destructive" role="alert">
                        {error}
                    </p>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        disabled={!selectedDirectory}
                        onClick={() => {
                            onSelect(selectedDirectory);
                            onOpenChange(false);
                        }}
                    >
                        <FolderOpenIcon data-icon="inline-start" />
                        Open folder
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
