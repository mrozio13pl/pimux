type ArchivableView = {
    archived?: boolean;
    lastActiveAt?: number;
    pinned?: boolean;
};

export function archiveInactive<View extends ArchivableView>(views: View[], cutoff: number, now = Date.now()) {
    let changed = false;
    const next = views.map((view) => {
        if (view.archived || (view.lastActiveAt !== undefined && view.lastActiveAt > cutoff)) return view;

        changed = true;

        if (view.lastActiveAt === undefined) return { ...view, lastActiveAt: now };

        return { ...view, archived: true, pinned: false };
    });
    return changed ? next : views;
}
