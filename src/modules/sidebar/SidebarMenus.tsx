import type { ReactElement } from 'react';
import {
    CodeIcon,
    CopyIcon,
    FolderIcon,
    FolderOpenIcon,
    PlusIcon,
    PushPinIcon,
    PushPinSlashIcon,
    TextTIcon,
    TrashIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { copyText } from '@/lib/utils';
import { ipc } from '@/ipc';
import { tabDefinitions } from '@/modules/tabs/registry';
import type { TabKind } from '@/modules/tabs/types';
import type { SidebarProps } from './types';

export function AddTabMenu({
    onAddTab,
    trigger,
    align = 'start',
}: {
    onAddTab(kind: TabKind): void;
    trigger?: ReactElement;
    align?: 'start' | 'center' | 'end';
}) {
    const content = (
        <DropdownMenuContent align={align} className="min-w-58">
            {tabDefinitions.map((definition) => (
                <DropdownMenuItem key={definition.kind} onClick={() => onAddTab(definition.kind)}>
                    <definition.Icon />
                    {definition.label}
                    {definition.shortcut ? (
                        <DropdownMenuShortcut>{definition.shortcut}</DropdownMenuShortcut>
                    ) : null}
                </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
    );

    if (trigger) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger render={trigger} />
                {content}
            </DropdownMenu>
        );
    }

    return (
        <Tooltip>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <TooltipTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <PlusIcon />
                                    <span className="sr-only">Add tab</span>
                                </Button>
                            }
                        />
                    }
                />
                {content}
            </DropdownMenu>
            <TooltipContent>Add tab</TooltipContent>
        </Tooltip>
    );
}

export function WorkspaceIcon({ src }: { src: string | null | undefined }) {
    if (src) {
        return (
            <img
                src={src}
                alt=""
                className="size-4 shrink-0 rounded-sm object-contain"
                draggable={false}
            />
        );
    }
    return <FolderIcon className="size-4 shrink-0" />;
}

export function WorkspaceContextMenuContent({
    workspace,
    onTogglePin,
    onSetIcon,
    onClearIcon,
    onDelete,
}: {
    workspace: SidebarProps['workspaces'][number];
    onTogglePin(): void;
    onSetIcon(): void;
    onClearIcon(): void;
    onDelete(): void;
}) {
    return (
        <ContextMenuContent className="min-w-56">
            <ContextMenuGroup>
                <ContextMenuItem onClick={onTogglePin}>
                    {workspace.pinned ? <PushPinSlashIcon /> : <PushPinIcon />}
                    {workspace.pinned ? 'Unpin project' : 'Pin project'}
                </ContextMenuItem>
                <ContextMenuItem onClick={onSetIcon}>
                    <FolderOpenIcon />
                    Set icon…
                </ContextMenuItem>
                {workspace.icon ? (
                    <ContextMenuItem onClick={onClearIcon}>
                        <TrashIcon />
                        Clear icon
                    </ContextMenuItem>
                ) : null}
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
                    Delete workspace
                </ContextMenuItem>
            </ContextMenuGroup>
        </ContextMenuContent>
    );
}

export function TabContextMenuContent({
    tab,
    workspace,
    onTogglePin,
    onDelete,
}: {
    tab: { title: string; pinned?: boolean };
    workspace: SidebarProps['workspaces'][number];
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
                    Delete tab
                </ContextMenuItem>
            </ContextMenuGroup>
        </ContextMenuContent>
    );
}
