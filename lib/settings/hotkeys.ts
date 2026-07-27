import { matchesKeyboardEvent, type Hotkey, useHotkeys } from '@tanstack/react-hotkeys';
import { useEffect, useSyncExternalStore } from 'react';
import { useSettings } from './hook';

export type HotkeyOverrides = Record<string, Hotkey | null | undefined>;

type RegisteredHotkey = { id: string; label: string; defaultHotkey?: Hotkey };
type HotkeyRegistration = RegisteredHotkey & { hotkey?: Hotkey };

const activeHotkeys = new Map<symbol, HotkeyRegistration>();
const hotkeyListeners = new Set<() => void>();
let registeredHotkeys: RegisteredHotkey[] = [];

function publishHotkeys() {
    const definitions = new Map<string, RegisteredHotkey>();
    for (const { id, label, defaultHotkey } of activeHotkeys.values()) {
        definitions.set(id, { id, label, defaultHotkey });
    }
    registeredHotkeys = [...definitions.values()];
    for (const listener of hotkeyListeners) listener();
}

export function useRegisteredHotkeys() {
    return useSyncExternalStore(
        (listener) => {
            hotkeyListeners.add(listener);
            return () => hotkeyListeners.delete(listener);
        },
        () => registeredHotkeys,
        () => registeredHotkeys,
    );
}

export function useAppHotkeyValue(id: string, defaultHotkey: string | undefined) {
    const override = useSettings((state) => state.hotkeys[id]);
    return (override === null ? undefined : (override ?? defaultHotkey)) as Hotkey | undefined;
}

export function useAppHotkey(id: string, defaultHotkey: string | undefined, handler: () => void, label = id) {
    const hotkey = useAppHotkeyValue(id, defaultHotkey);

    useEffect(() => {
        const registration = Symbol(id);
        activeHotkeys.set(registration, { id, label, defaultHotkey, hotkey });
        publishHotkeys();
        return () => {
            activeHotkeys.delete(registration);
            publishHotkeys();
        };
    }, [defaultHotkey, hotkey, id, label]);

    useHotkeys(hotkey ? [{ hotkey, callback: handler }] : [], {
        preventDefault: true,
        stopPropagation: true,
        requireReset: true,
    });

    return hotkey;
}

export function isAppHotkey(event: KeyboardEvent) {
    return [...activeHotkeys.values()].some(({ hotkey }) => hotkey && matchesKeyboardEvent(event, hotkey));
}
