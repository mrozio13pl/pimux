import { cn } from '@/lib/utils';
import type { WorkspaceTab } from '@/modules/tabs/types';
import type { SidebarProps } from './types';

export function firstVisibleStatus(
    tabs: WorkspaceTab[],
    piStatuses: SidebarProps['piStatuses'],
): SidebarProps['piStatuses'][string] | undefined {
    return tabs
        .filter((tab) => tab.kind === 'pi')
        .map((tab) => piStatuses[tab.id])
        .filter((status) => statusPresentation(status?.status))
        .toSorted((a, b) => b.timestamp - a.timestamp)[0];
}

export function shouldConfirmTabDelete(
    tab: WorkspaceTab,
    status: SidebarProps['piStatuses'][string] | undefined,
): boolean {
    return (
        tab.kind === 'pi' &&
        (status?.status === 'thinking' ||
            status?.status === 'answering' ||
            status?.status === 'running-tool')
    );
}

export function StatusLabel({ status }: { status: string | undefined }) {
    const presentation = statusPresentation(status);
    if (!presentation) return null;

    return (
        <span
            className={cn(
                'flex shrink-0 items-center gap-1 text-[11px] leading-none',
                presentation.className,
            )}
        >
            <span className="size-1.5 rounded-full bg-current" />
            {presentation.label}
        </span>
    );
}

function statusPresentation(
    status: string | undefined,
): { label: string; className: string } | null {
    switch (status) {
        case 'thinking':
        case 'answering':
        case 'running-tool':
            return { label: 'Working', className: 'text-sky-400' };
        case 'done':
            return { label: 'Completed', className: 'text-emerald-400' };
        case 'error':
            return { label: 'Error', className: 'text-destructive' };
        case 'exited':
            return { label: 'Exited', className: 'text-muted-foreground' };
        default:
            return null;
    }
}
