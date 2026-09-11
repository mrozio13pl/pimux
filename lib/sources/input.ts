import type { Terminal } from 'ghostty-web';

type TerminalKeyEvent = Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>;

export interface SourceInputProfile {
    nativePaste?: boolean;
}

export interface ResolvedSourceInput {
    nativePaste: boolean;
}

export function resolveSourceInput(profile?: SourceInputProfile): ResolvedSourceInput {
    return { nativePaste: profile?.nativePaste ?? true };
}

export function isNativePasteShortcut(event: TerminalKeyEvent, userAgent: string): boolean {
    if (event.key.toLowerCase() !== 'v') return false;
    if (/windows/i.test(userAgent)) return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    return event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}

export function pageKeySequence(event: TerminalKeyEvent): string | undefined {
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return undefined;
    if (event.key === 'PageUp') return '\x1b[5~';
    if (event.key === 'PageDown') return '\x1b[6~';
    return undefined;
}

export function bindTerminalInput(terminal: Terminal, profile?: SourceInputProfile): () => void {
    const { nativePaste } = resolveSourceInput(profile);

    const handle = (event: KeyboardEvent) => {
        // ghostty-web encodes keys by event.code, so a numpad page key (code Numpad9) never reaches the process
        const pageKey = pageKeySequence(event);
        if (pageKey) {
            event.preventDefault();
            event.stopImmediatePropagation();
            terminal.input(pageKey, true);
            return;
        }

        if (nativePaste && isNativePasteShortcut(event, navigator.userAgent)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            terminal.input('\x16', true);
        }
    };

    terminal.element?.addEventListener('keydown', handle, { capture: true });
    return () => terminal.element?.removeEventListener('keydown', handle, { capture: true });
}
