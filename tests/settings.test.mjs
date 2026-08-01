import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('setting defaults match their definitions', async () => {
    const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
    try {
        const { defaultSettings, settingDefinitions } = await vite.ssrLoadModule('/lib/settings/definitions.ts');
        for (const [id, definition] of Object.entries(settingDefinitions)) {
            assert.equal(defaultSettings[id], definition.default, `${id} default mismatch`);
            if ('options' in definition && Array.isArray(definition.options)) {
                assert(
                    definition.options.some((option) => option.value === definition.default),
                    `${id} default is not an option`,
                );
            }
        }
    } finally {
        await vite.close();
    }
});
