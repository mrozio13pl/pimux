import { PiIcon, PlusIcon, TerminalWindowIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

export function EmptyApp({ onCreateWorkspace }: { onCreateWorkspace(): void }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-6 bg-sidebar px-8 text-center">
            <PiIcon weight="duotone" className="size-24 text-primary" />
            <div className="duration-700 animate-in fade-in slide-in-from-bottom-2 fill-mode-both">
                <h1 className="text-2xl font-semibold tracking-tight">Pimux</h1>
                <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-balance text-muted-foreground">
                    A pi-first terminal multiplexer. Bind a workspace to a project directory and
                    drop straight into pi or a regular shell.
                </p>
            </div>
            <Button
                onClick={onCreateWorkspace}
                className="duration-700 animate-in fade-in fill-mode-both"
            >
                <PlusIcon data-icon="inline-start" />
                New workspace
            </Button>
        </div>
    );
}

export function EmptyTabs({ onOpenTerminal }: { onOpenTerminal(): void }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-sidebar text-center">
            <p className="text-sm text-muted-foreground">No tabs open in this workspace.</p>
            <Button variant="outline" size="sm" onClick={onOpenTerminal}>
                <TerminalWindowIcon data-icon="inline-start" />
                Open terminal
            </Button>
        </div>
    );
}
