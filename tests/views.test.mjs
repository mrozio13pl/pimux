import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('inactive views are archived and legacy views start aging', async () => {
    const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
    try {
        const { archiveInactive } = await vite.ssrLoadModule('/lib/views/archive.ts');
        const stale = { id: 'stale', lastActiveAt: 100, pinned: true };
        const fresh = { id: 'fresh', lastActiveAt: 101 };
        const legacy = { id: 'legacy' };
        const alreadyArchived = { id: 'archived', archived: true, lastActiveAt: 1 };

        const archived = archiveInactive([stale, fresh, legacy, alreadyArchived], 100, 200);

        assert.deepEqual(archived[0], { ...stale, archived: true, pinned: false });
        assert.strictEqual(archived[1], fresh);
        assert.deepEqual(archived[2], { ...legacy, lastActiveAt: 200 });
        assert.strictEqual(archived[3], alreadyArchived);
        assert.strictEqual(archiveInactive(archived, 100), archived);

        const kept = archiveInactive([stale, fresh], 100, 200, 'stale');
        assert.strictEqual(kept[0], stale);
        assert.strictEqual(kept[1], fresh);
    } finally {
        await vite.close();
    }
});

test('idle agent views hibernate, busy and shell views do not', async () => {
    const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
    try {
        const { hibernateIdle } = await vite.ssrLoadModule('/lib/views/archive.ts');
        const idle = { id: 'idle', sourceId: 'builtin:pi', lastActiveAt: 100 };
        const busy = { id: 'busy', sourceId: 'builtin:pi', status: 'working', lastActiveAt: 100 };
        const asking = { id: 'asking', sourceId: 'builtin:claudecode', status: 'attention', lastActiveAt: 100 };
        const shell = { id: 'shell', sourceId: 'builtin:shell', lastActiveAt: 100 };
        const custom = { id: 'custom', sourceId: 'custom:abc', lastActiveAt: 100 };
        const recent = { id: 'recent', sourceId: 'builtin:pi', lastActiveAt: 300 };
        const views = [idle, busy, asking, shell, custom, recent];

        const next = hibernateIdle(views, 200);

        assert.deepEqual(next[0], { ...idle, hibernated: true });
        assert.strictEqual(next[1], busy);
        assert.strictEqual(next[2], asking);
        assert.strictEqual(next[3], shell);
        assert.strictEqual(next[4], custom);
        assert.strictEqual(next[5], recent);
        assert.strictEqual(hibernateIdle(next, 200), next);
        assert.strictEqual(hibernateIdle(views, 200, 'idle'), views);
    } finally {
        await vite.close();
    }
});

test('closing a view restores the latest active view', async () => {
    const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
    try {
        const { previousView, startedTerminalIds } = await vite.ssrLoadModule('/lib/views/history.ts');
        assert.deepEqual(previousView(['one', 'two'], new Set(['one', 'two', 'three']), 'three'), {
            id: 'two',
            history: ['one'],
        });
        assert.deepEqual(
            startedTerminalIds([{ id: 'current' }, { id: 'unopened' }, { id: 'archived', archived: true }], 'current', [
                'archived',
            ]),
            ['current'],
        );
    } finally {
        await vite.close();
    }
});
