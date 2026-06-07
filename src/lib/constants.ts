import type { CSSProperties } from 'react';

export const STORAGE_KEY = 'pimux:v1';

export const SIDEBAR_SETTINGS_KEY = 'pimux:sidebar-settings';
export const DEFAULT_SIDEBAR_SETTINGS = {
    projectSort: 'manual',
    tabSort: 'manual',
    autoOrderWorkspaces: false,
    autoOrderTabs: false,
    visibleTabs: 3,
    projectGroup: 'separate',
} as const;

export const SIDEBAR_LAYOUT_KEY = 'pimux:sidebar-layout';
export const SIDEBAR_COLLAPSED_WIDTH = 48;
export const SIDEBAR_COLLAPSE_THRESHOLD = 72;
export const DEFAULT_SIDEBAR_WIDTH = 280;

export const ROOT_TABLE = 'root';
export const KEYTABLE_ENTER = 'keytable.enter';

export const DEFAULT_TAB_GROUP_ID = 'main';

export const TERMINAL_FONT_SIZE_KEY = 'pimux:terminal-font-size';
export const TERMINAL_FONT_SIZE_VERSION_KEY = 'pimux:terminal-font-size-version';
export const TERMINAL_FONT_SIZE_VERSION = '3';
export const MIN_TERMINAL_FONT_SIZE = 9;
export const MIN_DEFAULT_TERMINAL_FONT_SIZE = 16;
export const MIN_TERMINAL_LINE_HEIGHT = 1;
export const MAX_TERMINAL_FONT_SIZE = 32;

export const gitSources = [
    { value: 'all', label: 'All' },
    { value: 'staged', label: 'Staged' },
    { value: 'unstaged', label: 'Unstaged' },
] as const;

export const DIFFS_SETTINGS_KEY = 'pimux:diffs-settings';

export const defaultDiffsSettings = {
    layout: 'split',
    indicators: 'bars',
    backgrounds: true,
    wrapping: true,
    lineNumbers: true,
    characters: 'none',
} as const;

export const diffLayoutValues = new Set(['split', 'stacked']);
export const diffIndicatorValues = new Set(['bars', 'classic', 'none']);
export const diffLineDiffValues = new Set(['word-alt', 'word', 'char', 'none']);

export const diffThemeStyle = {
    '--diffs-dark-bg': 'var(--sidebar)',
    '--diffs-dark': 'var(--foreground)',
    '--diffs-font-family': 'var(--font-mono)',
    '--diffs-header-font-family': 'var(--font-sans)',
    '--diffs-bg-context-override': 'var(--sidebar)',
    '--diffs-bg-context-gutter-override': 'var(--sidebar)',
    '--diffs-bg-separator-override': 'var(--border)',
    '--diffs-fg-number-override': 'var(--muted-foreground)',
    // '--diffs-addition-color-override': 'oklch(0.72 0.14 155)',
    // '--diffs-deletion-color-override': 'oklch(0.7 0.18 25)',
} as CSSProperties;

export const diffUnsafeCSS = `
[data-separator=simple] { min-height: 1px; background-color: var(--border); }
[data-diffs-header] {
    min-height: 36px;
    background-color: var(--card);
    border-bottom: 1px solid var(--border);
    padding-inline: 8px;
    cursor: pointer;
}
pre, code, [data-gutter], [data-content] { background-color: var(--sidebar); }
[data-gutter] [data-gutter-buffer], [data-gutter] [data-column-number] {
    border-right: 1px solid var(--border);
}
[data-diff-type=split][data-overflow=scroll] [data-additions],
[data-diff-type=split][data-overflow=wrap] [data-additions] [data-gutter] {
    border-left-color: var(--border);
}
[data-diff-type=split][data-overflow=scroll] [data-deletions],
[data-diff-type=split][data-overflow=wrap] [data-deletions] [data-content] {
    border-right-color: var(--border);
}
[data-column-number] { color: var(--muted-foreground); }
[data-title] {
    cursor: pointer;
    text-underline-offset: 2px;
}
[data-title]:hover { text-decoration: underline; }
[data-metadata] > slot[name='header-metadata'] { order: -1; }
[data-code] {
    padding-top: 0;
    padding-bottom: 0;
}
[data-line], [data-column-number], [data-no-newline] {
    padding-inline: 1ch;
}
`;
