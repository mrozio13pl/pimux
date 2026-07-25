import { matchesKeyboardEvent, type Hotkey, useHotkeys } from '@tanstack/react-hotkeys';
import { useEffect } from 'react';
import { useSettings } from './hook';

export type HotkeyOverrides = Record<string, Hotkey | null | undefined>;

const activeHotkeys = new Map<symbol, Hotkey>();

export function useAppHotkey(id: string, defaultHotkey: string | undefined, handler: () => void) {
    const override = useSettings((state) => state.hotkeys[id]);
    const hotkey = (override === null ? undefined : (override ?? defaultHotkey)) as Hotkey | undefined;

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
}

export function isAppHotkey(event: KeyboardEvent) {
    return [...activeHotkeys.values()].some((hotkey) => matchesKeyboardEvent(event, hotkey));
}
