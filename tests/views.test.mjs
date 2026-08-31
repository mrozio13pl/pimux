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
