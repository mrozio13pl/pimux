import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';
import { ipc } from '@/ipc';
import type { DiffsTab as DiffsTabModel, DiffSource, TabRenderProps } from '../types';

type LoadState =
    | { status: 'idle'; patch: string; error?: undefined }
    | { status: 'loading'; patch: string; error?: undefined }
    | { status: 'loaded'; patch: string; error?: undefined }
    | { status: 'error'; patch: string; error: string };

const gitSources: Array<{ value: DiffSource; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'staged', label: 'Staged' },
    { value: 'unstaged', label: 'Unstaged' },
];

const DIFFS_SETTINGS_KEY = 'pimux:diffs-settings';

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

const defaultDiffsSettings: DiffsSettings = {
    layout: 'split',
    indicators: 'bars',
    backgrounds: true,
    wrapping: true,
    lineNumbers: true,
    characters: 'none',
};

const diffLayoutValues = new Set<DiffsLayout>(['split', 'stacked']);
const diffIndicatorValues = new Set<DiffIndicators>(['bars', 'classic', 'none']);
const diffLineDiffValues = new Set<DiffsLineDiff>(['word-alt', 'word', 'char', 'none']);

const diffThemeStyle = {
    '--diffs-dark-bg': 'var(--background)',
    '--diffs-dark': 'var(--foreground)',
    '--diffs-font-family': 'var(--font-mono)',
    '--diffs-header-font-family': 'var(--font-sans)',
    '--diffs-bg-context-override': 'var(--background)',
    '--diffs-bg-context-gutter-override': 'var(--background)',
    '--diffs-bg-separator-override': 'var(--border)',
    '--diffs-fg-number-override': 'var(--muted-foreground)',
    // '--diffs-addition-color-override': 'oklch(0.72 0.14 155)',
    // '--diffs-deletion-color-override': 'oklch(0.7 0.18 25)',
} as CSSProperties;

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

const diffUnsafeCSS = `
[data-separator=simple] { min-height: 1px; background-color: var(--border); }
[data-diffs-header] {
    min-height: 36px;
    background-color: var(--card);
    border-bottom: 1px solid var(--border);
    padding-inline: 8px;
    cursor: pointer;
}
pre, code, [data-gutter], [data-content] { background-color: var(--background); }
[data-gutter] [data-gutter-buffer], [data-gutter] [data-column-number] {
    border-right: 1px solid var(--border);
}
[data-diff-type=split][data-overflow=scroll] [data-additions],
[data-diff-type=split][data-overflow=wrap] [data-additions] [data-gutter] {
    border-left-color: var(--border);
}
[data-diff-type=split][data-overflow=scroll] [data-deletions],
[data-diff-type=split][data-overflow=wrap] [data-deletions] [data-content] {
    border-right-color: var(--border);
}
[data-column-number] { color: var(--muted-foreground); }
[data-title] {
    cursor: pointer;
    text-underline-offset: 2px;
}
[data-title]:hover { text-decoration: underline; }
[data-metadata] > slot[name='header-metadata'] { order: -1; }
[data-code] {
    padding-top: 0;
    padding-bottom: 0;
}
[data-line], [data-column-number], [data-no-newline] {
    padding-inline: 1ch;
}
`;

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
                    <DropdownMenu>
                        <DropdownMenuTrigger>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-7 text-muted-foreground hover:text-foreground"
                            >
                                <SlidersHorizontalIcon />
                            </Button>
                        </DropdownMenuTrigger>
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
                                            updateSettings({ characters: value as DiffsLineDiff })
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
            className="h-full overflow-auto bg-background text-sm"
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
