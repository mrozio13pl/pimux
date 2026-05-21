import { useEffect, useRef, type WheelEvent } from 'react';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal, type ITheme, type IWindowsPty } from '@xterm/xterm';
import { formatHex, parse, wcagContrast } from 'culori';
import { events, ipc } from '@/ipc';
import type { TerminalProfile } from '../../../../shared/terminalProfile';
import type {
    PiTab as PiTabModel,
    TabRenderProps,
    TerminalTab as TerminalTabModel,
} from '../types';

const TERMINAL_FONT_SIZE_KEY = 'pimux:terminal-font-size';
const MIN_TERMINAL_FONT_SIZE = 9;
const MAX_TERMINAL_FONT_SIZE = 32;

export function TerminalTab({
    tab,
    workspace,
    updateTab,
}: TabRenderProps<TerminalTabModel | PiTabModel>) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const terminalIdRef = useRef<string | null>(null);
    const latestTabRef = useRef(tab);
    const updateTabRef = useRef(updateTab);
    const fitRef = useRef<FitAddon | null>(null);
    const fontSizeRef = useRef<number | null>(null);
    const startedRef = useRef(false);

    useEffect(() => {
        latestTabRef.current = tab;
        updateTabRef.current = updateTab;
    }, [tab, updateTab]);

    useEffect(() => {
        if (startedRef.current || !hostRef.current) return;
        startedRef.current = true;

        let disposed = false;
        let cleanup = () => {};

        const start = async () => {
            const terminalProfile = mergeNativeTerminalProfile(
                getNativeTerminalProfile(),
                await ipc.system.terminalProfile().catch(() => null),
            );
            if (disposed || !hostRef.current) return;

            hostRef.current.style.backgroundColor = terminalProfile.theme.background ?? '#000000';
            const initialFontSize = getStoredTerminalFontSize(terminalProfile.fontSize);
            fontSizeRef.current = initialFontSize;

            const term = new Terminal({
                allowProposedApi: true,
                altClickMovesCursor: true,
                convertEol: false,
                cursorBlink: true,
                cursorInactiveStyle: 'outline',
                cursorStyle: 'block',
                customGlyphs: true,
                drawBoldTextInBrightColors: true,
                fastScrollSensitivity: 5,
                fontFamily: terminalProfile.fontFamily,
                fontSize: initialFontSize,
                fontWeight: '400',
                fontWeightBold: '700',
                lineHeight: terminalProfile.lineHeight,
                letterSpacing: 0,
                macOptionIsMeta: true,
                minimumContrastRatio: 4.5,
                reflowCursorLine: true,
                rightClickSelectsWord: true,
                scrollback: 50_000,
                scrollOnEraseInDisplay: true,
                scrollOnUserInput: true,
                scrollSensitivity: 1,
                smoothScrollDuration: 0,
                tabStopWidth: 8,
                theme: terminalProfile.theme,
                windowsPty: terminalProfile.windowsPty,
            });
            terminalRef.current = term;

            const fit = new FitAddon();
            fitRef.current = fit;
            const search = new SearchAddon({ highlightLimit: 2000 });
            const serialize = new SerializeAddon();
            term.loadAddon(fit);
            term.loadAddon(search);
            term.loadAddon(serialize);
            term.loadAddon(new ClipboardAddon());
            term.loadAddon(new Unicode11Addon());
            term.unicode.activeVersion = '11';
            term.loadAddon(
                new WebLinksAddon((_event, uri) => {
                    if (/^https?:\/\//i.test(uri))
                        window.open(uri, '_blank', 'noopener,noreferrer');
                }),
            );
            term.open(hostRef.current);
            if (tab.scrollback) term.write(tab.scrollback);

            try {
                const webgl = new WebglAddon();
                webgl.onContextLoss(() => webgl.dispose());
                term.loadAddon(webgl);
            } catch {
                // Keep terminal usable when WebGL2 is unavailable.
            }

            requestAnimationFrame(() => {
                fit.fit();
                term.focus();
            });

            const disposables: Array<() => void> = [];
            const pendingInput: string[] = [];
            let persistTimer: number | null = null;
            const schedulePersist = () => {
                if (persistTimer != null) return;
                persistTimer = window.setTimeout(() => {
                    persistTimer = null;
                    const latestTab = latestTabRef.current;
                    const scrollback = serialize.serialize({
                        scrollback: 5000,
                        excludeModes: true,
                    });
                    if (scrollback !== latestTab.scrollback)
                        updateTabRef.current({ ...latestTab, scrollback });
                }, 750);
            };

            const markCommandActivity = () => {
                const latestTab = latestTabRef.current;
                updateTabRef.current({ ...latestTab, updatedAt: Date.now() });
            };
            const inputDisposable = term.onData((data) => {
                if (isCommandSubmit(data)) markCommandActivity();
                const terminalId = terminalIdRef.current;
                if (terminalId) void ipc.terminal.write({ terminalId, data });
                else pendingInput.push(data);
            });
            const titleDisposable = term.onTitleChange((title) => {
                const nextTitle = normalizeTerminalTitle(title);
                if (!nextTitle) return;
                const latestTab = latestTabRef.current;
                if (latestTab.title !== nextTitle)
                    updateTabRef.current({ ...latestTab, title: nextTitle });
            });
            const keyDisposable = term.onKey(({ domEvent }) => {
                const key = domEvent.key.toLowerCase();

                if (
                    domEvent.shiftKey &&
                    !(domEvent.ctrlKey || domEvent.metaKey || domEvent.altKey)
                ) {
                    if (key === 'pageup') {
                        domEvent.preventDefault();
                        term.scrollPages(-1);
                    } else if (key === 'pagedown') {
                        domEvent.preventDefault();
                        term.scrollPages(1);
                    } else if (key === 'home') {
                        domEvent.preventDefault();
                        term.scrollToTop();
                    } else if (key === 'end') {
                        domEvent.preventDefault();
                        term.scrollToBottom();
                    }
                    return;
                }

                if (!(domEvent.ctrlKey || domEvent.metaKey)) return;

                if (isZoomInKey(domEvent)) {
                    domEvent.preventDefault();
                    zoomTerminal(1);
                } else if (isZoomOutKey(domEvent)) {
                    domEvent.preventDefault();
                    zoomTerminal(-1);
                } else if (isZoomResetKey(domEvent)) {
                    domEvent.preventDefault();
                    resetTerminalZoom(terminalProfile.fontSize);
                } else if (domEvent.shiftKey && key === 'f') {
                    domEvent.preventDefault();
                    const query = window.prompt('Find in terminal');
                    if (query) search.findNext(query, { decorations: searchDecorations() });
                } else if (domEvent.shiftKey && key === 'c' && term.hasSelection()) {
                    domEvent.preventDefault();
                    void navigator.clipboard.writeText(term.getSelection());
                } else if (domEvent.shiftKey && key === 'v') {
                    domEvent.preventDefault();
                    void navigator.clipboard.readText().then((text) => {
                        const terminalId = terminalIdRef.current;
                        if (terminalId && text) {
                            if (isCommandSubmit(text)) markCommandActivity();
                            void ipc.terminal.write({ terminalId, data: text });
                        }
                    });
                } else if (domEvent.shiftKey && key === 'a') {
                    domEvent.preventDefault();
                    term.selectAll();
                } else if (domEvent.shiftKey && key === 's') {
                    domEvent.preventDefault();
                    void navigator.clipboard.writeText(serialize.serialize());
                }
            });
            term.attachCustomKeyEventHandler((event) => {
                if (event.type !== 'keydown') return true;
                const key = event.key.toLowerCase();
                if (event.shiftKey && !(event.ctrlKey || event.metaKey || event.altKey)) {
                    return !['pageup', 'pagedown', 'home', 'end'].includes(key);
                }
                if (event.ctrlKey || event.metaKey) {
                    if (isZoomInKey(event) || isZoomOutKey(event) || isZoomResetKey(event))
                        return false;
                    if (event.shiftKey) return !['f', 'c', 'v', 'a', 's'].includes(key);
                }
                return true;
            });
            disposables.push(
                () => inputDisposable.dispose(),
                () => titleDisposable.dispose(),
                () => keyDisposable.dispose(),
            );

            ipc.terminal
                .create({
                    tabId: tab.id,
                    workspaceId: workspace.id,
                    cwd: workspace.cwd,
                    cols: term.cols,
                    rows: term.rows,
                    mode: tab.kind === 'pi' ? 'pi' : 'shell',
                    piSessionFile: tab.kind === 'pi' ? tab.sessionFile : undefined,
                })
                .then(({ terminalId }) => {
                    if (disposed) return;
                    terminalIdRef.current = terminalId;
                    for (const data of pendingInput) void ipc.terminal.write({ terminalId, data });
                    pendingInput.length = 0;
                    disposables.push(
                        events.on('terminal:data', (event) => {
                            if (event.terminalId === terminalId)
                                term.write(event.data, schedulePersist);
                        }),
                        events.on('terminal:exit', (event) => {
                            if (event.terminalId === terminalId)
                                term.writeln(`\r\n[process exited: ${event.exitCode}]`);
                        }),
                    );
                });

            const resizeObserver = new ResizeObserver(() => {
                requestAnimationFrame(() => {
                    fit.fit();
                    const terminalId = terminalIdRef.current;
                    if (terminalId)
                        ipc.terminal.resize({ terminalId, cols: term.cols, rows: term.rows });
                });
            });
            resizeObserver.observe(hostRef.current);

            cleanup = () => {
                resizeObserver.disconnect();
                if (persistTimer != null) window.clearTimeout(persistTimer);
                const latestTab = latestTabRef.current;
                const scrollback = serialize.serialize({ scrollback: 5000, excludeModes: true });
                if (scrollback !== latestTab.scrollback)
                    updateTabRef.current({ ...latestTab, scrollback });
                for (const dispose of disposables) dispose();
                fitRef.current = null;
                terminalRef.current = null;
                term.dispose();
            };
        };

        void start();

        return () => {
            disposed = true;
            cleanup();
        };
    }, [workspace.cwd, workspace.id]);

    function zoomTerminal(delta: number) {
        const current = fontSizeRef.current ?? getNativeTerminalProfile().fontSize;
        setTerminalFontSize(current + delta);
    }

    function resetTerminalZoom(defaultFontSize: number) {
        setTerminalFontSize(defaultFontSize);
    }

    function setTerminalFontSize(next: number) {
        const term = terminalRef.current;
        const size = clamp(Math.round(next), MIN_TERMINAL_FONT_SIZE, MAX_TERMINAL_FONT_SIZE);
        fontSizeRef.current = size;
        localStorage.setItem(TERMINAL_FONT_SIZE_KEY, String(size));
        if (!term) return;

        term.options.fontSize = size;
        requestAnimationFrame(() => {
            fitRef.current?.fit();
            const terminalId = terminalIdRef.current;
            if (terminalId) ipc.terminal.resize({ terminalId, cols: term.cols, rows: term.rows });
        });
    }

    function handleWheel(event: WheelEvent<HTMLDivElement>) {
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.deltaY < 0) zoomTerminal(1);
        else if (event.deltaY > 0) zoomTerminal(-1);
    }

    return (
        <div
            ref={hostRef}
            tabIndex={-1}
            className="h-full min-h-0 overflow-hidden p-2"
            aria-label={tab.title}
            style={{ backgroundColor: getNativeTerminalProfile().theme.background }}
            onPointerDown={() => terminalRef.current?.focus()}
            onFocus={() => terminalRef.current?.focus()}
            onWheelCapture={handleWheel}
        />
    );
}

