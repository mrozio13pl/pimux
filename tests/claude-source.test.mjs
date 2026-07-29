import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('Claude process exit preserves an error status', async () => {
    const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
    try {
        const { claudeProcessUpdate } = await vite.ssrLoadModule('/lib/sources/claude/protocol.ts');
        assert.equal(claudeProcessUpdate({ type: 'exited' }, 'error'), undefined);
        assert.deepEqual(claudeProcessUpdate({ type: 'exited' }, 'working'), { status: 'finished' });
    } finally {
        await vite.close();
    }
});
