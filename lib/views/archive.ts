type ArchivableView = {
    id: string;
    archived?: boolean;
    lastActiveAt?: number;
    pinned?: boolean;
};

export function archiveInactive<View extends ArchivableView>(
    views: View[],
    cutoff: number,
    now = Date.now(),
    keepId?: string,
) {
    let changed = false;
    const next = views.map((view) => {
        if (view.archived) return view;

        if (view.lastActiveAt === undefined) {
            changed = true;
            return { ...view, lastActiveAt: now };
        }

        if (view.id === keepId || view.lastActiveAt > cutoff) return view;

        changed = true;
        return { ...view, archived: true, pinned: false };
    });
    return changed ? next : views;
}

type HibernatableView = {
    id: string;
    sourceId: string;
    status?: string;
    archived?: boolean;
    hibernated?: boolean;
    lastActiveAt?: number;
};

function reportsActivity(sourceId: string) {
    return sourceId !== 'builtin:shell' && !sourceId.startsWith('custom:');
}

export function hibernateIdle<View extends HibernatableView>(views: View[], cutoff: number, keepId?: string) {
    let changed = false;
    const next = views.map((view) => {
        if (view.hibernated || view.archived || view.id === keepId) return view;
        if (!reportsActivity(view.sourceId)) return view;
        if (view.status === 'working' || view.status === 'attention') return view;
        if ((view.lastActiveAt ?? 0) > cutoff) return view;

        changed = true;
        return { ...view, hibernated: true };
    });
    return changed ? next : views;
}
