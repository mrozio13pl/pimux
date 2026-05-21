import { useState } from 'react';
import {
    CodeIcon,
    CopyIcon,
    FolderOpenIcon,
    GlobeIcon,
    PlusIcon,
    PushPinIcon,
    PushPinSlashIcon,
    TextTIcon,
    TrashIcon,
    XIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, copyText } from '@/lib/utils';
import { HotkeyIndicator } from '@/modules/hotkeys';
import { getTabDefinition, tabDefinitions } from '@/modules/tabs/registry';
import { ipc } from '@/ipc';
import type { Workspace } from '@/modules/workspace/types';
import type { BrowserTab, TabKind, WorkspaceTab } from '@/modules/tabs/types';
import type { PiStatusEvent } from '../../../shared/events';

type TabStripProps = {
    tabs: WorkspaceTab[];
    workspace: Workspace;
    activeTabId: string | null;
    piStatuses: Record<string, PiStatusEvent>;
    onSelectTab(tabId: string): void;
    onCloseTab(tabId: string): void;
    onAddTab(kind: TabKind): void;
    onToggleTabPin(tabId: string): void;
    showHotkeyIndicators?: boolean;
};

export function TabStrip({
    tabs,
    workspace,
    activeTabId,
    piStatuses,
    onSelectTab,
    onCloseTab,
    onAddTab,
    onToggleTabPin,
    showHotkeyIndicators = false,
}: TabStripProps) {
    const [deleteTarget, setDeleteTarget] = useState<WorkspaceTab | null>(null);
    if (tabs.length === 0) return null;

    return (
        <>
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
                    {tabs.map((tab, index) => {
                        const definition = getTabDefinition(tab.kind);
                        const Icon = definition.Icon;
                        const active = activeTabId === tab.id;
                        return (
                            <ContextMenu key={tab.id}>
                                <ContextMenuTrigger
                                    render={
                                        <TabsTrigger
                                            value={tab.id}
                                            className={cn(
                                                'group h-8 max-w-52 flex-none rounded-lg pr-1.5 pl-2.5 text-sm',
                                                active
                                                    ? 'bg-accent font-semibold text-foreground after:opacity-0'
                                                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground after:opacity-0',
                                            )}
                                        />
                                    }
                                >
                                    <TabIcon tab={tab} Icon={Icon} />
                                    <span className={cn('min-w-0 truncate', active && 'font-bold')}>
                                        {tab.title}
                                    </span>
                                    {tab.pinned ? (
                                        <PushPinIcon className="size-3 shrink-0" />
                                    ) : null}
                                    <HotkeyIndicator
                                        visible={showHotkeyIndicators && index < 9}
                                        keys={`Ctrl+${index + 1}`}
                                        className="ml-1 shrink-0"
                                    />
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
                                </ContextMenuTrigger>
                                <TabContextMenuContent
                                    tab={tab}
                                    workspace={workspace}
                                    onTogglePin={() => onToggleTabPin(tab.id)}
                                    onDelete={() => {
                                        if (shouldConfirmTabDelete(tab, piStatuses[tab.id])) {
                                            setDeleteTarget(tab);
                                            return;
                                        }
                                        onCloseTab(tab.id);
                                    }}
                                />
                            </ContextMenu>
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
            <DeleteConfirmDialog
                tab={deleteTarget}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
                onConfirm={() => {
                    if (!deleteTarget) return;
                    onCloseTab(deleteTarget.id);
                    setDeleteTarget(null);
                }}
            />
        </>
    );
}

function TabContextMenuContent({
    tab,
    workspace,
    onTogglePin,
    onDelete,
}: {
    tab: WorkspaceTab;
    workspace: Workspace;
    onTogglePin(): void;
    onDelete(): void;
}) {
    return (
        <ContextMenuContent className="min-w-56">
            <ContextMenuGroup>
                <ContextMenuItem onClick={onTogglePin}>
                    {tab.pinned ? <PushPinSlashIcon /> : <PushPinIcon />}
                    {tab.pinned ? 'Unpin tab' : 'Pin tab'}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => copyText(tab.title)}>
                    <TextTIcon />
                    Copy title
                </ContextMenuItem>
                <ContextMenuItem onClick={() => copyText(workspace.cwd)}>
                    <CopyIcon />
                    Copy path
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => void ipc.system.openEditor({ path: workspace.cwd })}
                >
                    <CodeIcon />
                    Open in editor
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => void ipc.system.revealInFileManager({ path: workspace.cwd })}
                >
                    <FolderOpenIcon />
                    Open in file manager
                </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
                <ContextMenuItem variant="destructive" onClick={onDelete}>
                    <TrashIcon />
                    Delete from Pimux
                </ContextMenuItem>
            </ContextMenuGroup>
        </ContextMenuContent>
    );
}

function DeleteConfirmDialog({
    tab,
    onOpenChange,
    onConfirm,
}: {
    tab: WorkspaceTab | null;
    onOpenChange(open: boolean): void;
    onConfirm(): void;
}) {
    return (
        <AlertDialog open={tab != null} onOpenChange={onOpenChange}>
            <AlertDialogContent onBackdropMouseDown={() => onOpenChange(false)}>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove running Pi tab from Pimux?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This only removes “{tab?.title}” from Pimux. Files on disk are not deleted.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onConfirm}>
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function shouldConfirmTabDelete(tab: WorkspaceTab, status: PiStatusEvent | undefined): boolean {
    return (
        tab.kind === 'pi' &&
        (status?.status === 'thinking' ||
            status?.status === 'answering' ||
            status?.status === 'running-tool')
    );
}

function TabIcon({ tab, Icon }: { tab: WorkspaceTab; Icon: typeof GlobeIcon }) {
    if (tab.kind === 'browser' && tab.favicon) return <BrowserFavicon tab={tab} />;
    return <Icon data-icon="inline-start" />;
}

function BrowserFavicon({ tab }: { tab: BrowserTab }) {
    return <img src={tab.favicon} alt="" className="size-4 shrink-0 rounded-sm object-contain" />;
}
