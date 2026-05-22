import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SlidersHorizontalIcon } from '@phosphor-icons/react';
import type { ProjectGroupMode, ProjectSortMode } from './grouping';

export type TabSortMode = 'last-used' | 'created' | 'manual';

export type SidebarSettings = {
    projectSort: ProjectSortMode;
    tabSort: TabSortMode;
    visibleTabs: number;
    projectGroup: ProjectGroupMode;
};

const SIDEBAR_SETTINGS_KEY = 'pimux:sidebar-settings';
const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = {
    projectSort: 'last-used',
    tabSort: 'last-used',
    visibleTabs: 3,
    projectGroup: 'separate',
};

export function loadSidebarSettings(): SidebarSettings {
    try {
        const raw = localStorage.getItem(SIDEBAR_SETTINGS_KEY);
        if (!raw) return DEFAULT_SIDEBAR_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<SidebarSettings>;
        return {
            projectSort: isProjectSortMode(parsed.projectSort)
                ? parsed.projectSort
                : DEFAULT_SIDEBAR_SETTINGS.projectSort,
            tabSort: isTabSortMode(parsed.tabSort)
                ? parsed.tabSort
                : isTabSortMode((parsed as { threadSort?: unknown }).threadSort)
                  ? (parsed as { threadSort: TabSortMode }).threadSort
                  : DEFAULT_SIDEBAR_SETTINGS.tabSort,
            visibleTabs:
                typeof parsed.visibleTabs === 'number'
                    ? Math.min(12, Math.max(1, Math.round(parsed.visibleTabs)))
                    : typeof (parsed as { visibleThreads?: unknown }).visibleThreads === 'number'
                      ? Math.min(
                            12,
                            Math.max(
                                1,
                                Math.round((parsed as { visibleThreads: number }).visibleThreads),
                            ),
                        )
                      : DEFAULT_SIDEBAR_SETTINGS.visibleTabs,
            projectGroup: isProjectGroupMode(parsed.projectGroup)
                ? parsed.projectGroup
                : DEFAULT_SIDEBAR_SETTINGS.projectGroup,
        };
    } catch {
        return DEFAULT_SIDEBAR_SETTINGS;
    }
}

export function persistSidebarSettings(settings: SidebarSettings) {
    localStorage.setItem(SIDEBAR_SETTINGS_KEY, JSON.stringify(settings));
}

function isProjectSortMode(value: unknown): value is ProjectSortMode {
    return value === 'last-used' || value === 'created' || value === 'manual';
}

function isTabSortMode(value: unknown): value is TabSortMode {
    return value === 'last-used' || value === 'created' || value === 'manual';
}

function isProjectGroupMode(value: unknown): value is ProjectGroupMode {
    return value === 'separate' || value === 'repository' || value === 'repository-path';
}

export function SidebarSettingsMenu({
    settings,
    onChange,
}: {
    settings: SidebarSettings;
    onChange(update: SidebarSettings | ((current: SidebarSettings) => SidebarSettings)): void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 text-muted-foreground hover:text-foreground"
                    >
                        <SlidersHorizontalIcon />
                        <span className="sr-only">Sidebar settings</span>
                    </Button>
                }
            />
            <DropdownMenuContent align="start" className="min-w-56">
                <DropdownMenuRadioGroup
                    value={settings.projectSort}
                    onValueChange={(value) =>
                        onChange((current) => ({
                            ...current,
                            projectSort: value as ProjectSortMode,
                        }))
                    }
                >
                    <DropdownMenuLabel>Sort projects</DropdownMenuLabel>
                    <DropdownMenuRadioItem value="last-used">
                        Last user message
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="created">Created at</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="manual">Manual</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                    value={settings.tabSort}
                    onValueChange={(value) =>
                        onChange((current) => ({ ...current, tabSort: value as TabSortMode }))
                    }
                >
                    <DropdownMenuLabel>Sort tabs</DropdownMenuLabel>
                    <DropdownMenuRadioItem value="last-used">
                        Last user message
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="created">Created at</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="manual">Manual</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuLabel>Visible tabs</DropdownMenuLabel>
                    <div className="mx-2 mb-1 flex h-8 items-center justify-between rounded-lg border border-ring px-1 text-sm">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={settings.visibleTabs <= 1}
                            onClick={(event) => {
                                event.preventDefault();
                                onChange((current) => ({
                                    ...current,
                                    visibleTabs: Math.max(1, current.visibleTabs - 1),
                                }));
                            }}
                        >
                            −
                        </Button>
                        <span>{settings.visibleTabs}</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={settings.visibleTabs >= 12}
                            onClick={(event) => {
                                event.preventDefault();
                                onChange((current) => ({
                                    ...current,
                                    visibleTabs: Math.min(12, current.visibleTabs + 1),
                                }));
                            }}
                        >
                            +
                        </Button>
                    </div>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                    value={settings.projectGroup}
                    onValueChange={(value) =>
                        onChange((current) => ({
                            ...current,
                            projectGroup: value as ProjectGroupMode,
                        }))
                    }
                >
                    <DropdownMenuLabel>Group projects</DropdownMenuLabel>
                    <DropdownMenuRadioItem value="repository">
                        Group by repository
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="repository-path">
                        Group by repository path
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="separate">Keep separate</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
