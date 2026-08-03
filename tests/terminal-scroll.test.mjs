import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Terminal as GhosttyTerminal } from 'ghostty-web';

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

test('paused terminals cancel rendering and redraw when resumed', () => {
    const originalRequest = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;
    let renders = 0;
    let cancelled;

    try {
        globalThis.requestAnimationFrame = () => 7;
        globalThis.cancelAnimationFrame = (id) => {
            cancelled = id;
        };
        const terminal = new GhosttyTerminal({ ghostty: {} });
        terminal.isOpen = true;
        terminal.renderer = { render: () => renders++ };
        terminal.wasmTerm = { getCursor: () => ({ y: 0 }) };

        terminal.setRenderPaused(true);
        terminal.setRenderPaused(false);
        terminal.setRenderPaused(true);

        assert.equal(renders, 1);
        assert.equal(cancelled, 7);
        assert.equal(terminal.animationFrameId, undefined);
    } finally {
        globalThis.requestAnimationFrame = originalRequest;
        globalThis.cancelAnimationFrame = originalCancel;
    }
});
