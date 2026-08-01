type ArchivableView = {
    archived?: boolean;
    lastActiveAt?: number;
    pinned?: boolean;
};

export function archiveInactive<View extends ArchivableView>(views: View[], cutoff: number) {
    let changed = false;
    const next = views.map((view) => {
        if (view.archived || view.lastActiveAt === undefined || view.lastActiveAt > cutoff) return view;
        changed = true;
        return { ...view, archived: true, pinned: false };
    });
    return changed ? next : views;
}
