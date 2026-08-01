import assert from 'node:assert/strict';
import test from 'node:test';
import { isPiPasteShortcut } from '../lib/sources/pi/paste.ts';

const key = (overrides = {}) => ({
    altKey: false,
    ctrlKey: false,
    key: 'v',
    metaKey: false,
    shiftKey: false,
    ...overrides,
});

test('uses Pi native paste shortcut without taking terminal text paste', () => {
    assert.equal(isPiPasteShortcut(key({ ctrlKey: true }), 'Linux'), true);
    assert.equal(isPiPasteShortcut(key({ ctrlKey: true, shiftKey: true }), 'Linux'), false);
    assert.equal(isPiPasteShortcut(key({ ctrlKey: true }), 'Macintosh'), true);
    assert.equal(isPiPasteShortcut(key({ metaKey: true }), 'Macintosh'), false);
    assert.equal(isPiPasteShortcut(key({ altKey: true }), 'Windows'), true);
    assert.equal(isPiPasteShortcut(key({ ctrlKey: true }), 'Windows'), false);
});
