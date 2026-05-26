import { ArrowDownIcon, ArrowUpIcon, XIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { searchDecorations } from './terminalSearchTheme';
import type { TerminalSearchResults } from './terminalTypes';

type TerminalSearchOverlayProps = {
    inputId: string;
    query: string;
    results: TerminalSearchResults | null;
    onQueryChange(query: string): void;
    onNext(): void;
    onPrevious(): void;
    onClose(): void;
};

export function TerminalSearchOverlay({
    inputId,
    query,
    results,
    onQueryChange,
    onNext,
    onPrevious,
    onClose,
}: TerminalSearchOverlayProps) {
    return (
        <form
            className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-xl border border-border bg-popover/95 p-1.5 text-sm text-popover-foreground shadow-2xl backdrop-blur"
            onSubmit={(event) => {
                event.preventDefault();
                onNext();
            }}
        >
            <input
                id={inputId}
                className="h-8 w-64 rounded-lg border border-input bg-background px-2 text-foreground outline-none focus:ring-2 focus:ring-ring"
                value={query}
                placeholder="Find in terminal"
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                        event.preventDefault();
                        event.currentTarget.select();
                    }
                    if (event.key === 'Escape') onClose();
                    if (event.key === 'Enter' && event.shiftKey) {
                        event.preventDefault();
                        onPrevious();
                    }
                }}
            />
            <span className="min-w-14 px-1 text-center text-xs text-muted-foreground">
                {results?.count ? `${results.index + 1}/${results.count}` : '0/0'}
            </span>
            <TerminalToolButton label="Previous match" onClick={onPrevious}>
                <ArrowUpIcon className="size-4" />
            </TerminalToolButton>
            <TerminalToolButton label="Next match" type="submit">
                <ArrowDownIcon className="size-4" />
            </TerminalToolButton>
            <TerminalToolButton label="Close search" onClick={onClose}>
                <XIcon className="size-4" />
            </TerminalToolButton>
        </form>
    );
}

export { searchDecorations };

function TerminalToolButton({
    label,
    children,
    type = 'button',
    onClick,
}: {
    label: string;
    children: ReactNode;
    type?: 'button' | 'submit';
    onClick?(): void;
}) {
    return (
        <button
            type={type}
            aria-label={label}
            className="flex h-8 min-w-8 items-center justify-center rounded-lg px-2 hover:bg-accent hover:text-accent-foreground"
            onClick={onClick}
        >
            {children}
        </button>
    );
}
