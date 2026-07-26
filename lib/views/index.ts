import type { ViewStatusType } from '@/components/sidebar/view-status';
import { BUILTIN_SOURCES, getExecutableSource, type SourceId } from '@/lib/sources';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '@/lib/settings';
import { useCallback, useEffect, useState } from 'react';

export interface View {
    id: string;
    title: string;
    description?: string;
    status?: ViewStatusType;
    cwd: string;
    sourceId: SourceId;
    sessionId?: string;
    resumeSession?: boolean;
    lockTitle?: boolean;
    pinned?: boolean;
    lastActiveAt?: number;
}

type SavedView = Omit<View, 'cwd' | 'sourceId'> & {
    cwd?: string | null;
    sourceId?: string | null;
};
type NewView = Omit<View, 'id'>;
type OpenView = Pick<View, 'cwd' | 'sourceId'> & Partial<Pick<View, 'sessionId' | 'resumeSession' | 'title'>>;

export function useViews() {
    const [views, setViews] = useState<View[]>([]);
    const [defaultCwd, setDefaultCwd] = useState('');
    const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
    const [error, setError] = useState<string>();

    useEffect(() => {
        void Promise.all([invoke<SavedView[]>('views_load'), invoke<{ cwd: string }>('workspace_info', { cwd: null })])
            .then(([savedViews, workspace]) => {
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
                            resumeSession: sourceId === BUILTIN_SOURCES.pi.id,
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
        setViews((current) => [...current, view]);
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
            const unpinned = current.filter((view) => !view.pinned);
            const index = unpinned.findIndex((view) => view.id === id);
            if (index <= 0) return current;
            unpinned.unshift(unpinned.splice(index, 1)[0]);
            return current.map((view) => (view.pinned ? view : unpinned.shift()!));
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
        loading: loadState === 'loading',
        error,
    };
}