type NativeTerminalProfile = {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    theme: ITheme;
    windowsPty?: IWindowsPty;
};

function mergeNativeTerminalProfile(
    fallback: NativeTerminalProfile,
    detected: TerminalProfile | null,
): NativeTerminalProfile {
    if (!detected) return fallback;
    return {
        ...fallback,
        fontFamily: detected.fontFamily ?? fallback.fontFamily,
        fontSize: detected.fontSize ?? fallback.fontSize,
        lineHeight: detected.lineHeight ?? fallback.lineHeight,
        theme: { ...fallback.theme, ...detected.theme },
    };
}

function getNativeTerminalProfile(): NativeTerminalProfile {
    const platform = getPlatform();
    if (platform === 'windows') {
        return {
            fontFamily: "'Cascadia Mono', Consolas, 'Courier New', monospace",
            fontSize: 14,
            lineHeight: 1.2,
            windowsPty: { backend: 'conpty' },
            theme: {
                background: '#0c0c0c',
                foreground: '#cccccc',
                cursor: '#ffffff',
                cursorAccent: '#0c0c0c',
                selectionBackground: '#264f78',
                black: '#0c0c0c',
                red: '#c50f1f',
                green: '#13a10e',
                yellow: '#c19c00',
                blue: '#0037da',
                magenta: '#881798',
                cyan: '#3a96dd',
                white: '#cccccc',
                brightBlack: '#767676',
                brightRed: '#e74856',
                brightGreen: '#16c60c',
                brightYellow: '#f9f1a5',
                brightBlue: '#3b78ff',
                brightMagenta: '#b4009e',
                brightCyan: '#61d6d6',
                brightWhite: '#f2f2f2',
            },
        };
    }

    if (platform === 'mac') {
        return {
            fontFamily: 'Menlo, Monaco, "SF Mono", "DejaVu Sans Mono", monospace',
            fontSize: 13,
            lineHeight: 1.18,
            theme: {
                background: '#000000',
                foreground: '#c7c7c7',
                cursor: '#c7c7c7',
                cursorAccent: '#000000',
                selectionBackground: '#4d4d4d',
                black: '#000000',
                red: '#c91b00',
                green: '#00c200',
                yellow: '#c7c400',
                blue: '#0225c7',
                magenta: '#ca30c7',
                cyan: '#00c5c7',
                white: '#c7c7c7',
                brightBlack: '#676767',
                brightRed: '#ff6d67',
                brightGreen: '#5ff967',
                brightYellow: '#fefb67',
                brightBlue: '#6871ff',
                brightMagenta: '#ff76ff',
                brightCyan: '#5ffdff',
                brightWhite: '#ffffff',
            },
        };
    }

    return {
        fontFamily:
            "'DejaVu Sans Mono', 'Ubuntu Mono', 'Liberation Mono', 'Noto Sans Mono', monospace",
        fontSize: 14,
        lineHeight: 1.18,
        theme: {
            background: '#171421',
            foreground: '#d0cfcc',
            cursor: '#d0cfcc',
            cursorAccent: '#171421',
            selectionBackground: '#3a3a3a',
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
    };
}

function normalizeTerminalTitle(title: string): string | null {
    const trimmed = title.replace(/\s+/g, ' ').trim();
    if (!trimmed) return null;
    return trimmed.length > 48 ? `${trimmed.slice(0, 47)}…` : trimmed;
}

function getStoredTerminalFontSize(fallback: number): number {
    const stored = Number.parseInt(localStorage.getItem(TERMINAL_FONT_SIZE_KEY) ?? '', 10);
    return Number.isFinite(stored)
        ? clamp(stored, MIN_TERMINAL_FONT_SIZE, MAX_TERMINAL_FONT_SIZE)
        : fallback;
}

function isZoomInKey(event: KeyboardEvent): boolean {
    return !event.altKey && (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd');
}

function isZoomOutKey(event: KeyboardEvent): boolean {
    return !event.altKey && (event.key === '-' || event.code === 'NumpadSubtract');
}

function isZoomResetKey(event: KeyboardEvent): boolean {
    return !event.altKey && (event.key === '0' || event.code === 'Numpad0');
}

function isCommandSubmit(data: string): boolean {
    return data.includes('\r') || data.includes('\n');
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function getPlatform(): 'mac' | 'windows' | 'linux' {
    const platform = navigator.platform.toLowerCase();
    const userAgent = navigator.userAgent.toLowerCase();
    if (platform.includes('mac')) return 'mac';
    if (platform.includes('win') || userAgent.includes('windows')) return 'windows';
    return 'linux';
}

function searchDecorations() {
    const primary = cssColorToHex(cssVar('--primary'), '#e8b45b');
    const secondary = cssColorToHex(cssVar('--secondary'), '#3a3328');

    return {
        matchBackground: secondary,
        matchOverviewRuler: primary,
        activeMatchBackground: primary,
        activeMatchColorOverviewRuler: primary,
        activeMatchForeground: readableForeground(primary),
    };
}

function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function cssColorToHex(value: string, fallback: string): string {
    const color = parse(value.trim());
    return color ? formatHex(color) : fallback;
}

function readableForeground(background: string): string {
    return wcagContrast(background, '#000000') >= wcagContrast(background, '#ffffff')
        ? '#000000'
        : '#ffffff';
}
