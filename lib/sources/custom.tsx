import { TerminalWindowIcon } from '@phosphor-icons/react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import useSWR from 'swr';
import { shellSource } from '@/lib/sources/shell';
import { cn } from '@/lib/utils';
import type { AvailableSource, CustomSourceId, ExecutableSource } from '@/lib/sources';
import type { SourceOverride } from '@/lib/settings';

export interface CustomSourceRecord {
    id: CustomSourceId;
    title: string;
    executable: string;
    icon?: string;
    iconMonochrome: boolean;
}

export function applySourceOverride<Source extends AvailableSource>(source: Source, override?: SourceOverride): Source {
    if (!override) return source;
    return {
        ...source,
        title: override.title,
        icon: override.icon ? (
            <img
                src={convertFileSrc(override.icon)}
                alt=""
                className={cn('size-4 object-contain', override.iconMonochrome && 'dark:brightness-0 dark:invert')}
            />
        ) : (
            source.icon
        ),
    };
}

export function customSource(record: CustomSourceRecord): ExecutableSource {
    return {
        id: record.id,
        title: record.title,
        icon: record.icon ? (
            <img
                src={convertFileSrc(record.icon)}
                alt=""
                className={cn('size-4 object-contain', record.iconMonochrome && 'dark:brightness-0 dark:invert')}
            />
        ) : (
            <TerminalWindowIcon />
        ),
        experimental: false,
        executable: ({ cwd }) => ({ cwd, sourceId: record.id }),
        viewButton: shellSource.viewButton,
    };
}

export function useCustomSources() {
    const {
        data: sources = [],
        error: loadError,
        isLoading: loading,
        mutate,
    } = useSWR('custom-sources', () => invoke<CustomSourceRecord[]>('custom_sources_load'));
    const error = loadError instanceof Error ? loadError.message : loadError ? String(loadError) : undefined;

    const add = useCallback(
        async (title: string, executable: string, icon?: string, iconMonochrome = false) => {
            const source = await invoke<CustomSourceRecord>('custom_source_add', {
                id: `custom:${crypto.randomUUID()}`,
                title,
                executable,
                icon,
                iconMonochrome,
            });
            await mutate((current = []) => [...current, source], { revalidate: false });
            return source;
        },
        [mutate],
    );

    const update = useCallback(
        async (id: CustomSourceId, title: string, executable: string, icon?: string, iconMonochrome = false) => {
            const source = await invoke<CustomSourceRecord>('custom_source_update', {
                id,
                title,
                executable,
                icon,
                iconMonochrome,
            });
            await mutate((current = []) => current.map((item) => (item.id === id ? source : item)), {
                revalidate: false,
            });
            return source;
        },
        [mutate],
    );

    const remove = useCallback(
        async (id: CustomSourceId) => {
            await invoke('custom_source_remove', { id });
            await mutate((current = []) => current.filter((source) => source.id !== id), { revalidate: false });
        },
        [mutate],
    );

    return { sources, loading, error, add, update, remove };
}
