import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';

// broken tauri window and lobehub icons import
// might need to address it in the future
const stubs = {
    '\0settings': 'export const useSettings = () => ({ cursorBlink: false, cursorStyle: "block" });',
    '\0sources': 'export const BUILTIN_SOURCES = { shell: { id: "shell" } };',
};
const vite = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
    plugins: [
        {
            name: 'terminal-test-stubs',
            enforce: 'pre',
            resolveId(id) {
                if (id.endsWith('/lib/settings')) return '\0settings';
                if (id.endsWith('/lib/sources')) return '\0sources';
            },
            load(id) {
                return stubs[id];
            },
        },
    ],
});
after(() => vite.close());
const { writeTerminalOutput } = await vite.ssrLoadModule('/components/terminal.tsx');

test('output preserves the visible scrollback while scrolled up', () => {
    const terminal = {
        viewportY: 20,
        scrollbackLength: 100,
        getViewportY() {
            return this.viewportY;
        },
        getScrollbackLength() {
            return this.scrollbackLength;
        },
        write() {
            this.scrollbackLength += 3;
            this.viewportY = 0;
        },
        scrollToLine(line) {
            this.viewportY = line;
        },
    };

    writeTerminalOutput(terminal, 'new output');

    assert.equal(terminal.viewportY, 23);
});

test('output follows the terminal when already at the bottom', () => {
    let restored = false;
    const terminal = {
        getViewportY: () => 0,
        getScrollbackLength: () => 100,
        write() {},
        scrollToLine() {
            restored = true;
        },
    };

    writeTerminalOutput(terminal, 'new output');

    assert.equal(restored, false);
});
