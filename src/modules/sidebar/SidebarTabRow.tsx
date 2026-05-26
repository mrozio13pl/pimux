import { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    GitDiffIcon,
    GlobeIcon,
    NotePencilIcon,
    PiIcon,
    PushPinIcon,
    TerminalWindowIcon,
} from '@phosphor-icons/react';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import type { BrowserTab, WorkspaceTab } from '@/modules/tabs/types';
import type { SidebarProps } from './types';
import { TabContextMenuContent } from './SidebarMenus';
import { StatusLabel, statusPresentation } from './SidebarStatus';

export function TabRow({
    tab,
    active,
    status,
    workspace,
    onSelectTab,
    onTogglePin,
    onDelete,
}: {
    tab: WorkspaceTab;
    active: boolean;
    status: SidebarProps['piStatuses'][string] | undefined;
    workspace: SidebarProps['workspaces'][number];
    onSelectTab(tabId: string): void;
    onTogglePin(): void;
    onDelete(): void;
}) {
    const Icon =
        tab.kind === 'pi'
            ? PiIcon
            : tab.kind === 'terminal'
              ? TerminalWindowIcon
              : tab.kind === 'browser'
                ? GlobeIcon
                : tab.kind === 'diffs'
                  ? GitDiffIcon
                  : NotePencilIcon;

    const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
        useSortable({ id: `tab:${tab.id}` });
    const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };

    return (
        <li ref={setNodeRef} style={style}>
            <ContextMenu>
                <ContextMenuTrigger
                    render={
                        <button
                            type="button"
                            aria-current={active}
                            onClick={() => onSelectTab(tab.id)}
                            {...attributes}
                            {...listeners}
                            className={cn(
                                'relative flex h-7 w-full cursor-grab items-center gap-2 rounded-md pr-3 pl-7 text-left transition-colors active:cursor-grabbing',
                                active
                                    ? 'bg-accent/50 font-semibold text-foreground'
                                    : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                                isDragging && 'opacity-40 ring-1 ring-primary/70',
                                isOver &&
                                    !isDragging &&
                                    'before:absolute before:top-1 before:bottom-1 before:left-5 before:w-0.5 before:rounded-full before:bg-primary',
                            )}
                        />
                    }
                >
                    <TabIcon tab={tab} Icon={Icon} status={status?.status} />
                    <span
                        className={cn('min-w-0 flex-1 truncate text-[12px]', active && 'font-bold')}
                    >
                        {tab.title}
                    </span>
                    {tab.pinned ? <PushPinIcon className="size-3 shrink-0" /> : null}
                    {tab.kind === 'pi' ? <StatusLabel status={status?.status} /> : null}
                </ContextMenuTrigger>
                <TabContextMenuContent
                    tab={tab}
                    workspace={workspace}
                    onTogglePin={onTogglePin}
                    onDelete={onDelete}
                />
            </ContextMenu>
        </li>
    );
}

function TabIcon({
    tab,
    Icon,
    status,
}: {
    tab: WorkspaceTab;
    Icon: typeof GlobeIcon;
    status?: string;
}) {
    if (tab.kind === 'browser' && tab.favicon) return <BrowserFavicon tab={tab} />;
    return (
        <Icon
            className={cn(
                'size-3.5 shrink-0',
                tab.kind === 'pi' && statusPresentation(status)?.className,
            )}
        />
    );
}

function BrowserFavicon({ tab }: { tab: BrowserTab }) {
    return <img src={tab.favicon} alt="" className="size-3.5 shrink-0 rounded-sm object-contain" />;
}
