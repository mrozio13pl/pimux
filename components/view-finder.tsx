import { ClockCounterClockwiseIcon } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { defaultFilter } from 'cmdk';
import { useEffect, useState } from 'react';
import { ViewStatus } from '@/components/sidebar/view-status';
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import type { ExecutableSource } from '@/lib/sources';
import { compactAge } from '@/lib/utils';
import type { View } from '@/lib/views';

export interface SessionSearchResult {
    sourceId: string;
    sessionId: string;
    title: string;
    cwd: string;
    snippet: string;
    role: string;
    modified: number;
}

interface ViewFinderProps {
    sources: ReadonlyArray<ExecutableSource>;
    views: ReadonlyArray<View>;
    currentViewId?: string;
    shellOutput: ReadonlyMap<string, string>;
    query: string;
    onSelectView: (id: string) => void;
    onSelectSession: (session: SessionSearchResult) => void;
}

export function ViewFinder({
    sources,
    views,
    currentViewId,
    shellOutput,
    query,
    onSelectView,
    onSelectSession,
}: ViewFinderProps) {
    const [sessionResults, setSessionResults] = useState<SessionSearchResult[]>([]);
    const [indexing, setIndexing] = useState(true);
    const [searchError, setSearchError] = useState<string>();
    const [indexRevision, setIndexRevision] = useState(0);
    const sessionResultById = new Map(
        sessionResults.map((result) => [`${result.sourceId}:${result.sessionId}`, result]),
    );
    const matchingViews = views
        .map((view) => {
            const source = sources.find((candidate) => candidate.id === view.sourceId);
            const transcript = view.sessionId ? sessionResultById.get(`${view.sourceId}:${view.sessionId}`) : undefined;
            const metadata = [
                view.title,
                view.description,
                view.cwd,
                source?.title,
                view.status,
                view.pinned ? 'pinned' : '',
            ]
                .filter(Boolean)
                .join(' ');
            const metadataScore = query ? defaultFilter(metadata, query, []) : 1;
            const outputMatch =
                query && view.sourceId === 'builtin:shell'
                    ? shellOutput.get(view.id)?.toLocaleLowerCase().includes(query.toLocaleLowerCase())
                    : false;
            return {
                view,
                source,
                transcript,
                score: Math.max(metadataScore, transcript ? 1 : 0, outputMatch ? 1 : 0),
            };
        })
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score);
    const openSessionIds = new Set(
        views.filter((view) => view.sessionId).map((view) => `${view.sourceId}:${view.sessionId}`),
    );
    const previousSessions = sessionResults.filter(
        (result) => !openSessionIds.has(`${result.sourceId}:${result.sessionId}`),
    );

    useEffect(() => {
        let cancelled = false;
        void invoke<number>('sessions_refresh')
            .then(() => {
                if (!cancelled) setIndexRevision((revision) => revision + 1);
            })
            .catch((error: unknown) => {
                if (!cancelled) setSearchError(String(error));
            })
            .finally(() => {
                if (!cancelled) setIndexing(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!query.trim()) {
            setSessionResults([]);
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(() => {
            void invoke<SessionSearchResult[]>('sessions_search', { query })
                .then((results) => {
                    if (!cancelled) setSessionResults(results);
                })
                .catch((error: unknown) => {
                    if (!cancelled) setSearchError(String(error));
                });
        }, 100);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [indexRevision, query]);

    return (
        <>
            {matchingViews.length > 0 && (
                <CommandGroup heading="Open views">
                    {matchingViews.map(({ view, source, transcript }) => {
                        return (
                            <CommandItem
                                key={view.id}
                                value={`${view.title} ${view.description || ''} ${view.cwd} ${source?.title || view.sourceId} ${transcript?.snippet || ''} ${view.id}`}
                                onSelect={() => onSelectView(view.id)}
                            >
                                {source?.icon}
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5 font-medium">
                                        <ViewStatus variant={view.status} />
                                        <span className="truncate">{view.title}</span>
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">{view.cwd}</span>
                                </span>
                                {(view.id === currentViewId || view.lastActiveAt) && (
                                    <CommandShortcut>
                                        {view.id === currentViewId ? 'Current' : compactAge(view.lastActiveAt)}
                                    </CommandShortcut>
                                )}
                            </CommandItem>
                        );
                    })}
                </CommandGroup>
            )}
            {previousSessions.length > 0 && (
                <CommandGroup heading="Previous sessions">
                    {previousSessions.map((session) => {
                        const source = sources.find((candidate) => candidate.id === session.sourceId);
                        const age = compactAge(session.modified * 1000);
                        return (
                            <CommandItem
                                key={`${session.sourceId}:${session.sessionId}`}
                                value={`${session.title} ${session.cwd} ${source?.title || session.sourceId} ${session.snippet} ${session.sessionId}`}
                                disabled={!source}
                                onSelect={() => onSelectSession(session)}
                            >
                                {source?.icon || <ClockCounterClockwiseIcon />}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">{session.title}</span>
                                    {session.snippet && (
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {session.snippet}
                                        </span>
                                    )}
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {session.cwd} · {source?.title || session.sourceId}
                                    </span>
                                </span>
                                <CommandShortcut>
                                    {[!source && 'Unavailable', age].filter(Boolean).join(' · ')}
                                </CommandShortcut>
                            </CommandItem>
                        );
                    })}
                </CommandGroup>
            )}
            {indexing && (
                <CommandGroup>
                    <CommandItem disabled>Indexing session history…</CommandItem>
                </CommandGroup>
            )}
            {searchError && (
                <CommandGroup>
                    <CommandItem disabled>{searchError}</CommandItem>
                </CommandGroup>
            )}
        </>
    );
}
