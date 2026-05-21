import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowClockwiseIcon, ArrowUpIcon, GlobeIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { BrowserTab as BrowserTabModel, TabRenderProps } from '../types';

export function BrowserTab({ tab, updateTab }: TabRenderProps<BrowserTabModel>) {
    const webviewRef = useRef<HTMLElement | null>(null);
    const [draft, setDraft] = useState(tab.url);
    const src = useMemo(() => normalizeUrl(tab.url), [tab.url]);

    useEffect(() => setDraft(tab.url), [tab.url]);

    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const persistUrl = (event: Event) => {
            const url = (event as Event & { url?: string }).url;
            if (typeof url === 'string' && url !== tab.url) updateTab({ ...tab, url });
        };
        const persistTitle = (event: Event) => {
            const title = (event as Event & { title?: string }).title;
            if (typeof title === 'string' && title.trim() && title !== tab.title)
                updateTab({ ...tab, title: title.trim() });
        };

        webview.addEventListener('did-navigate', persistUrl);
        webview.addEventListener('did-navigate-in-page', persistUrl);
        webview.addEventListener('page-title-updated', persistTitle);
        return () => {
            webview.removeEventListener('did-navigate', persistUrl);
            webview.removeEventListener('did-navigate-in-page', persistUrl);
            webview.removeEventListener('page-title-updated', persistTitle);
        };
    }, [tab, updateTab]);
    return (
        <div className="flex h-full flex-col bg-sidebar">
            <form
                className="flex items-center gap-2 border-b bg-sidebar px-3 py-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    updateTab({ ...tab, url: normalizeUrl(draft) });
                }}
            >
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0 text-muted-foreground hover:text-foreground"
                                onClick={() => updateTab({ ...tab, url: normalizeUrl(draft) })}
                            >
                                <ArrowClockwiseIcon />
                            </Button>
                        }
                    />
                    <TooltipContent>Reload</TooltipContent>
                </Tooltip>
                <div className="relative flex-1">
                    <GlobeIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        className="h-9 bg-input/40 pl-9 font-mono text-sm"
                        placeholder="Enter a URL"
                    />
                </div>
                <Button type="submit" variant="secondary" size="sm" className="shrink-0">
                    <ArrowUpIcon data-icon="inline-start" className="-rotate-45" />
                    Go
                </Button>
            </form>
            <div className="min-h-0 flex-1 bg-sidebar">
                <webview ref={webviewRef} src={src} allowpopups={true} />
            </div>
        </div>
    );
}

function normalizeUrl(value: string): string {
    if (!value.trim()) return 'about:blank';
    if (/^https?:\/\//i.test(value) || value.startsWith('file:') || value.startsWith('about:'))
        return value;
    return `https://${value}`;
}
