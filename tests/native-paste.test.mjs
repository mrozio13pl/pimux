import assert from 'node:assert/strict';
import test from 'node:test';
import { isNativePasteShortcut } from '../lib/sources/native-paste.ts';

const key = (overrides = {}) => ({
    altKey: false,
    ctrlKey: false,
    key: 'v',
    metaKey: false,
    shiftKey: false,
    ...overrides,
});

test('uses the agent native paste shortcut without taking terminal text paste', () => {
    assert.equal(isNativePasteShortcut(key({ ctrlKey: true }), 'Linux'), true);
    assert.equal(isNativePasteShortcut(key({ ctrlKey: true, shiftKey: true }), 'Linux'), false);
    assert.equal(isNativePasteShortcut(key({ ctrlKey: true }), 'Macintosh'), true);
    assert.equal(isNativePasteShortcut(key({ metaKey: true }), 'Macintosh'), false);
    assert.equal(isNativePasteShortcut(key({ altKey: true }), 'Windows'), true);
    assert.equal(isNativePasteShortcut(key({ ctrlKey: true }), 'Windows'), false);
});
