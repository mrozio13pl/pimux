import { GlobeIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { getTabDefinition, tabDefinitions } from '@/modules/tabs/registry';
import type { BrowserTab, TabKind, WorkspaceTab } from '@/modules/tabs/types';

type TabStripProps = {
    tabs: WorkspaceTab[];
    activeTabId: string | null;
    onSelectTab(tabId: string): void;
    onCloseTab(tabId: string): void;
    onAddTab(kind: TabKind): void;
};

export function TabStrip({ tabs, activeTabId, onSelectTab, onCloseTab, onAddTab }: TabStripProps) {
    if (tabs.length === 0) return null;

    return (
        <Tabs
            value={activeTabId}
            onValueChange={(value) => {
                if (typeof value === 'string') onSelectTab(value);
            }}
            className="shrink-0 gap-0 border-b bg-sidebar"
        >
            <TabsList
                variant="line"
                className="h-11 w-full justify-start gap-1 overflow-x-auto px-2"
            >
                {tabs.map((tab) => {
                    const definition = getTabDefinition(tab.kind);
                    const Icon = definition.Icon;
                    const active = activeTabId === tab.id;
                    return (
                        <TabsTrigger
                            key={tab.id}
                            value={tab.id}
                            className={cn(
                                'group h-8 max-w-52 flex-none rounded-lg pr-1.5 pl-2.5 text-sm',
                                active
                                    ? 'bg-accent font-semibold text-foreground after:opacity-0'
                                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground after:opacity-0',
                            )}
                        >
                            <TabIcon tab={tab} Icon={Icon} />
                            <span className={cn('min-w-0 truncate', active && 'font-bold')}>
                                {tab.title}
                            </span>
                            <span
                                role="button"
                                tabIndex={-1}
                                aria-label={`Close ${tab.title}`}
                                className={cn(
                                    'grid size-5 shrink-0 place-items-center rounded-md transition-all hover:bg-foreground/10',
                                    active
                                        ? 'opacity-70 hover:opacity-100'
                                        : 'opacity-0 group-hover:opacity-60',
                                )}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onCloseTab(tab.id);
                                }}
                            >
                                <XIcon />
                            </span>
                        </TabsTrigger>
                    );
                })}

                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button variant="ghost" size="icon-sm" className="ml-1 shrink-0">
                                <PlusIcon />
                                <span className="sr-only">Add tab</span>
                            </Button>
                        }
                    />
                    <DropdownMenuContent align="start" className="min-w-44">
                        {tabDefinitions.map((definition) => (
                            <DropdownMenuItem
                                key={definition.kind}
                                onClick={() => onAddTab(definition.kind)}
                            >
                                <definition.Icon />
                                {definition.label}
                                {definition.shortcut ? (
                                    <DropdownMenuShortcut>
                                        {definition.shortcut}
                                    </DropdownMenuShortcut>
                                ) : null}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </TabsList>
        </Tabs>
    );
}

function TabIcon({ tab, Icon }: { tab: WorkspaceTab; Icon: typeof GlobeIcon }) {
    if (tab.kind === 'browser' && tab.favicon) return <BrowserFavicon tab={tab} />;
    return <Icon data-icon="inline-start" />;
}

function BrowserFavicon({ tab }: { tab: BrowserTab }) {
    return <img src={tab.favicon} alt="" className="size-4 shrink-0 rounded-sm object-contain" />;
}
