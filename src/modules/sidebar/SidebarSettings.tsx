import { Button } from '@/components/ui/button';
import { DEFAULT_SIDEBAR_SETTINGS, SIDEBAR_SETTINGS_KEY } from '@/lib/constants';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SlidersHorizontalIcon } from '@phosphor-icons/react';
import type { ProjectGroupMode, ProjectSortMode } from './grouping';

export type TabSortMode = 'last-used' | 'created' | 'manual';

export type SidebarSettings = {
    projectSort: ProjectSortMode;
    tabSort: TabSortMode;
    autoOrderWorkspaces: boolean;
    autoOrderTabs: boolean;
    visibleTabs: number;
    projectGroup: ProjectGroupMode;
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
            autoOrderWorkspaces:
                typeof parsed.autoOrderWorkspaces === 'boolean'
                    ? parsed.autoOrderWorkspaces
                    : DEFAULT_SIDEBAR_SETTINGS.autoOrderWorkspaces,
            autoOrderTabs:
                typeof parsed.autoOrderTabs === 'boolean'
                    ? parsed.autoOrderTabs
                    : DEFAULT_SIDEBAR_SETTINGS.autoOrderTabs,
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
        <Tooltip>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <TooltipTrigger
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
                    }
                />
                <DropdownMenuContent align="start" className="min-w-56">
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>Recent activity</DropdownMenuLabel>
                        <DropdownMenuCheckboxItem
                            checked={settings.autoOrderWorkspaces}
                            onCheckedChange={(checked) =>
                                onChange((current) => ({
                                    ...current,
                                    autoOrderWorkspaces: checked === true,
                                }))
                            }
                        >
                            Auto-order workspaces
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                            checked={settings.autoOrderTabs}
                            onCheckedChange={(checked) =>
                                onChange((current) => ({
                                    ...current,
                                    autoOrderTabs: checked === true,
                                }))
                            }
                        >
                            Auto-order tabs
                        </DropdownMenuCheckboxItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                        value={
                            settings.projectSort === 'last-used' ? 'manual' : settings.projectSort
                        }
                        onValueChange={(value) =>
                            onChange((current) => ({
                                ...current,
                                projectSort: value as ProjectSortMode,
                            }))
                        }
                    >
                        <DropdownMenuLabel>Workspace fallback order</DropdownMenuLabel>
                        <DropdownMenuRadioItem value="created">Created at</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="manual">Manual</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                        value={settings.tabSort === 'last-used' ? 'manual' : settings.tabSort}
                        onValueChange={(value) =>
                            onChange((current) => ({ ...current, tabSort: value as TabSortMode }))
                        }
                    >
                        <DropdownMenuLabel>Tab fallback order</DropdownMenuLabel>
                        <DropdownMenuRadioItem value="created">Created at</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="manual">Manual</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>Visible tabs</DropdownMenuLabel>
                        <div className="mx-2 mb-1 flex h-8 items-center justify-between rounded-lg border border-ring px-1 text-sm">
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            disabled={settings.visibleTabs <= 1}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                onChange((current) => ({
                                                    ...current,
                                                    visibleTabs: Math.max(
                                                        1,
                                                        current.visibleTabs - 1,
                                                    ),
                                                }));
                                            }}
                                        >
                                            −
                                        </Button>
                                    }
                                />
                                <TooltipContent>Show fewer tabs</TooltipContent>
                            </Tooltip>
                            <span>{settings.visibleTabs}</span>
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            disabled={settings.visibleTabs >= 12}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                onChange((current) => ({
                                                    ...current,
                                                    visibleTabs: Math.min(
                                                        12,
                                                        current.visibleTabs + 1,
                                                    ),
                                                }));
                                            }}
                                        >
                                            +
                                        </Button>
                                    }
                                />
                                <TooltipContent>Show more tabs</TooltipContent>
                            </Tooltip>
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
                        <DropdownMenuRadioItem value="separate">
                            Keep separate
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            <TooltipContent>Sidebar settings</TooltipContent>
        </Tooltip>
    );
}
