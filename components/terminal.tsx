import { useSettings } from '@/lib/settings';
import { BUILTIN_SOURCES, type SourceId, type SourceProcessEvent, type SourceTerminalBinding } from '@/lib/sources';
import { cn } from '@/lib/utils';
import { Channel, invoke } from '@tauri-apps/api/core';
import { Ansis } from 'ansis';
import { FitAddon, init, Terminal as GhosttyTerminal } from 'ghostty-web';
import { useEffect, useLayoutEffect, useRef } from 'react';

let ghosttyReady: ReturnType<typeof init> | undefined;
const encoder = new TextEncoder();
const ansi = new Ansis(3);

let shownTerminal: GhosttyTerminal | undefined;

function detachTerminal(terminal: GhosttyTerminal) {
    terminal.blur();
    terminal.renderer?.getCanvas().remove();
    terminal.textarea?.remove();
}

function renderTerminal(terminal: GhosttyTerminal) {
    if (!terminal.renderer || !terminal.wasmTerm) return;
    terminal.renderer.clear();
    terminal.renderer.render(terminal.wasmTerm, true, terminal.viewportY, terminal);
}

function setTerminalActive(terminal: GhosttyTerminal, active: boolean) {
    if (!active) {
        detachTerminal(terminal);
        if (shownTerminal === terminal) shownTerminal = undefined;
        return;
    }

    const canvas = terminal.renderer?.getCanvas();
    if (!canvas || !terminal.element) return;
    document
        .querySelectorAll('[data-terminal] canvas, [data-terminal] textarea')
        .forEach((element) => element.remove());
    terminal.element.replaceChildren(canvas, ...(terminal.textarea ? [terminal.textarea] : []));
    shownTerminal = terminal;
    renderTerminal(terminal);
    terminal.focus();
}

export function writeTerminalOutput(terminal: GhosttyTerminal, text: string) {
    const viewportY = terminal.getViewportY();
    const scrollbackLength = viewportY > 0 ? terminal.getScrollbackLength() : 0;

    terminal.write(text);

    if (viewportY > 0) {
        terminal.scrollToLine(viewportY + terminal.getScrollbackLength() - scrollbackLength);
    }
}

interface TerminalProps extends React.ComponentProps<'div'> {
    active?: boolean;
    cwd?: string;
    sourceId?: SourceId;
    sessionId?: string;
    resumeSession?: boolean;
    connectSource?: (terminal: GhosttyTerminal) => SourceTerminalBinding | void;
    onReady?: (terminal: GhosttyTerminal) => void | (() => void);
    onKeyEvent?: (event: KeyboardEvent) => boolean;
    onOutput?: (text: string) => void;
    onSubmit?: () => void;
    pty?: boolean;
}

