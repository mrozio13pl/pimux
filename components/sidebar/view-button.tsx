import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { PushPinIcon } from '@phosphor-icons/react';
import { useSortable } from '@dnd-kit/sortable';
import { ViewFooter } from './view-footer';
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
import { getSource } from '@/lib/sources';
import { useAppHotkey, useSettings } from '@/lib/settings';
import { useCustomSources } from '@/lib/sources/custom';
import { convertFileSrc } from '@tauri-apps/api/core';

interface ViewButtonProps extends React.ComponentProps<'button'> {
    view: View;
    active?: boolean;
    onDelete: (id: string) => void;
    onTogglePin: (id: string) => void;
    onTitleChange: (id: string, title: string, lockTitle: boolean) => void;
    reorderRevision: number;
}

export function ViewButton({
    type = 'button',
    view,
    active,
    onDelete,
    onTogglePin,
    onTitleChange,
    reorderRevision,
    style,
    ...props
}: ViewButtonProps) {
    const sortable = useSortable({ id: view.id });
    const transform = sortable.transform;
    const button = useRef<HTMLButtonElement>(null);
    const previousTop = useRef<number>(undefined);
    const previousRevision = useRef(reorderRevision);

    const custom = useCustomSources();
    const { showSourceIcons } = useSettings((state) => state.values);

    const Icon = useCallback(() => {
        if (!showSourceIcons) return null;

        const source = getSource(view.sourceId) ?? custom.sources.find((source) => view.sourceId === source.id);

        if (!source?.icon) return null;

        if (typeof source?.icon === 'string') {
            return <img className="-mt-1 size-5" src={convertFileSrc(source.icon)} alt={source.title} />;
        }

        return <span className="[&_svg]:-mt-1 [&_svg]:size-5">{source.icon}</span>;
    }, [custom.sources, showSourceIcons, view.sourceId]);

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
                <ContextMenuTrigger
                    render={
                        <button
                            ref={(node) => {
                                button.current = node;
                                sortable.setNodeRef(node);
                            }}
                            type={type}
                            className={clsx(
                                'relative w-full cursor-grab space-y-1 rounded-md px-3 py-3 text-left transition-[background-color,opacity,box-shadow] duration-200 hover:bg-muted active:cursor-grabbing',
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
                >
                    <div className="flex items-center gap-1.5">
                        <ViewStatus variant={view.status} className="ml-px" />
                        <h2 className="font-bold">{view.title}</h2>
                        {view.pinned && <PushPinIcon className="size-3.5" aria-label="Pinned" weight="fill" />}
                    </div>
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
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuGroup>
                        <ContextMenuItem onClick={() => onTogglePin(view.id)}>
                            {view.pinned ? 'Unpin view' : 'Pin view'}
                        </ContextMenuItem>
                        <ContextMenuItem onClick={openTitleDialog}>Change title</ContextMenuItem>
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
