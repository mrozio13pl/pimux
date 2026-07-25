import { LobeHub } from '@lobehub/icons';
import { invoke } from '@tauri-apps/api/core';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface LobeHubCatalog {
    version: string;
    icons: Array<{ slug: string; url: string }>;
}

export function LobeHubIconDialog({ onSelect }: { onSelect: (path: string, monochrome: boolean) => void }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [staging, setStaging] = useState(false);
    const [stageError, setStageError] = useState<string>();
    const {
        data: catalog,
        error: fetchError,
        isLoading,
    } = useSWR<LobeHubCatalog>(open ? 'lobehub-icons' : null, () => invoke('lobehub_icons_load'), {
        revalidateOnFocus: false,
    });
    const error =
        stageError || (fetchError instanceof Error ? fetchError.message : fetchError ? String(fetchError) : '');
    const loading = isLoading || staging;
    const icons = useMemo(() => {
        const query = search.trim().toLowerCase();
        return query ? catalog?.icons.filter((icon) => icon.slug.includes(query)) : catalog?.icons;
    }, [catalog, search]);

    async function selectIcon(slug: string) {
        if (!catalog) return;
        setStaging(true);
        setStageError(undefined);
        try {
            const path = await invoke<string>('lobehub_icon_stage', { slug, version: catalog.version });
            onSelect(path, !slug.endsWith('-color'));
            setOpen(false);
        } catch (reason) {
            setStageError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setStaging(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
                render={<Button type="button" variant="outline" size="icon" aria-label="Choose LobeHub icon" />}
            >
                <LobeHub />
            </DialogTrigger>
            <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>LobeHub icons</DialogTitle>
                    <DialogDescription>Select an icon to stage it for this source.</DialogDescription>
                </DialogHeader>
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search icons…"
                    autoFocus
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="min-h-0 flex-1 scroll-fade-b overflow-y-auto pr-1">
                    <div className="grid grid-cols-5 content-start gap-2 sm:grid-cols-8">
                        {icons?.map((icon) => (
                            <Button
                                key={icon.slug}
                                type="button"
                                variant="outline"
                                className="aspect-square h-auto min-w-0 p-2"
                                aria-label={`Use ${icon.slug} icon`}
                                disabled={loading}
                                onClick={() => void selectIcon(icon.slug)}
                            >
                                <img
                                    src={icon.url}
                                    alt=""
                                    loading="lazy"
                                    className={cn(
                                        'size-8 object-contain',
                                        !icon.slug.endsWith('-color') && 'dark:brightness-0 dark:invert',
                                    )}
                                />
                            </Button>
                        ))}
                        {loading && !catalog && <p className="col-span-full text-sm text-muted-foreground">Loading…</p>}
                        {icons?.length === 0 && (
                            <p className="col-span-full text-sm text-muted-foreground">No icons.</p>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
