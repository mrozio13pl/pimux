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
