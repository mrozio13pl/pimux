import { useEffect, useMemo, useRef, useState } from 'react';
import {
    parsePatchFiles,
    type CodeViewItem,
    type CodeViewOptions,
    type DiffIndicators,
    type FileDiffMetadata,
    type LineDiffTypes,
} from '@pierre/diffs';
import { CodeView } from '@pierre/diffs/react';
import {
    ArrowClockwiseIcon,
    ArrowsOutLineHorizontalIcon,
    ArrowsOutLineVerticalIcon,
    CaretDownIcon,
    CaretRightIcon,
    ExcludeSquareIcon,
    ListIcon,
    ListNumbersIcon,
    PlaceholderIcon,
    PlusMinusIcon,
    SlidersHorizontalIcon,
    TextAlignLeftIcon,
    TextOutdentIcon,
    WarningIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    defaultDiffsSettings,
    DIFFS_SETTINGS_KEY,
    diffIndicatorValues,
    diffLayoutValues,
    diffLineDiffValues,
    diffThemeStyle,
    diffUnsafeCSS,
    gitSources,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ipc } from '@/ipc';
import type { DiffsTab as DiffsTabModel, DiffSource, TabRenderProps } from '../types';

type LoadState =
    | { status: 'idle'; patch: string; error?: undefined }
    | { status: 'loading'; patch: string; error?: undefined }
    | { status: 'loaded'; patch: string; error?: undefined }
    | { status: 'error'; patch: string; error: string };

type DiffsLayout = 'split' | 'stacked';
type DiffsLineDiff = LineDiffTypes;

interface DiffsSettings {
    layout: DiffsLayout;
    indicators: DiffIndicators;
    backgrounds: boolean;
    wrapping: boolean;
    lineNumbers: boolean;
    characters: DiffsLineDiff;
}

function loadDiffsSettings(): DiffsSettings {
    try {
        const raw = localStorage.getItem(DIFFS_SETTINGS_KEY);
        if (!raw) return defaultDiffsSettings;
        const parsed = JSON.parse(raw) as Partial<DiffsSettings>;
        return {
            layout: diffLayoutValues.has(parsed.layout as DiffsLayout)
                ? (parsed.layout as DiffsLayout)
                : defaultDiffsSettings.layout,
            indicators: diffIndicatorValues.has(parsed.indicators as DiffIndicators)
                ? (parsed.indicators as DiffIndicators)
                : defaultDiffsSettings.indicators,
            backgrounds:
                typeof parsed.backgrounds === 'boolean'
                    ? parsed.backgrounds
                    : defaultDiffsSettings.backgrounds,
            wrapping:
                typeof parsed.wrapping === 'boolean'
                    ? parsed.wrapping
                    : defaultDiffsSettings.wrapping,
            lineNumbers:
                typeof parsed.lineNumbers === 'boolean'
                    ? parsed.lineNumbers
                    : defaultDiffsSettings.lineNumbers,
            characters: diffLineDiffValues.has(parsed.characters as DiffsLineDiff)
                ? (parsed.characters as DiffsLineDiff)
                : defaultDiffsSettings.characters,
        };
    } catch {
        return defaultDiffsSettings;
    }
}

function persistDiffsSettings(settings: DiffsSettings) {
    localStorage.setItem(DIFFS_SETTINGS_KEY, JSON.stringify(settings));
}

