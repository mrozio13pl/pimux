import { defaultSettings } from '../../lib/settings/definitions';

const seed = new Map<string, unknown>([
    [
        'settings',
        JSON.stringify({
            state: {
                values: { ...defaultSettings, theme: 'dark', showSourceIcons: true, shortenPaths: true },
                hotkeys: {},
                sourceOverrides: {},
                recentViews: [],
            },
            version: 0,
        }),
    ],
]);

export class LazyStore {
    #data = new Map(seed);

    async get<T>(key: string) {
        return this.#data.get(key) as T | undefined;
    }
    async set(key: string, value: unknown) {
        this.#data.set(key, value);
    }
    async delete(key: string) {
        this.#data.delete(key);
    }
    async save() {}
}
