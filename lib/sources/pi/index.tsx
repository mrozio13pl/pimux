import { Pi } from '@lobehub/icons';
import { createSource } from '@/lib/sources/create-source';
import { parsePiSidebarUpdate } from '@/lib/sources/pi/protocol';

export const piSource = createSource({
    id: 'builtin:pi',
    title: 'Pi',
    icon: <Pi />,
    executable: ({ cwd }) => ({ cwd, sourceId: 'builtin:pi' }),
    experimental: true,
    viewButton: {
        initial: { description: 'New Pi instance', status: 'idle' },
        connect: (terminal, update) => {
            const paste = (event: ClipboardEvent) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                terminal.input('\x16', true);
            };

            terminal.element?.addEventListener('paste', paste, { capture: true });
            const titles = terminal.onTitleChange((title) => {
                const sidebar = parsePiSidebarUpdate(title);
                if (sidebar) update(sidebar);
            });

            return {
                onProcessEvent: (event) => {
                    if (event.type === 'exited') update({ status: 'finished' });
                },
                dispose: () => {
                    terminal.element?.removeEventListener('paste', paste, { capture: true });
                    titles.dispose();
                },
            };
        },
    },
});
