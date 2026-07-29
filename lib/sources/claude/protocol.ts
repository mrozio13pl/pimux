import type { SourceProcessEvent, SourceViewUpdate } from '@/lib/sources/create-source';
import type { ViewStatusType } from '@/components/sidebar/view-status';

export function claudeProcessUpdate(event: SourceProcessEvent, status: ViewStatusType): SourceViewUpdate | undefined {
    if (event.type === 'update') return event.update;
    if (event.type === 'exited' && status !== 'error') return { status: 'finished' };
}