export function DiffsTab({ tab, workspace, updateTab }: TabRenderProps<DiffsTabModel>) {
    const [isGit, setIsGit] = useState<boolean | null>(null);
    const [state, setState] = useState<LoadState>({ status: 'idle', patch: '' });
    const [settings, setSettings] = useState<DiffsSettings>(() => loadDiffsSettings());
    const source = tab.source ?? (isGit === false ? 'pi-session' : 'all');
    const sources = useMemo(
        () =>
            isGit === false ? [{ value: 'pi-session' as const, label: 'Pi session' }] : gitSources,
        [isGit],
    );
    const sourceLabel = sources.find((candidate) => candidate.value === source)?.label ?? 'All';

    useEffect(() => {
        persistDiffsSettings(settings);
    }, [settings]);

    useEffect(() => {
        let cancelled = false;
        setState((current) => ({ status: 'loading', patch: current.patch }));
        ipc.diffs
            .get({ cwd: workspace.cwd, source })
            .then((result) => {
                if (cancelled) return;
                setIsGit(result.isGit);
                if (result.source !== source) updateTab({ ...tab, source: result.source });
                setState({ status: 'loaded', patch: result.patch });
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                setState({
                    status: 'error',
                    patch: '',
                    error: error instanceof Error ? error.message : String(error),
                });
            });
        return () => {
            cancelled = true;
        };
    }, [source, tab, updateTab, workspace.cwd]);

    function setSource(next: DiffSource) {
        updateTab({ ...tab, source: next, updatedAt: Date.now() });
    }

    function updateSettings(patch: Partial<DiffsSettings>) {
        setSettings((current) => ({ ...current, ...patch }));
    }

    function refresh() {
        setState((current) => ({ status: 'loading', patch: current.patch }));
        ipc.diffs
            .get({ cwd: workspace.cwd, source })
            .then((result) => {
                setIsGit(result.isGit);
                setState({ status: 'loaded', patch: result.patch });
            })
            .catch((error: unknown) => {
                setState({
                    status: 'error',
                    patch: '',
                    error: error instanceof Error ? error.message : String(error),
                });
            });
    }

    return (
        <div className="flex h-full flex-col bg-sidebar">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                variant="secondary"
                                size="sm"
                                className="min-w-32 justify-between"
                            >
                                {sourceLabel}
                                <CaretDownIcon data-icon="inline-end" />
                            </Button>
                        }
                    />
                    <DropdownMenuContent align="start" className="min-w-40">
                        <DropdownMenuRadioGroup
                            value={source}
                            onValueChange={(value) => setSource(value as DiffSource)}
                        >
                            {sources.map((candidate) => (
                                <DropdownMenuRadioItem
                                    key={candidate.value}
                                    value={candidate.value}
                                >
                                    {candidate.label}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
                <div className="ml-auto text-xs text-muted-foreground flex items-center gap-0.5">
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="size-7 text-muted-foreground hover:text-foreground"
                                    onClick={refresh}
                                    disabled={state.status === 'loading'}
                                >
                                    <ArrowClockwiseIcon
                                        data-icon="inline-start"
                                        className={cn(state.status === 'loading' && 'animate-spin')}
                                    />
                                </Button>
                            }
                        />
                        <TooltipContent>Refresh diffs</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <TooltipTrigger
                                        render={
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                className="size-7 text-muted-foreground hover:text-foreground"
                                            >
                                                <SlidersHorizontalIcon />
                                            </Button>
                                        }
                                    />
                                }
                            />
                            <DropdownMenuContent align="end" className="min-w-56">
                                <DropdownMenuGroup>
                                    <DropdownMenuRadioGroup
                                        value={settings.layout}
                                        onValueChange={(value) =>
                                            updateSettings({ layout: value as DiffsLayout })
                                        }
                                    >
                                        <DropdownMenuLabel>Layout</DropdownMenuLabel>
                                        <DropdownMenuRadioItem value="split">
                                            <ArrowsOutLineHorizontalIcon />
                                            Split
                                        </DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="stacked">
                                            <ArrowsOutLineVerticalIcon />
                                            Stacked
                                        </DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuGroup>
                                    <DropdownMenuRadioGroup
                                        value={settings.indicators}
                                        onValueChange={(value) =>
                                            updateSettings({ indicators: value as DiffIndicators })
                                        }
                                    >
                                        <DropdownMenuLabel>Vertical bars</DropdownMenuLabel>
                                        <DropdownMenuRadioItem value="bars">
                                            <ListIcon />
                                            Bars
                                        </DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="classic">
                                            <PlusMinusIcon />
                                            Classic
                                        </DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="none">
                                            <PlaceholderIcon />
                                            None
                                        </DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuGroup>
                                    <DropdownMenuLabel>Changes</DropdownMenuLabel>
                                    <DropdownMenuCheckboxItem
                                        checked={settings.backgrounds}
                                        onCheckedChange={(checked) =>
                                            updateSettings({ backgrounds: checked === true })
                                        }
                                    >
                                        <TextAlignLeftIcon weight="fill" />
                                        Backgrounds
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem
                                        checked={settings.wrapping}
                                        onCheckedChange={(checked) =>
                                            updateSettings({ wrapping: checked === true })
                                        }
                                    >
                                        <TextOutdentIcon />
                                        Wrapping
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem
                                        checked={settings.lineNumbers}
                                        onCheckedChange={(checked) =>
                                            updateSettings({ lineNumbers: checked === true })
                                        }
                                    >
                                        <ListNumbersIcon />
                                        Line numbers
                                    </DropdownMenuCheckboxItem>
                                </DropdownMenuGroup>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                        <ExcludeSquareIcon />
                                        Characters
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuRadioGroup
                                            value={settings.characters}
                                            onValueChange={(value) =>
                                                updateSettings({
                                                    characters: value as DiffsLineDiff,
                                                })
                                            }
                                        >
                                            <DropdownMenuRadioItem value="word-alt">
                                                Word-alt
                                            </DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="word">
                                                Word
                                            </DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="char">
                                                Character
                                            </DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="none">
                                                None
                                            </DropdownMenuRadioItem>
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <TooltipContent>Diff settings</TooltipContent>
                    </Tooltip>
                </div>
            </div>
            <div className="min-h-0 flex-1">
                {state.status === 'error' ? <ErrorState error={state.error} /> : null}
                {state.status !== 'error' && !state.patch.trim() ? (
                    <EmptyState source={sourceLabel} isGit={isGit} />
                ) : null}
                {state.status !== 'error' && state.patch.trim() ? (
                    <DiffCodeView patch={state.patch} cwd={workspace.cwd} settings={settings} />
                ) : null}
            </div>
        </div>
    );
}

