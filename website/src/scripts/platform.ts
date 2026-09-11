export const isMac = /Mac/i.test(navigator.userAgent);

export function labelModifiers() {
    if (isMac) return;
    for (const el of document.querySelectorAll<HTMLElement>('[data-mod]')) {
        el.textContent = 'Ctrl';
    }
}
