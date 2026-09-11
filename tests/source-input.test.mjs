import assert from 'node:assert/strict';
import test from 'node:test';
import { bindTerminalInput, pageKeySequence, resolveSourceInput } from '../lib/sources/input.ts';

const key = (overrides = {}) => ({
    altKey: false,
    ctrlKey: false,
    key: 'PageUp',
    metaKey: false,
    shiftKey: false,
    ...overrides,
});

test('gives every source native paste unless it opts out', () => {
    assert.equal(resolveSourceInput().nativePaste, true);
    assert.equal(resolveSourceInput({}).nativePaste, true);
    assert.equal(resolveSourceInput({ nativePaste: false }).nativePaste, false);
});

test('encodes the page keys', () => {
    assert.equal(pageKeySequence(key({ key: 'PageUp' })), '\x1b[5~');
    assert.equal(pageKeySequence(key({ key: 'PageDown' })), '\x1b[6~');
});

test('leaves modified page keys and other keys to the terminal', () => {
    assert.equal(pageKeySequence(key({ shiftKey: true })), undefined);
    assert.equal(pageKeySequence(key({ ctrlKey: true })), undefined);
    assert.equal(pageKeySequence(key({ altKey: true })), undefined);
    assert.equal(pageKeySequence(key({ metaKey: true })), undefined);
    assert.equal(pageKeySequence(key({ key: 'ArrowUp' })), undefined);
    assert.equal(pageKeySequence(key({ key: 'v', ctrlKey: true })), undefined);
});

const fakeTerminal = () => {
    const calls = { input: [] };
    let handler;
    const terminal = {
        element: {
            addEventListener: (_type, fn) => {
                handler = fn;
            },
            removeEventListener: () => {
                handler = undefined;
            },
        },
        input: (data) => calls.input.push(data),
    };
    return {
        terminal,
        calls,
        send: (event) => handler({ preventDefault() {}, stopImmediatePropagation() {}, ...event }),
    };
};

test('sends page keys to the process, whichever physical key produced them', () => {
    const { terminal, calls, send } = fakeTerminal();
    bindTerminalInput(terminal);
    send(key({ key: 'PageUp' }));
    send(key({ key: 'PageDown' }));
    send(key({ key: 'PageUp', shiftKey: true }));
    assert.deepEqual(calls.input, ['\x1b[5~', '\x1b[6~']);
});

test('sends the native paste control code only when the source opts in', () => {
    const opted = fakeTerminal();
    bindTerminalInput(opted.terminal);
    opted.send(key({ key: 'v', ctrlKey: true }));
    assert.deepEqual(opted.calls.input, ['\x16']);

    const optedOut = fakeTerminal();
    bindTerminalInput(optedOut.terminal, { nativePaste: false });
    optedOut.send(key({ key: 'v', ctrlKey: true }));
    assert.deepEqual(optedOut.calls.input, []);
});
