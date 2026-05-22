import { useEffect, useMemo, useRef } from 'react';
import { useHybridHotkeys, type HybridHotkeyBinding, type HotkeyCommand } from '@/modules/hotkeys';
import { workspaceHotkeyLabel } from '@/modules/workspace/hotkeys';
import type { TabKind } from '@/modules/tabs';
import type { Workspace } from '@/modules/workspace';

export type AppHotkeyActions = {
    openWorkspacePicker(): void;
    focusWorkspace(index: number | null): void;
    moveWorkspacePreview(delta: number | null): void;
    selectWorkspacePreview(): void;
    confirmDeleteActiveWorkspace(): void;
    focusTab(index: number | null): void;
    addTab(kind: TabKind): void;
    closeActiveTab(): void;
    primeWorkspacePreview(): void;
};

export function useAppHotkeys(actions: AppHotkeyActions) {
    const hotkeyBindings = useMemo<HybridHotkeyBinding[]>(
        () => [
            {
                keys: 'Control+o',
                command: 'workspace.picker.open',
                description: 'Open workspace picker',
                allowInInputs: true,
            },
            {
                keys: 'Control+Space o',
                command: 'workspace.picker.open',
                description: 'Open workspace picker',
                allowInInputs: true,
            },
            ...(['pi', 'terminal', 'scratch', 'browser'] as const).map((kind) => ({
                keys: `Control+Space ${kind === 'pi' ? 'c' : kind[0]}`,
                command: 'tab.add',
                args: { kind },
                description: `New ${kind} tab`,
                allowInInputs: true,
            })),
            {
                keys: 'Control+w',
                command: 'tab.close.active',
                description: 'Close current tab',
                allowInInputs: true,
            },
            {
                keys: 'Control+Shift+w',
                command: 'workspace.delete.active.confirm',
                description: 'Delete current workspace',
                allowInInputs: true,
            },
            {
                keys: 'Control+Space d',
                command: 'workspace.delete.active.confirm',
                description: 'Delete current workspace',
                allowInInputs: true,
            },
            ...[
                ['ArrowLeft', -1],
                ['ArrowRight', 1],
                ['ArrowUp', -5],
                ['ArrowDown', 5],
            ].map(([key, delta]) => ({
                keys: `Control+Space [Control]+${key}`,
                command: 'workspace.preview.move',
                args: { delta },
                description: 'Move workspace preview',
                stay: true,
                allowInInputs: true,
            })),
            {
                keys: 'Control+Space [Control]+Enter',
                command: 'workspace.preview.select',
                description: 'Select workspace',
                allowInInputs: true,
            },
            ...Array.from({ length: 10 }, (_, index) => ({
                keys: `Control+Space [Control]+${workspaceHotkeyLabel(index)}`,
                command: 'workspace.focus',
                args: { index },
                description: `Focus workspace ${workspaceHotkeyLabel(index)}`,
                allowInInputs: true,
            })),
            ...Array.from({ length: 9 }, (_, index) => ({
                keys: `Control+${index + 1}`,
                command: 'tab.focus',
                args: { index },
                description: `Focus tab ${index + 1}`,
                allowInInputs: true,
            })),
        ],
        [],
    );

    const hotkeyCommands = useMemo<Record<string, HotkeyCommand>>(
        () => ({
            'workspace.picker.open': actions.openWorkspacePicker,
            'workspace.focus': (args?: unknown) => actions.focusWorkspace(readIndexArg(args)),
            'workspace.preview.move': (args?: unknown) =>
                actions.moveWorkspacePreview(readDeltaArg(args)),
            'workspace.preview.select': actions.selectWorkspacePreview,
            'workspace.delete.active.confirm': actions.confirmDeleteActiveWorkspace,
            'tab.focus': (args?: unknown) => actions.focusTab(readIndexArg(args)),
            'tab.add': (args?: unknown) => actions.addTab(readTabKindArg(args) ?? 'pi'),
            'tab.close.active': actions.closeActiveTab,
        }),
        [actions],
    );

    const hotkeys = useHybridHotkeys({
        prefixKey: 'Control+Space',
        bindings: hotkeyBindings,
        commands: hotkeyCommands,
    });
    const previousHotkeyTableRef = useRef(hotkeys.activeTable);

    useEffect(() => {
        const previousTable = previousHotkeyTableRef.current;
        previousHotkeyTableRef.current = hotkeys.activeTable;
        if (hotkeys.activeTable === 'root' || previousTable !== 'root') return;
        actions.primeWorkspacePreview();
    }, [actions, hotkeys.activeTable]);

    useEffect(() => {
        let lastKey: string | null = null;
        let lastAt = 0;
        return listenForNativeHotkeys((key) => {
            const now = Date.now();
            if (key === lastKey && now - lastAt < 80) return;
            lastKey = key;
            lastAt = now;
            if (/^Control\+[1-9]$/.test(key)) {
                actions.focusTab(Number(key.slice('Control+'.length)) - 1);
                return;
            }
            if (key === 'Control+w') actions.closeActiveTab();
            if (key === 'Control+Shift+w') actions.confirmDeleteActiveWorkspace();
            if (key === 'Control+o') actions.openWorkspacePicker();
        });
    }, [actions]);

    return hotkeys;
}

function listenForNativeHotkeys(onHotkey: (key: string) => void) {
    const onWindowHotkey = (event: Event) => {
        const key = (event as CustomEvent<{ key?: string }>).detail?.key;
        if (key) onHotkey(key);
    };
    window.addEventListener('pimux:native-hotkey', onWindowHotkey);
    const unsubscribe = window.pimux.on('native:hotkey', (event) => onHotkey(event.key));
    return () => {
        window.removeEventListener('pimux:native-hotkey', onWindowHotkey);
        unsubscribe();
    };
}

export function orderedWorkspaceIds(orderIds: string[], workspaces: Workspace[]): string[] {
    return orderIds.length ? orderIds : workspaces.map((workspace) => workspace.id);
}

function readDeltaArg(args: unknown): number | null {
    if (typeof args !== 'object' || args === null || !('delta' in args)) return null;
    const delta = (args as { delta?: unknown }).delta;
    return typeof delta === 'number' ? delta : null;
}

function readIndexArg(args: unknown): number | null {
    if (typeof args !== 'object' || args === null || !('index' in args)) return null;
    const index = (args as { index?: unknown }).index;
    return typeof index === 'number' ? index : null;
}

function readTabKindArg(args: unknown): TabKind | null {
    if (typeof args !== 'object' || args === null || !('kind' in args)) return null;
    const kind = (args as { kind?: unknown }).kind;
    return kind === 'pi' || kind === 'terminal' || kind === 'scratch' || kind === 'browser'
        ? kind
        : null;
}
