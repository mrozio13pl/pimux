export async function readClipboardText(): Promise<string> {
    try {
        return await navigator.clipboard.readText();
    } catch {
        return window.pimux.clipboard.readText();
    }
}

export async function copyTextToClipboard(value: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(value);
    } catch {
        await window.pimux.clipboard.writeText(value);
    }
}
