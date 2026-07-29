import { Pi } from '@lobehub/icons';
import { createSource } from '@/lib/sources/create-source';
import { isPiPasteShortcut } from '@/lib/sources/pi/paste';
import { parsePiSidebarUpdate } from '@/lib/sources/pi/protocol';

export const piSource = createSource({
    id: 'builtin:pi',
    title: 'Pi',
    icon: <Pi />,
    executable: ({ cwd }) => ({ cwd, sourceId: 'builtin:pi' }),
    experimental: false,
    viewButton: {
        initial: { description: 'New Pi instance', status: 'idle' },
        connect: (terminal, update) => {
            const paste = (event: KeyboardEvent) => {
                if (!isPiPasteShortcut(event, navigator.userAgent)) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                terminal.input('\x16', true);
            };

            terminal.element?.addEventListener('keydown', paste, { capture: true });
            const titles = terminal.onTitleChange((title) => {
                const sidebar = parsePiSidebarUpdate(title);
                if (sidebar) update(sidebar);
            });

            return {
                onProcessEvent: (event) => {
                    if (event.type === 'exited') update({ status: 'finished' });
                },
                dispose: () => {
                    terminal.element?.removeEventListener('keydown', paste, { capture: true });
                    titles.dispose();
                },
            };
        },
    },
});
