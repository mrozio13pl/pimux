import type { Terminal } from 'ghostty-web';

type NativePasteKeyEvent = Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>;

export function isNativePasteShortcut(event: NativePasteKeyEvent, userAgent: string): boolean {
    if (event.key.toLowerCase() !== 'v') return false;
    if (/windows/i.test(userAgent)) return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    return event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}

export function bindNativePaste(terminal: Terminal): () => void {
    const paste = (event: KeyboardEvent) => {
        if (!isNativePasteShortcut(event, navigator.userAgent)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        terminal.input('\x16', true);
    };

    terminal.element?.addEventListener('keydown', paste, { capture: true });
    return () => terminal.element?.removeEventListener('keydown', paste, { capture: true });
}
