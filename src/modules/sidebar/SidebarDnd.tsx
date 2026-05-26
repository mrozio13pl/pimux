import { CSSProperties, createContext, useContext, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVerticalIcon, FolderIcon } from '@phosphor-icons/react';
import { AccordionItem } from '@/components/ui/accordion';
import { getTabDefinition } from '@/modules/tabs/registry';
import type { TabKind } from '@/modules/tabs/types';
import { cn } from '@/lib/utils';

const WorkspaceDragHandleContext = createContext<{
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners: ReturnType<typeof useSortable>['listeners'];
} | null>(null);

export function SortableWorkspaceItem({
    id,
    value,
    children,
    onMouseEnter,
    onMouseLeave,
}: {
    id: string;
    value: string;
    children: ReactNode;
    onMouseEnter(): void;
    onMouseLeave(): void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
        useSortable({ id: `workspace:${id}` });
    const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };

    return (
        <WorkspaceDragHandleContext.Provider value={{ attributes, listeners }}>
            <AccordionItem
                ref={setNodeRef}
                value={value}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                style={style}
                className={cn(
                    'relative w-full border-0 bg-transparent not-last:border-b-0 data-open:bg-transparent',
                    isDragging && 'opacity-40',
                    isOver && !isDragging && 'rounded-md ring-1 ring-primary/70',
                )}
            >
                {children}
            </AccordionItem>
        </WorkspaceDragHandleContext.Provider>
    );
}

export function WorkspaceDragHandle() {
    const handle = useContext(WorkspaceDragHandleContext);
    return (
        <button
            type="button"
            aria-label="Drag workspace"
            className="grid size-6 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground active:cursor-grabbing"
            onClick={(event) => event.stopPropagation()}
            {...handle?.attributes}
            {...handle?.listeners}
        >
            <DotsSixVerticalIcon className="size-4" />
        </button>
    );
}

export function WorkspaceTabDropZone({
    workspaceId,
    children,
}: {
    workspaceId: string;
    children: ReactNode;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: `workspace-tabs:${workspaceId}` });
    return (
        <div
            ref={setNodeRef}
            className={cn(
                'rounded-md transition-colors',
                isOver && 'bg-primary/10 ring-1 ring-primary/60',
            )}
        >
            {children}
        </div>
    );
}

export function SidebarDragPreview({
    title,
    kind,
    tabKind,
}: {
    title: string;
    kind: 'workspace' | 'tab';
    tabKind?: TabKind;
}) {
    const Icon = kind === 'tab' && tabKind ? getTabDefinition(tabKind).Icon : FolderIcon;
    return (
        <div className="flex h-8 max-w-64 items-center gap-2 rounded-md border border-primary/60 bg-popover px-3 text-[12.5px] font-semibold text-popover-foreground shadow-xl">
            <Icon className="size-4" />
            <span className="truncate">{title}</span>
        </div>
    );
}
