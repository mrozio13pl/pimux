export interface Session {
    title: string;
    cwd: string;
    source: 'Pi' | 'Claude Code';
    age: string;
    snippet: string;
}

export const SESSIONS: Session[] = [
    {
        title: 'Make the daemon outlive the window',
        cwd: '~/projects/pimux',
        source: 'Pi',
        age: '11h',
        snippet: 'the daemon owns every pty, so closing the app only drops the client socket, not the process',
    },
    {
        title: 'Checkout totals drift on refresh',
        cwd: '~/projects/storefront',
        source: 'Claude Code',
        age: '12h',
        snippet: 'totals recompute from the cart, not the stale form state, so the refresh no longer changes them',
    },
    {
        title: 'Reattach without replaying the whole transcript',
        cwd: '~/projects/pimux',
        source: 'Pi',
        age: '13h',
        snippet: 'RING_LINES caps at 200 and RING_BYTES at 256 KiB, which is enough to redraw the pane on reattach',
    },
    {
        title: 'Success overlay never animates out',
        cwd: '~/projects/storefront',
        source: 'Claude Code',
        age: '14h',
        snippet: "the reflow is genuinely dead, and I'll have an exact before/after pair plus a logs tail",
    },
    {
        title: 'Sort listings by view count',
        cwd: '~/projects/storefront',
        source: 'Pi',
        age: '16h',
        snippet: 'Added a "Most viewed" sort option, backed by a new by_status_and_viewCount index',
    },
    {
        title: 'Archive views nobody has touched',
        cwd: '~/projects/pimux',
        source: 'Claude Code',
        age: '19h',
        snippet: 'archiveInactive leaves anything newer than the cutoff alone, and clears pinned as it archives',
    },
    {
        title: 'Backfill legacy user codes',
        cwd: '~/projects/billing-api',
        source: 'Pi',
        age: '1d',
        snippet: 'real filter on real 14 rows returns 14, not 0',
    },
    {
        title: 'Admin can edit orders without notifying',
        cwd: '~/projects/storefront',
        source: 'Claude Code',
        age: '2d',
        snippet: 'removed every production dump and the scripts holding your key; the scratchpad is empty',
    },
    {
        title: 'Namespace the custom source ids',
        cwd: '~/projects/pimux',
        source: 'Pi',
        age: '3d',
        snippet:
            'validate_id rejects anything colliding with builtin:, and the command still has to resolve to an executable',
    },
    {
        title: 'Wire up SMS credentials',
        cwd: '~/projects/billing-api',
        source: 'Claude Code',
        age: '4d',
        snippet: 'live bundle sends scheduleStartsAt, backend has notify on bulkConfigure',
    },
    {
        title: 'One index for both harnesses',
        cwd: '~/projects/pimux',
        source: 'Pi',
        age: '6d',
        snippet:
            'collect_jsonl walks ~/.pi/agent/sessions and ~/.claude/projects, so both land in the same tantivy index',
    },
    {
        title: 'Hotkeys should all be rebindable',
        cwd: '~/projects/pimux',
        source: 'Claude Code',
        age: '8d',
        snippet: 'every binding registers through useAppHotkey, so the overrides map can replace any default',
    },
];

export const INITIAL_QUERY = 'reflow';

export function matches(session: Session, query: string) {
    const q = query.trim().toLowerCase();

    if (!q) return true;

    return [session.title, session.snippet, session.cwd, session.source].some((field) =>
        field.toLowerCase().includes(q),
    );
}

export function segments(text: string, query: string): { text: string; hit: boolean }[] {
    const q = query.trim().toLowerCase();
    if (!q) return [{ text, hit: false }];

    const parts: { text: string; hit: boolean }[] = [];
    const lower = text.toLowerCase();
    let at = 0;

    for (;;) {
        const found = lower.indexOf(q, at);
        if (found === -1) break;
        if (found > at) parts.push({ text: text.slice(at, found), hit: false });
        parts.push({ text: text.slice(found, found + q.length), hit: true });
        at = found + q.length;
    }

    if (at < text.length) parts.push({ text: text.slice(at), hit: false });
    return parts;
}
