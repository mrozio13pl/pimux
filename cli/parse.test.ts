import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCliArgs } from './parse';

function withTempDir<T>(fn: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), 'pimux-cli-'));
    try {
        return fn(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe('parseCliArgs', () => {
    it('focuses app with no args', () => {
        withTempDir((dir) => {
            expect(parseCliArgs([], dir)).toEqual({ action: { type: 'focusApp' }, json: false });
        });
    });

    it('parses default cwd open', () => {
        withTempDir((dir) => {
            expect(parseCliArgs(['.'], dir)).toEqual({
                action: { type: 'openWorkspace', cwd: dir },
                json: false,
            });
        });
    });

    it('parses explicit open', () => {
        withTempDir((dir) => {
            expect(parseCliArgs(['open'], dir)).toEqual({
                action: { type: 'openWorkspace', cwd: dir },
                json: false,
            });
        });
    });

    it('parses tab command', () => {
        withTempDir((dir) => {
            expect(parseCliArgs(['tab', 'pi'], dir)).toEqual({
                action: { type: 'createTab', kind: 'pi', cwd: dir },
                json: false,
            });
        });
    });

    it('parses json flag', () => {
        withTempDir((dir) => {
            expect(parseCliArgs(['--json', 'open'], dir)).toEqual({
                action: { type: 'openWorkspace', cwd: dir },
                json: true,
            });
        });
    });

    it('rejects missing directories', () => {
        withTempDir((dir) => {
            expect(() => parseCliArgs(['missing'], dir)).toThrow(/Not a directory/);
        });
    });
});
