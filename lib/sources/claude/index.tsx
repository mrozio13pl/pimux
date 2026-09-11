import { Claude } from '@lobehub/icons';
import type { ViewStatusType } from '@/components/sidebar/view-status';
import { createSource } from '@/lib/sources/create-source';
import { claudeProcessUpdate } from '@/lib/sources/claude/protocol';

export const claudeSource = createSource({
    id: 'builtin:claudecode',
    title: 'Claude Code',
    command: 'claude',
    icon: <Claude.Color className="size-4.5" />,
    executable: ({ cwd }) => ({ cwd, sourceId: 'builtin:claudecode' }),
    experimental: true,
    viewButton: {
        initial: { description: 'New Claude Code instance', status: 'idle' },
        connect: (terminal, update) => {
            let status: ViewStatusType = 'idle';
            const titles = terminal.onTitleChange((title) => {
                const clean = title.trim().slice(0, 48);
                if (clean) update({ title: clean });
            });
            return {
                onProcessEvent: (event) => {
                    const patch = claudeProcessUpdate(event, status);
                    if (!patch) return;
                    if (patch.status) status = patch.status;
                    update(patch);
                },
                dispose: () => titles.dispose(),
            };
        },
    },
});
