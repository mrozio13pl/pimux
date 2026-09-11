import { LazyStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Hotkey } from '@tanstack/react-hotkeys';
import { defaultSettings, type SettingId, type SettingValue, type SettingValues } from './definitions';
import type { SourceId } from '@/lib/sources/create-source';
import type { HotkeyOverrides } from './hotkeys';

export interface SourceOverride {
    title: string;
    /** empty means the default command. */
    executable?: string;
    icon?: string;
    iconMonochrome: boolean;
}

export interface RecentView {
    cwd: string;
    sourceId: SourceId;
}

interface SettingsState {
    values: SettingValues;
    hotkeys: HotkeyOverrides;
    sourceOverrides: Record<string, SourceOverride>;
    recentViews: RecentView[];
    setSetting: <Id extends SettingId>(id: Id, value: SettingValue<Id>) => void;
    resetSettings: () => void;
    resetSettingGroup: (ids: SettingId[]) => void;
    setHotkey: (id: string, hotkey: Hotkey | null) => void;
    resetHotkeys: () => void;
    setSourceOverride: (id: string, override: SourceOverride) => void;
    resetSourceOverrides: () => void;
    rememberRecentView: (view: RecentView) => void;
}

const file = new LazyStore('settings.json', { autoSave: 200 });
const storage: StateStorage = {
    getItem: async (key) => (await file.get<string>(key)) ?? null,
    setItem: async (key, value) => void (await file.set(key, value)),
    removeItem: async (key) => void (await file.delete(key)),
};

export const useSettings = create<SettingsState>()(
    persist(
        (set) => ({
            values: defaultSettings,
            hotkeys: {},
            sourceOverrides: {},
            recentViews: [],
            setSetting: (id, value) => set((state) => ({ values: { ...state.values, [id]: value } })),
            resetSettings: () => set({ values: { ...defaultSettings } }),
            resetSettingGroup: (ids) =>
                set((state) => ({
                    values: { ...state.values, ...Object.fromEntries(ids.map((id) => [id, defaultSettings[id]])) },
                })),
            setHotkey: (id, hotkey) => set((state) => ({ hotkeys: { ...state.hotkeys, [id]: hotkey } })),
            resetHotkeys: () => set({ hotkeys: {} }),
            setSourceOverride: (id, override) =>
                set((state) => ({ sourceOverrides: { ...state.sourceOverrides, [id]: override } })),
            resetSourceOverrides: () => set({ sourceOverrides: {} }),
            rememberRecentView: (view) =>
                set((state) => ({
                    recentViews: [
                        view,
                        ...state.recentViews.filter(
                            (recent) => recent.cwd !== view.cwd || recent.sourceId !== view.sourceId,
                        ),
                    ].slice(0, 8),
                })),
        }),
        {
            name: 'settings',
            storage: createJSONStorage(() => storage),
            partialize: ({ values, hotkeys, sourceOverrides, recentViews }) => ({
                values,
                hotkeys,
                sourceOverrides,
                recentViews,
            }),
            merge: (saved, current) => {
                const previous = saved as Partial<SettingsState> | undefined;
                return { ...current, ...previous, values: { ...defaultSettings, ...previous?.values } };
            },
            onRehydrateStorage: () => (_state, error) => {
                if (error) console.error('Failed to load settings', error);
            },
        },
    ),
);
