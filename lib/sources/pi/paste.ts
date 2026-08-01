type PiPasteKeyEvent = Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>;

export function isPiPasteShortcut(event: PiPasteKeyEvent, userAgent: string): boolean {
    if (event.key.toLowerCase() !== 'v') return false;
    if (/windows/i.test(userAgent)) return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    return event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}
