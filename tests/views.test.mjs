import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('inactive views are archived without touching fresh or legacy views', async () => {
    const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
    try {
        const { archiveInactive } = await vite.ssrLoadModule('/lib/views/archive.ts');
        const stale = { id: 'stale', lastActiveAt: 100, pinned: true };
        const fresh = { id: 'fresh', lastActiveAt: 101 };
        const legacy = { id: 'legacy' };
        const alreadyArchived = { id: 'archived', archived: true, lastActiveAt: 1 };

        const archived = archiveInactive([stale, fresh, legacy, alreadyArchived], 100);

        assert.deepEqual(archived[0], { ...stale, archived: true, pinned: false });
        assert.strictEqual(archived[1], fresh);
        assert.strictEqual(archived[2], legacy);
        assert.strictEqual(archived[3], alreadyArchived);
        assert.strictEqual(archiveInactive(archived, 100), archived);
    } finally {
        await vite.close();
    }
});
