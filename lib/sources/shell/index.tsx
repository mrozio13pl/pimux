import { TerminalWindowIcon } from '@phosphor-icons/react';
import { createSource } from '@/lib/sources/create-source';

export const shellSource = createSource({
    id: 'builtin:shell',
    command: '$SHELL',
    title: 'Shell',
    icon: <TerminalWindowIcon />,
    input: { nativePaste: false },
    executable: ({ cwd }) => ({ cwd, sourceId: 'builtin:shell' }),
    experimental: false,
    viewButton: {
        initial: { description: 'New terminal', status: 'idle' },
        connect: (terminal, update) => {
            let processTitle: string | undefined;
            let shellTitle: string | undefined;
            let foregroundProcess = false;
            const titles = terminal.onTitleChange((title) => {
                const cleanTitle = title.trim().replace(/\s+/g, ' ').slice(0, 160);
                if (!cleanTitle) return;
                if (!foregroundProcess) {
                    shellTitle = cleanTitle;
                    return;
                }
                if (cleanTitle === shellTitle) return;
                processTitle = cleanTitle;
                update({ description: cleanTitle });
            });
            return {
                onProcessEvent: (event) => {
                    if (event.type === 'started') {
                        foregroundProcess = true;
                        processTitle = event.title;
                        update({ description: event.title });
                    } else if (event.type === 'idle') {
                        foregroundProcess = false;
                        update({
                            description: processTitle ? `Exited ${processTitle} process` : 'Exited terminal process',
                        });
                        processTitle = undefined;
                    } else {
                        update({
                            description: processTitle ? `Exited ${processTitle} process` : 'Exited terminal process',
                        });
                    }
                },
                dispose: () => titles.dispose(),
            };
        },
    },
});
