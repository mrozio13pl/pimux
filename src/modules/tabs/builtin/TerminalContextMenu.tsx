import type { TerminalCommand } from './terminalTypes';

type TerminalContextMenuProps = {
    position: { x: number; y: number };
    onCommand(command: TerminalCommand): void;
    onClose(): void;
};

export function TerminalContextMenu({ position, onCommand, onClose }: TerminalContextMenuProps) {
    return (
        <div className="fixed inset-0 z-30" onPointerDown={onClose}>
            <div
                className="absolute min-w-44 rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-2xl"
                style={{ left: position.x, top: position.y }}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <TerminalMenuItem label="Copy" onClick={() => onCommand('copy')} />
                <TerminalMenuItem label="Paste" onClick={() => onCommand('paste')} />
                <TerminalMenuItem label="Select All" onClick={() => onCommand('selectAll')} />
                <div className="my-1 h-px bg-border" />
                <TerminalMenuItem label="Find" onClick={() => onCommand('find')} />
                <TerminalMenuItem label="Clear Scrollback" onClick={() => onCommand('clear')} />
            </div>
        </div>
    );
}

function TerminalMenuItem({ label, onClick }: { label: string; onClick(): void }) {
    return (
        <button
            type="button"
            className="block w-full rounded-lg px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
            onClick={onClick}
        >
            {label}
        </button>
    );
}
