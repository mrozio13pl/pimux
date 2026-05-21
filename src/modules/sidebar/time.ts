/**
 * Compact relative time: `now`, `5m`, `2h`, `3d`. `now` is the second
 * argument for testability.
 */
export function relativeTime(ts: number, now: number = Date.now()): string {
    const diff = now - ts;
    const min = Math.round(diff / 60_000);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h`;
    return `${Math.round(hr / 24)}d`;
}
