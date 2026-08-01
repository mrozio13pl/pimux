export function previousView(history: string[], activeIds: Set<string>, closingId: string) {
    const id = history.findLast((candidate) => candidate !== closingId && activeIds.has(candidate));
    return { id, history: history.filter((candidate) => candidate !== closingId && candidate !== id) };
}
