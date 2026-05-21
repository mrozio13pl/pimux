export type TerminalThemeColorName =
    | 'background'
    | 'foreground'
    | 'cursor'
    | 'cursorAccent'
    | 'selectionBackground'
    | 'selectionForeground'
    | 'black'
    | 'red'
    | 'green'
    | 'yellow'
    | 'blue'
    | 'magenta'
    | 'cyan'
    | 'white'
    | 'brightBlack'
    | 'brightRed'
    | 'brightGreen'
    | 'brightYellow'
    | 'brightBlue'
    | 'brightMagenta'
    | 'brightCyan'
    | 'brightWhite';

export type TerminalThemeProfile = Partial<Record<TerminalThemeColorName, string>>;

export type TerminalProfile = {
    source: string;
    fontFamily?: string;
    fontSize?: number;
    lineHeight?: number;
    theme?: TerminalThemeProfile;
};
