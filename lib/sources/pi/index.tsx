import { Pi } from '@lobehub/icons';
import { createSource } from '@/lib/sources/create-source';
import { bindNativePaste } from '@/lib/sources/native-paste';
import { parsePiSidebarUpdate } from '@/lib/sources/pi/protocol';

export const piSource = createSource({
    id: 'builtin:pi',
    title: 'Pi',
    command: 'pi',
    icon: <Pi />,
    executable: ({ cwd }) => ({ cwd, sourceId: 'builtin:pi' }),
    experimental: false,
    viewButton: {
        initial: { description: 'New Pi instance', status: 'idle' },
        connect: (terminal, update) => {
            const unbindPaste = bindNativePaste(terminal);
            const titles = terminal.onTitleChange((title) => {
                const sidebar = parsePiSidebarUpdate(title);
                if (sidebar) update(sidebar);
            });

            return {
                onProcessEvent: (event) => {
                    if (event.type === 'exited') update({ status: 'finished' });
                },
                dispose: () => {
                    unbindPaste();
                    titles.dispose();
                },
            };
        },
    },
});