function EmptyState({ source, isGit }: { source: string; isGit: boolean | null }) {
    return (
        <div className="grid h-full place-items-center text-center">
            <div>
                <p className="text-sm font-semibold text-foreground">
                    {isGit === false ? 'No Pi session edits yet' : 'No changes'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Source: {source}</p>
            </div>
        </div>
    );
}

function openInEditor(filePath: string, line?: number) {
    void ipc.system.openEditor({ path: filePath, line });
}

function DiffCodeView({
    patch,
    cwd,
    settings,
}: {
    patch: string;
    cwd: string;
    settings: DiffsSettings;
}) {
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
    const items = useMemo<CodeViewItem[]>(() => {
        return parsePatchFiles(patch, `diffs:${cwd}:${hashString(patch)}`, true).flatMap(
            (parsedPatch, patchIndex) =>
                parsedPatch.files.map((fileDiff, fileIndex) => {
                    const id = `${patchIndex}:${fileIndex}:${fileDiff.name}`;
                    const collapsed = collapsedIds.has(id);
                    return {
                        id,
                        type: 'diff' as const,
                        fileDiff,
                        collapsed,
                        version: hashString(
                            `${fileDiff.cacheKey ?? ''}:${fileDiff.name}:${patch.length}:${collapsed}`,
                        ),
                    };
                }),
        );
    }, [collapsedIds, cwd, patch]);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        function handleClick(event: MouseEvent) {
            const path = event.composedPath();
            const titleElement = path.find(
                (target): target is HTMLElement =>
                    target instanceof HTMLElement && target.hasAttribute('data-title'),
            );
            const headerElement = path.find(
                (target): target is HTMLElement =>
                    target instanceof HTMLElement && target.hasAttribute('data-diffs-header'),
            );
            if (!headerElement) return;

            const fileName = headerElement.querySelector('[data-title]')?.textContent?.trim();
            if (!fileName) return;

            const item = items.find(
                (candidate) => candidate.type === 'diff' && candidate.fileDiff.name === fileName,
            );
            if (!item || item.type !== 'diff') return;

            if (titleElement) {
                const filePath = getFileDiffPath(cwd, item.fileDiff);
                if (filePath) openInEditor(filePath);
                return;
            }

            setCollapsedIds((current) => {
                const next = new Set(current);
                if (next.has(item.id)) next.delete(item.id);
                else next.add(item.id);
                return next;
            });
        }

        container.addEventListener('click', handleClick);
        return () => container.removeEventListener('click', handleClick);
    }, [cwd, items]);

    const options = useMemo<CodeViewOptions<undefined>>(
        () => ({
            themeType: 'dark',
            diffStyle: settings.layout === 'stacked' ? 'unified' : 'split',
            diffIndicators: settings.indicators,
            disableBackground: !settings.backgrounds,
            overflow: settings.wrapping ? 'wrap' : 'scroll',
            disableLineNumbers: !settings.lineNumbers,
            lineDiffType: settings.characters,
            hunkSeparators: 'simple',
            layout: { paddingTop: 0, paddingBottom: 0, gap: 0 },
            stickyHeaders: true,
            unsafeCSS: diffUnsafeCSS,
            onLineNumberClick: ({ lineNumber }, context) => {
                if (context.type !== 'diff') return;
                const filePath = getFileDiffPath(cwd, context.item.fileDiff);
                if (filePath) openInEditor(filePath, lineNumber);
            },
        }),
        [cwd, settings],
    );

    return (
        <CodeView
            items={items}
            className="h-full overflow-auto bg-sidebar text-sm"
            style={diffThemeStyle}
            containerRef={containerRef}
            renderHeaderPrefix={(item) => {
                if (item.type !== 'diff') return null;
                return item.collapsed ? (
                    <CaretRightIcon className="size-3 text-muted-foreground" />
                ) : (
                    <CaretDownIcon className="size-3 text-muted-foreground" />
                );
            }}
            options={options}
        />
    );
}

function getFileDiffPath(cwd: string, fileDiff: FileDiffMetadata): string | null {
    if (fileDiff.type === 'deleted') return null;
    const file = fileDiff.name;
    if (!file || file === '/dev/null') return null;
    if (file.startsWith('/')) return file;
    return `${cwd.replace(/[\\/]$/, '')}/${file}`;
}

function hashString(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index++) {
        hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return hash;
}

function ErrorState({ error }: { error: string }) {
    return (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <WarningIcon />
                Failed to load diff
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
        </div>
    );
}
