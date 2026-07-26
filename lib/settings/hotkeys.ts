import { matchesKeyboardEvent, type Hotkey, useHotkeys } from '@tanstack/react-hotkeys';
import { useEffect } from 'react';
import { useSettings } from './hook';

export type HotkeyOverrides = Record<string, Hotkey | null | undefined>;

const activeHotkeys = new Map<symbol, Hotkey>();

export function useAppHotkeyValue(id: string, defaultHotkey: string | undefined) {
    const override = useSettings((state) => state.hotkeys[id]);
    return (override === null ? undefined : (override ?? defaultHotkey)) as Hotkey | undefined;
}

export function useAppHotkey(id: string, defaultHotkey: string | undefined, handler: () => void) {
    const hotkey = useAppHotkeyValue(id, defaultHotkey);

    useEffect(() => {
        if (!hotkey) return;
        const registration = Symbol(id);
        activeHotkeys.set(registration, hotkey);
        return () => {
            activeHotkeys.delete(registration);
        };
    }, [hotkey, id]);

    useHotkeys(hotkey ? [{ hotkey, callback: handler }] : [], {
        preventDefault: true,
        stopPropagation: true,
        requireReset: true,
    });

    return hotkey;
}

export function isAppHotkey(event: KeyboardEvent) {
    return [...activeHotkeys.values()].some((hotkey) => matchesKeyboardEvent(event, hotkey));
}
