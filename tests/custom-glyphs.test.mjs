import assert from 'node:assert/strict';
import test from 'node:test';
import { tryDrawCustomChar } from '../node_modules/ghostty-web/dist/custom-glyphs.js';

test('custom block glyph fills the terminal cell', () => {
    const rectangles = [];
    const context = { fillRect: (...rectangle) => rectangles.push(rectangle) };

    assert.equal(tryDrawCustomChar(context, '█', 0, 0, 9, 20, 14, 1), true);
    assert.deepEqual(rectangles, [[0, 0, 9, 20]]);
    assert.equal(tryDrawCustomChar(context, 'A', 0, 0, 9, 20, 14, 1), false);
});
