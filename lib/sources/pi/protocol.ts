import type { ViewStatusType } from '@/components/sidebar/view-status';
import type { SourceViewUpdate } from '@/lib/sources/create-source';

const PREFIX = 'pimux:';
const statuses = new Set<ViewStatusType>(['idle', 'error', 'finished', 'working']);

export function parsePiSidebarUpdate(title: string): SourceViewUpdate | undefined {
    if (!title.startsWith(PREFIX)) return;
    try {
        const base64 = title.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (!value || typeof value !== 'object') return;
        const payload = value as Record<string, unknown>;
        const update: SourceViewUpdate = {};
        if (typeof payload.title === 'string') update.title = payload.title.slice(0, 48);
        if (typeof payload.description === 'string') update.description = payload.description.slice(0, 160);
        if (typeof payload.status === 'string' && statuses.has(payload.status as ViewStatusType)) {
            update.status = payload.status as NonNullable<SourceViewUpdate['status']>;
        }
        if (typeof payload.sessionId === 'string' && payload.sessionId) {
            update.sessionId = payload.sessionId.slice(0, 128);
        }
        if (typeof payload.model === 'string' && payload.model) update.model = payload.model.slice(0, 128);
        if (payload.userSubmitted === true) update.userSubmitted = true;
        return Object.keys(update).length ? update : undefined;
    } catch {
        return;
    }
}
