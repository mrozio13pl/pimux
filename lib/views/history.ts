export function startedTerminalIds(
    views: { id: string; archived?: boolean }[],
    currentViewId: string | undefined,
    startedIds: string[],
) {
    const liveIds = new Set(views.filter((view) => !view.archived).map((view) => view.id));
    const ids = startedIds.filter((id) => liveIds.has(id));
    if (currentViewId && liveIds.has(currentViewId) && !ids.includes(currentViewId)) ids.push(currentViewId);
    return ids;
}

export function previousView(history: string[], activeIds: Set<string>, closingId: string) {
    const id = history.findLast((candidate) => candidate !== closingId && activeIds.has(candidate));
    return { id, history: history.filter((candidate) => candidate !== closingId && candidate !== id) };
}