export function Terminal({
    active = true,
    cwd,
    sourceId = BUILTIN_SOURCES.shell.id,
    sessionId,
    resumeSession = false,
    pty = true,
    connectSource,
    onReady,
    onKeyEvent,
    onOutput,
    onSubmit,
    className,
    ...props
}: TerminalProps) {
    const { cursorBlink, cursorStyle } = useSettings((state) => state.values);

    const terminalElement = useRef<HTMLDivElement>(null);
    const terminalInstance = useRef<GhosttyTerminal>(null);
    const terminalOptions = useRef({ cursorBlink, cursorStyle });
    const launchSessionId = useRef(sessionId);
    const launchWithResume = useRef(resumeSession);
    const activeRef = useRef(active);
    const connectSourceRef = useRef(connectSource);
    const onOutputRef = useRef(onOutput);
    const onSubmitRef = useRef(onSubmit);
    activeRef.current = active;
    terminalOptions.current = { cursorBlink, cursorStyle };
    connectSourceRef.current = connectSource;
    onOutputRef.current = onOutput;
    onSubmitRef.current = onSubmit;

    useLayoutEffect(() => {
        if (terminalInstance.current) setTerminalActive(terminalInstance.current, active);
    }, [active]);

    useEffect(() => {
        if (!terminalInstance.current) return;
        terminalInstance.current.options.cursorBlink = cursorBlink;
        terminalInstance.current.options.cursorStyle = cursorStyle;
    }, [cursorBlink, cursorStyle]);

    useEffect(() => {
        let terminal: GhosttyTerminal | undefined;
        let sessionId: number | undefined;
        let cancelled = false;
        let inputSubscription: { dispose(): void } | undefined;
        let resizeSubscription: { dispose(): void } | undefined;
        let sourceBinding: SourceTerminalBinding | undefined;
        let onReadyCleanup: (() => void) | undefined;
        const decoder = new TextDecoder();

        void (ghosttyReady ??= init()).then(async () => {
            await Promise.all([
                document.fonts.load('18px "Ioskeley Mono"'),
                document.fonts.load('18px "Ioskeley Mono Term Nerd Font"'),
            ]);
            if (cancelled || !terminalElement.current) return;

            terminal = new GhosttyTerminal({
                ...terminalOptions.current,
                smoothScrollDuration: 0,
                fontFamily: '"Ioskeley Mono Term Nerd Font", Monaco, Menlo, "Courier New", monospace',
                fontSize: 14,
                theme: {
                    background: '#161513',
                    foreground: '#ffffff',
                    cursor: '#ffffff',
                    selectionBackground: '#404040',
                    black: '#171421',
                    red: '#c01c28',
                    green: '#26a269',
                    yellow: '#a2734c',
                    blue: '#12488b',
                    magenta: '#a347ba',
                    cyan: '#2aa1b3',
                    white: '#d0cfcc',
                    brightBlack: '#5e5c64',
                    brightRed: '#f66151',
                    brightGreen: '#33d17a',
                    brightYellow: '#e9ad0c',
                    brightBlue: '#2a7bde',
                    brightMagenta: '#c061cb',
                    brightCyan: '#33c7de',
                    brightWhite: '#ffffff',
                },
            });

            const fit = new FitAddon();
            terminal.loadAddon(fit);
            terminal.open(terminalElement.current);
            terminalInstance.current = terminal;
            if (onKeyEvent) terminal.attachCustomKeyEventHandler(onKeyEvent);
            sourceBinding = connectSourceRef.current?.(terminal) || undefined;

            const renderer = terminal.renderer as unknown as {
                metrics: { width: number; height: number; baseline: number };
                resize(cols: number, rows: number): void;
            };
            // const measured = renderer.metrics.height;
            // renderer.metrics.width = 9;
            renderer.metrics.height = 20;
            renderer.metrics.baseline += 5;
            renderer.resize(terminal.cols, terminal.rows);

            fit.fit();
            fit.observeResize();

            const output = new Channel<number[]>();
            output.onmessage = (data) => {
                if (cancelled || !terminal) return;
                const text = decoder.decode(new Uint8Array(data), { stream: true });
                onOutputRef.current?.(text);
                writeTerminalOutput(terminal, text);
            };
            const process = new Channel<SourceProcessEvent>();
            process.onmessage = (event) => {
                if (!cancelled) sourceBinding?.onProcessEvent?.(event);
            };

            if (pty) {
                try {
                    if (!cwd) throw new Error('Terminal working directory is missing');
                    sessionId = await invoke<number>('pty_spawn', {
                        rows: terminal.rows,
                        cols: terminal.cols,
                        cwd,
                        sourceId,
                        sessionId: launchSessionId.current,
                        resumeSession: launchWithResume.current,
                        onData: output,
                        onProcess: process,
                    });
                } catch (error) {
                    if (!cancelled) terminal.writeln(`\r\n${ansi.red(String(error))}`);
                    return;
                }
            }

            if (cancelled) {
                if (sessionId !== undefined) void invoke('pty_close', { id: sessionId }).catch(() => undefined);
                return;
            }

            if (sessionId !== undefined) {
                inputSubscription = terminal.onData((data) => {
                    if (data.includes('\r') || data.includes('\n')) onSubmitRef.current?.();
                    void invoke('pty_write', { id: sessionId, data: [...encoder.encode(data)] }).catch(() => undefined);
                });
                resizeSubscription = terminal.onResize(({ rows, cols }) => {
                    void invoke('pty_resize', { id: sessionId, rows, cols }).catch(() => undefined);
                });
            }
            setTerminalActive(terminal, activeRef.current);
            const cleanup = onReady?.(terminal);
            if (cleanup) onReadyCleanup = cleanup;
        });

        return () => {
            cancelled = true;
            onReadyCleanup?.();
            sourceBinding?.dispose?.();
            inputSubscription?.dispose();
            resizeSubscription?.dispose();
            if (sessionId !== undefined) void invoke('pty_close', { id: sessionId }).catch(() => undefined);
            if (terminal) setTerminalActive(terminal, false);
            terminal?.dispose();
            terminalInstance.current = null;
        };
    }, [cwd, onKeyEvent, onReady, pty, sourceId]);

    return (
        <div
            ref={terminalElement}
            data-terminal
            className={cn('h-full overflow-hidden rounded-sm border border-white/10 bg-[#161513] p-2', className)}
            {...props}
        />
    );
}
