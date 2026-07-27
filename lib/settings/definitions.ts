import { DEFAULT_SOURCE_ID, type SourceId } from '@/lib/sources/create-source';
import type { ITerminalOptions } from 'ghostty-web';

export type GeneralSection = 'appearance' | 'views' | 'terminal';

type SettingMetadata = {
    section: GeneralSection;
    label: string;
    description?: string;
};

type SettingDefinition = SettingMetadata &
    (
        | { type: 'boolean'; default: boolean }
        | { type: 'number'; default: number; min?: number; max?: number; step?: number }
        | {
              type: 'select';
              default: string;
              options: 'sources' | ReadonlyArray<{ value: string; label: string }>;
          }
    );

export const settingDefinitions = {
    defaultSource: {
        section: 'views',
        type: 'select',
        default: DEFAULT_SOURCE_ID,
        options: 'sources',
        label: 'Default source',
        description: 'Used when no current view provides a source.',
    },
    theme: {
        section: 'appearance',
        type: 'select',
        default: 'system',
        label: 'Theme',
        description: "Choose Pimux's color scheme.",
        options: [
            { value: 'system', label: 'System' },
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
        ],
    },
    autoSortViews: {
        section: 'views',
        type: 'boolean',
        default: false,
        label: 'Auto-sort views',
        description: 'Move recently active views to the top.',
    },
    autoArchiveDays: {
        section: 'views',
        type: 'number',
        default: 3,
        min: 1,
        max: 3650,
        step: 1,
        label: 'Archive inactive views',
        description: 'Days without activity before moving a view to archive.',
    },
    reduceMotion: {
        section: 'appearance',
        type: 'boolean',
        default: false,
        label: 'Reduce motion',
        description: 'Disable nonessential interface animation.',
    },
    cursorStyle: {
        section: 'terminal',
        type: 'select',
        default: 'bar',
        label: 'Cursor style',
        description: 'Cursor style in the terminal',
        options: [
            {
                value: 'bar',
                label: 'Bar',
            },
            {
                value: 'block',
                label: 'Block',
            },
            {
                value: 'underline',
                label: 'Underline',
            },
        ] satisfies ReadonlyArray<{ value: ITerminalOptions['cursorStyle']; label: string }>,
    },
    cursorBlink: {
        section: 'terminal',
        type: 'boolean',
        default: false,
        label: 'Cursor blink',
    },
    showSourceIcons: {
        section: 'appearance',
        type: 'boolean',
        default: false,
        label: 'Show source icons',
        description: 'Show source icons on the sidebar for each view button',
    },
} as const satisfies Record<string, SettingDefinition>;

export type SettingId = keyof typeof settingDefinitions;
export type SettingValue<Id extends SettingId> = (typeof settingDefinitions)[Id] extends {
    type: 'boolean';
}
    ? boolean
    : (typeof settingDefinitions)[Id] extends { type: 'number' }
      ? number
      : (typeof settingDefinitions)[Id] extends { options: 'sources' }
        ? SourceId
        : (typeof settingDefinitions)[Id] extends {
                options: ReadonlyArray<{ value: infer Value }>;
            }
          ? Value
          : never;
export type SettingValues = { [Id in SettingId]: SettingValue<Id> };
export type Theme = SettingValue<'theme'>;

export const defaultSettings = Object.fromEntries(
    Object.entries(settingDefinitions).map(([id, definition]) => [id, definition.default]),
) as SettingValues;
