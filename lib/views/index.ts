import type { ViewStatusType } from '@/components/sidebar/view-status';
import { BUILTIN_SOURCES, getExecutableSource, type SourceId } from '@/lib/sources';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '@/lib/settings';
import { useCallback, useEffect, useState } from 'react';
import { archiveInactive } from './archive';

export interface View {
    id: string;
    title: string;
    description?: string;
    status?: ViewStatusType;
    cwd: string;
    sourceId: SourceId;
    sessionId?: string;
    model?: string;
    resumeSession?: boolean;
    lockTitle?: boolean;
    pinned?: boolean;
    archived?: boolean;
    lastActiveAt?: number;
}

type SavedView = Omit<View, 'cwd' | 'sourceId'> & {
    cwd?: string | null;
    sourceId?: string | null;
};

interface DaemonSession {
    viewId: string;
    pid: number | null;
    alive: boolean;
    sourceId: string;
    cwd: string;
    attached: boolean;
}

function killSession(id: string) {
    void invoke('pty_kill', { viewId: id }).catch(() => undefined);
}

function newlyArchived(before: View[], after: View[]) {
    const archived = new Set(before.filter((view) => view.archived).map((view) => view.id));
    return after.filter((view) => view.archived && !archived.has(view.id)).map((view) => view.id);
}

type NewView = Omit<View, 'id'>;
type OpenView = Pick<View, 'cwd' | 'sourceId'> & Partial<Pick<View, 'sessionId' | 'resumeSession' | 'title'>>;

export function useViews() {
    const [views, setViews] = useState<View[]>([]);
    const [defaultCwd, setDefaultCwd] = useState('');
    const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
    const [error, setError] = useState<string>();

    useEffect(() => {
        void Promise.all([
            invoke<SavedView[]>('views_load'),
            invoke<{ cwd: string }>('workspace_info', { cwd: null }),
            invoke<DaemonSession[]>('pty_sessions_list').catch(() => [] as DaemonSession[]),
        ])
            .then(([savedViews, workspace, sessions]) => {
                const adoptable = new Set(savedViews.filter((view) => !view.archived).map((view) => view.id));
                for (const session of sessions) {
                    if (!adoptable.has(session.viewId)) killSession(session.viewId);
                }
                setDefaultCwd(workspace.cwd);
                setViews(
                    savedViews.map((view) => {
                        const source = getExecutableSource(view.sourceId || '') || BUILTIN_SOURCES.shell;
                        const sourceId: SourceId = view.sourceId?.startsWith('custom:')
                            ? (view.sourceId as SourceId)
                            : source.id;
                        return {
                            ...source.viewButton.initial,
                            ...view,
                            cwd: view.cwd || workspace.cwd,
                            sourceId,
                            resumeSession:
                                Boolean(view.sessionId) &&
                                (sourceId === BUILTIN_SOURCES.pi.id || sourceId === BUILTIN_SOURCES.claude.id),
                        };
                    }),
                );
                setLoadState('ready');
            })
            .catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : String(reason));
                setLoadState('failed');
            });
    }, []);

    useEffect(() => {
        if (loadState !== 'ready') return;

        void invoke('views_save', { views }).catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : String(reason));
        });
    }, [loadState, views]);

    const addView = useCallback((input: NewView) => {
        const view = { id: crypto.randomUUID(), ...input };
        setViews((current) => {
            const first = current.findIndex((existing) => !existing.pinned);
            return first < 0 ? [...current, view] : [...current.slice(0, first), view, ...current.slice(first)];
        });
        return view;
    }, []);

    const openView = useCallback(
        ({ cwd, sourceId, sessionId, resumeSession, title: requestedTitle }: OpenView) => {
            const source = getExecutableSource(sourceId) || BUILTIN_SOURCES.shell;
            const resolvedSourceId: SourceId = sourceId.startsWith('custom:') ? sourceId : source.id;
            useSettings.getState().rememberRecentView({ cwd, sourceId: resolvedSourceId });
            const title =
                requestedTitle ||
                cwd
                    .replace(/[\\/]+$/, '')
                    .split(/[\\/]/)
                    .pop() ||
                'View';
            return addView({
                title,
                ...source.viewButton.initial,
                cwd,
                sourceId: resolvedSourceId,
                lastActiveAt: Date.now(),
                sessionId,
                resumeSession,
            });
        },
        [addView],
    );

    const updateView = useCallback((id: string, patch: Partial<NewView>) => {
        setViews((current) => current.map((view) => (view.id === id ? { ...view, ...patch } : view)));
    }, []);

    const updateViewFromSource = useCallback((id: string, patch: Partial<NewView>) => {
        setViews((current) =>
            current.map((view) =>
                view.id === id
                    ? {
                          ...view,
                          ...patch,
                          title: patch.title !== undefined && view.lockTitle !== true ? patch.title : view.title,
                      }
                    : view,
            ),
        );
    }, []);

    const removeView = useCallback((id: string) => {
        killSession(id);
        setViews((current) => current.filter((view) => view.id !== id));
    }, []);

    const moveView = useCallback((id: string, overId: string) => {
        setViews((current) => {
            const from = current.findIndex((view) => view.id === id);
            const to = current.findIndex((view) => view.id === overId);
            if (from < 0 || to < 0 || from === to) return current;
            const next = [...current];
            next.splice(to, 0, next.splice(from, 1)[0]);
            return next;
        });
    }, []);

    const promoteView = useCallback((id: string) => {
        setViews((current) => {
            const unpinned = current.filter((view) => !view.pinned && !view.archived);
            const index = unpinned.findIndex((view) => view.id === id);
            if (index <= 0) return current;
            unpinned.unshift(unpinned.splice(index, 1)[0]);
            return current.map((view) => (view.pinned || view.archived ? view : unpinned.shift()!));
        });
    }, []);

    const toggleViewPin = useCallback((id: string) => {
        setViews((current) => {
            const index = current.findIndex((view) => view.id === id);
            if (index < 0) return current;
            const next = [...current];
            const view = next.splice(index, 1)[0];
            if (view.pinned) next.splice(index, 0, { ...view, pinned: false });
            else next.unshift({ ...view, pinned: true });
            return next;
        });
    }, []);

    const toggleViewArchive = useCallback((id: string) => {
        setViews((current) => {
            const next = current.map((view) =>
                view.id === id
                    ? { ...view, archived: !view.archived, pinned: view.archived ? view.pinned : false }
                    : view,
            );
            newlyArchived(current, next).forEach(killSession);
            return next;
        });
    }, []);

    const archiveInactiveViews = useCallback((cutoff: number) => {
        setViews((current) => {
            const next = archiveInactive(current, cutoff);
            if (next !== current) newlyArchived(current, next).forEach(killSession);
            return next;
        });
    }, []);

    return {
        views,
        defaultCwd,
        openView,
        updateView,
        updateViewFromSource,
        removeView,
        moveView,
        promoteView,
        toggleViewPin,
        toggleViewArchive,
        archiveInactiveViews,
        loading: loadState === 'loading',
        error,
    };
}
