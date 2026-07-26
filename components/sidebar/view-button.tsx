import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { PushPinIcon } from '@phosphor-icons/react';
import { useSortable } from '@dnd-kit/sortable';
import { ViewFooter, WorkspaceIcon } from './view-footer';
import type { View } from '@/lib/views';
import { ViewStatus } from './view-status';
import { clsx } from 'clsx';
import snarkdown from 'snarkdown';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { BUILTIN_SOURCES, getSource } from '@/lib/sources';
import { useAppHotkey, useSettings } from '@/lib/settings';
import { useCustomSources } from '@/lib/sources/custom';
import { convertFileSrc } from '@tauri-apps/api/core';
import { compactAge } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ViewButtonProps extends React.ComponentProps<'button'> {
    view: View;
    active?: boolean;
    onDelete: (id: string) => void;
    onTogglePin: (id: string) => void;
    onToggleArchive: (id: string) => void;
    onTitleChange: (id: string, title: string, lockTitle: boolean) => void;
    reorderRevision: number;
}

export function ViewButton({
    type = 'button',
    view,
    active,
    onDelete,
    onTogglePin,
    onToggleArchive,
    onTitleChange,
    reorderRevision,
    style,
    ...props
}: ViewButtonProps) {
    const sortable = useSortable({ id: view.id, disabled: view.archived });
    const transform = sortable.transform;
    const button = useRef<HTMLButtonElement>(null);
    const previousTop = useRef<number>(undefined);
    const previousRevision = useRef(reorderRevision);

    const custom = useCustomSources();
    const { showSourceIcons } = useSettings((state) => state.values);
    const source = getSource(view.sourceId) ?? custom.sources.find((source) => view.sourceId === source.id);
    const status = view.status || 'idle';
    const shell = view.sourceId === BUILTIN_SOURCES.shell.id;

    const Icon = useCallback(
        ({ compact = false }: { compact?: boolean }) => {
            if (!showSourceIcons) return null;

            if (!source?.icon) return null;

            if (typeof source?.icon === 'string') {
                return (
                    <img
                        className={clsx('-mt-1', compact ? 'size-4' : 'size-5')}
                        src={convertFileSrc(source.icon)}
                        alt={source.title}
                    />
                );
            }

            return (
                <span className={clsx('[&_svg]:-mt-1', compact ? '[&_svg]:size-4' : '[&_svg]:size-5')}>
                    {source.icon}
                </span>
            );
        },
        [showSourceIcons, source],
    );

    useLayoutEffect(() => {
        const top = button.current?.getBoundingClientRect().top;
        if (
            top !== undefined &&
            previousTop.current !== undefined &&
            previousRevision.current !== reorderRevision &&
            !sortable.isSorting &&
            !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            const offset = previousTop.current - top;
            if (offset) {
                button.current?.animate([{ transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' }], {
                    duration: 200,
                    easing: 'ease',
                });
            }
        }
        previousTop.current = top;
        previousRevision.current = reorderRevision;
    });

    const [titleDialogOpen, setTitleDialogOpen] = useState(false);
    const [title, setTitle] = useState(view.title);
    const [lockTitle, setLockTitle] = useState(view.lockTitle !== false);

    const openTitleDialog = useCallback(() => {
        setTitle(view.title);
        setLockTitle(view.lockTitle !== false);
        setTitleDialogOpen(true);
    }, [view.title, view.lockTitle]);

    useAppHotkey('view.delete', 'Mod+D', () => {
        if (active) onDelete(view.id);
    });
    useAppHotkey('view.change-title', 'F2', () => {
        if (active) openTitleDialog();
    });

    return (
        <>
            <ContextMenu>
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <ContextMenuTrigger
                                render={
                                    <button
                                        ref={(node) => {
                                            button.current = node;
                                            sortable.setNodeRef(node);
                                        }}
                                        type={type}
                                        className={clsx(
                                            'relative w-full rounded-md px-3 text-left transition-[background-color,opacity,box-shadow] duration-200 hover:bg-muted',
                                            view.archived
                                                ? 'cursor-pointer space-y-1 py-2'
                                                : 'cursor-grab space-y-1 py-3 active:cursor-grabbing',
                                            active && 'bg-muted',
                                            sortable.isOver &&
                                                !sortable.isDragging &&
                                                'after:absolute after:-bottom-[5px] after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-primary after:content-[""]',
                                            sortable.isDragging && 'z-10 opacity-80 shadow-lg',
                                        )}
                                        style={{
                                            ...style,
                                            outline: sortable.isDragging ? 'none' : undefined,
                                            transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
                                            transition: sortable.transition || style?.transition,
                                        }}
                                        {...props}
                                        {...sortable.attributes}
                                        {...sortable.listeners}
                                    />
                                }
                            />
                        }
                    >
                        <div className="flex min-w-0 items-center gap-1.5">
                            {view.archived ? (
                                <WorkspaceIcon cwd={view.cwd} />
                            ) : (
                                <ViewStatus variant={view.status} className="ml-px" />
                            )}
                            <h2 className="truncate font-bold">{view.title}</h2>
                            {view.pinned && <PushPinIcon className="size-3.5" aria-label="Pinned" weight="fill" />}
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                {compactAge(view.lastActiveAt)}
                            </span>
                        </div>
                        {view.archived ? (
                            <div className="flex items-center justify-between gap-1.5">
                                <ViewFooter cwd={view.cwd} showIcon={false} />
                                <Icon compact />
                            </div>
                        ) : (
                            <>
                                <p
                                    className={clsx(
                                        'text-muted-foreground text-xs line-clamp-2',
                                        view.status === 'working' && 'shimmer',
                                    )}
                                    dangerouslySetInnerHTML={{ __html: snarkdown(view.description || '') }}
                                />
                                <div className="flex items-center justify-between gap-1.5">
                                    <ViewFooter cwd={view.cwd} />
                                    <Icon />
                                </div>
                            </>
                        )}
                    </TooltipTrigger>
                    <TooltipContent
                        side="right"
                        align="start"
                        sideOffset={4}
                        className="flex min-w-48 flex-col items-stretch gap-1 rounded-lg bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 [&_[data-slot=tooltip-arrow]]:hidden"
                    >
                        <div className="flex items-center gap-2 font-medium capitalize">
                            <ViewStatus variant={status} showIdle />
                            {status}
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground">{shell ? 'Previous command' : 'Model'}</span>
                            <span className="font-mono">
                                {shell ? view.description || 'No command yet' : view.model || 'Not reported'}
                            </span>
                        </div>
                        {status === 'error' && !!view.description && (
                            <p className="border-t pt-3 font-mono text-xs wrap-break-word text-destructive">
                                {view.description}
                            </p>
                        )}
                    </TooltipContent>
                </Tooltip>
                <ContextMenuContent>
                    <ContextMenuGroup>
                        {!view.archived && (
                            <ContextMenuItem onClick={() => onTogglePin(view.id)}>
                                {view.pinned ? 'Unpin view' : 'Pin view'}
                            </ContextMenuItem>
                        )}
                        <ContextMenuItem onClick={openTitleDialog}>Change title</ContextMenuItem>
                        <ContextMenuItem onClick={() => onToggleArchive(view.id)}>
                            {view.archived ? 'Unarchive view' : 'Archive view'}
                        </ContextMenuItem>
                    </ContextMenuGroup>
                    <ContextMenuSeparator />
                    <ContextMenuGroup>
                        <ContextMenuItem variant="destructive" onClick={() => onDelete(view.id)}>
                            Delete view
                        </ContextMenuItem>
                    </ContextMenuGroup>
                </ContextMenuContent>
            </ContextMenu>
            <Dialog open={titleDialogOpen} onOpenChange={setTitleDialogOpen}>
                <DialogContent className="gap-3">
                    <form
                        className="flex flex-col gap-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            onTitleChange(view.id, title.trim(), lockTitle);
                            setTitleDialogOpen(false);
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>Change title</DialogTitle>
                        </DialogHeader>
                        <FieldGroup className="gap-3">
                            <Field>
                                <Input
                                    aria-label="Title"
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    maxLength={48}
                                    required
                                />
                            </Field>
                            <Field orientation="horizontal">
                                <Switch
                                    id={`lock-view-title-${view.id}`}
                                    checked={lockTitle}
                                    onCheckedChange={setLockTitle}
                                />
                                <FieldLabel htmlFor={`lock-view-title-${view.id}`}>Lock the title</FieldLabel>
                            </Field>
                        </FieldGroup>
                        <Button className="self-end" type="submit" disabled={!title.trim()}>
                            Save
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
