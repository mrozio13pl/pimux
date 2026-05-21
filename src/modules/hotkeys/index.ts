import { useEffect, useMemo, useRef, useState } from 'react';
import { tinykeys } from 'tinykeys';

export * from './components';

export type HotkeyCommand = (args?: unknown) => void;

export type HybridHotkeyBinding = {
    /** Flat/hybrid form: "Control+Space w" or "Control+k". */
    keys?: string;
    /** Explicit table form. Defaults to root. */
    table?: string;
    /** Explicit key inside table. */
    key?: string;
    command: string;
    args?: unknown;
    description?: string;
    stay?: boolean;
    nextTable?: string;
    preventDefault?: boolean;
    allowInInputs?: boolean;
};

type CompiledHotkeyBinding = Required<Pick<HybridHotkeyBinding, 'table' | 'key'>> &
    Omit<HybridHotkeyBinding, 'table' | 'key' | 'keys'>;

export type HotkeyTable = {
    name: string;
    bindings: CompiledHotkeyBinding[];
};

export type UseHybridHotkeysOptions = {
    prefixKey: string;
    bindings: HybridHotkeyBinding[];
    commands: Record<string, HotkeyCommand>;
    prefixTable?: string;
    timeoutMs?: number;
};

const ROOT_TABLE = 'root';
const KEYTABLE_ENTER = 'keytable.enter';

export function compileHybridHotkeys(
    bindings: HybridHotkeyBinding[],
    prefixKey: string,
    prefixTable = 'prefix',
): CompiledHotkeyBinding[] {
    const compiled: CompiledHotkeyBinding[] = [
        {
            table: ROOT_TABLE,
            key: prefixKey,
            command: KEYTABLE_ENTER,
            args: { table: prefixTable },
            description: `Enter ${prefixTable} key table`,
            preventDefault: true,
            allowInInputs: true,
        },
    ];

    for (const binding of bindings) {
        if (binding.keys) {
            const parts = binding.keys.trim().split(/\s+/);
            if (parts.length === 0) continue;

            if (parts[0] === prefixKey && parts.length === 2) {
                compiled.push({
                    ...binding,
                    table: prefixTable,
                    key: parts[1],
                    preventDefault: binding.preventDefault ?? true,
                });
                continue;
            }

            if (parts.length === 1) {
                compiled.push({
                    ...binding,
                    table: ROOT_TABLE,
                    key: parts[0],
                    preventDefault: binding.preventDefault ?? true,
                });
                continue;
            }

            throw new Error(`Unsupported hotkey sequence: ${binding.keys}`);
        }

        if (!binding.key) throw new Error(`Hotkey binding missing key for ${binding.command}`);
        compiled.push({
            ...binding,
            table: binding.table ?? ROOT_TABLE,
            key: binding.key,
            preventDefault: binding.preventDefault ?? true,
        });
    }

    return compiled;
}

export function groupHotkeysByTable(bindings: CompiledHotkeyBinding[]): HotkeyTable[] {
    const byTable = new Map<string, CompiledHotkeyBinding[]>();
    for (const binding of bindings) {
        const table = byTable.get(binding.table) ?? [];
        table.push(binding);
        byTable.set(binding.table, table);
    }
    return [...byTable.entries()].map(([name, tableBindings]) => ({
        name,
        bindings: tableBindings,
    }));
}

export function useModifierKeyPressed(key: 'Alt' | 'Control' | 'Meta' | 'Shift') {
    const [pressed, setPressed] = useState(false);

    useEffect(() => {
        const update = (event: KeyboardEvent) => setPressed(event.getModifierState(key));
        const reset = () => setPressed(false);

        window.addEventListener('keydown', update, true);
        window.addEventListener('keyup', update, true);
        window.addEventListener('blur', reset);
        document.addEventListener('visibilitychange', reset);

        return () => {
            window.removeEventListener('keydown', update, true);
            window.removeEventListener('keyup', update, true);
            window.removeEventListener('blur', reset);
            document.removeEventListener('visibilitychange', reset);
        };
    }, [key]);

    return pressed;
}

export function useHybridHotkeys({
    prefixKey,
    bindings,
    commands,
    prefixTable = 'prefix',
    timeoutMs = 60_000,
}: UseHybridHotkeysOptions) {
    const [activeTable, setActiveTable] = useState(ROOT_TABLE);
    const activeTableRef = useRef(activeTable);
    const timerRef = useRef<number | null>(null);
    const commandsRef = useRef(commands);

    commandsRef.current = commands;
    activeTableRef.current = activeTable;

    const compiled = useMemo(
        () => compileHybridHotkeys(bindings, prefixKey, prefixTable),
        [bindings, prefixKey, prefixTable],
    );
    const tables = useMemo(() => groupHotkeysByTable(compiled), [compiled]);

    useEffect(() => {
        const tableBindings = compiled.filter((binding) => binding.table === activeTable);
        const keyHandlers: Record<string, (event: KeyboardEvent) => void> = {};

        for (const binding of tableBindings) {
            keyHandlers[binding.key] = (event) => {
                if (isEditableTarget(event.target) && !binding.allowInInputs) return;
                if (binding.preventDefault) event.preventDefault();

                if (timerRef.current !== null) {
                    window.clearTimeout(timerRef.current);
                    timerRef.current = null;
                }

                if (binding.command === KEYTABLE_ENTER) {
                    const next = readTableArg(binding.args) ?? ROOT_TABLE;
                    setActiveTable(next);
                    return;
                }

                commandsRef.current[binding.command]?.(binding.args);

                if (binding.nextTable) {
                    setActiveTable(binding.nextTable);
                } else if (activeTableRef.current !== ROOT_TABLE && !binding.stay) {
                    setActiveTable(ROOT_TABLE);
                }
            };
        }

        if (activeTable !== ROOT_TABLE && !keyHandlers.Escape) {
            keyHandlers.Escape = (event) => {
                event.preventDefault();
                setActiveTable(ROOT_TABLE);
            };
        }

        const unsubscribe = tinykeys(window, keyHandlers, { ignore: () => false, capture: true });

        if (activeTable !== ROOT_TABLE) {
            timerRef.current = window.setTimeout(() => {
                setActiveTable(ROOT_TABLE);
                timerRef.current = null;
            }, timeoutMs);
        }

        return () => {
            unsubscribe();
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [activeTable, compiled, timeoutMs]);

    return { activeTable, tables, reset: () => setActiveTable(ROOT_TABLE) };
}

function readTableArg(args: unknown): string | null {
    if (typeof args === 'object' && args !== null && 'table' in args) {
        const table = (args as { table?: unknown }).table;
        return typeof table === 'string' ? table : null;
    }
    return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
