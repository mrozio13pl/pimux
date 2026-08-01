import {
    CommandIcon,
    GearIcon,
    ListDashesIcon,
    PaletteIcon,
    SparkleIcon,
    TerminalWindowIcon,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GeneralSettings, settingsForSection } from '@/components/settings/general';
import { HotkeySettings } from '@/components/settings/hotkeys';
import { SourcesSettings } from '@/components/settings/sources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import type { AvailableSource, CustomSourceId, ExecutableSource } from '@/lib/sources';
import type { CustomSourceRecord } from '@/lib/sources/custom';
import {
    settingDefinitions,
    useAppHotkey,
    useRegisteredHotkeys,
    useSettings,
    type SourceOverride,
} from '@/lib/settings';

const settingSections = [
    {
        id: 'appearance',
        icon: <PaletteIcon data-icon="inline-start" />,
        keywords: 'theme motion icons appearance',
    },
    {
        id: 'views',
        icon: <ListDashesIcon data-icon="inline-start" />,
        keywords: 'default source sort archive view',
    },
    {
        id: 'terminal',
        icon: <TerminalWindowIcon data-icon="inline-start" />,
        keywords: 'cursor blink terminal',
    },
    {
        id: 'shortcuts',
        icon: <CommandIcon data-icon="inline-start" />,
        keywords: 'hotkeys keyboard keymap shortcuts',
    },
    {
        id: 'sources',
        icon: <SparkleIcon data-icon="inline-start" />,
        keywords: 'source executable command terminal',
    },
] as const;

type SettingsSection = (typeof settingSections)[number]['id'];

interface SettingsDialogProps {
    sources: ReadonlyArray<ExecutableSource>;
    availableSources: ReadonlyArray<AvailableSource>;
    customSources: CustomSourceRecord[];
    addSource: (
        title: string,
        executable: string,
        icon?: string,
        iconMonochrome?: boolean,
    ) => Promise<CustomSourceRecord>;
    updateSource: (
        id: CustomSourceId,
        title: string,
        executable: string,
        icon?: string,
        iconMonochrome?: boolean,
    ) => Promise<CustomSourceRecord>;
    sourceOverrides: Record<string, SourceOverride>;
    updateSourceOverride: (id: string, override: SourceOverride) => void;
    removeSource: (id: CustomSourceId) => Promise<void>;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({
    sources,
    availableSources,
    customSources,
    addSource,
    updateSource,
    sourceOverrides,
    updateSourceOverride,
    removeSource,
    open,
    onOpenChange,
}: SettingsDialogProps) {
    const [section, setSection] = useState<SettingsSection>('views');
    const [query, setQuery] = useState('');
    const registeredHotkeys = useRegisteredHotkeys();
    const hotkeyOverrides = useSettings((state) => state.hotkeys);
    const searchInput = useRef<HTMLInputElement>(null);
    const visibleSections = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return settingSections;
        const settingsText = (section: 'appearance' | 'views' | 'terminal') =>
            settingsForSection(section)
                .map((id) => {
                    const definition = settingDefinitions[id];
                    return `${definition.label} ${'description' in definition ? definition.description : ''}`;
                })
                .join(' ');
        const sourceText = [
            ...availableSources.map((source) => source.title),
            ...customSources.flatMap((source) => [source.title, source.executable]),
        ].join(' ');
        const hotkeyText = [
            ...registeredHotkeys.flatMap((hotkey) => [hotkey.id, hotkey.label, hotkey.defaultHotkey]),
            ...Object.values(hotkeyOverrides),
        ].join(' ');
        return settingSections.filter(({ id, keywords }) =>
            `${id} ${keywords} ${id === 'sources' ? sourceText : id === 'shortcuts' ? hotkeyText : settingsText(id)}`
                .toLowerCase()
                .includes(term),
        );
    }, [availableSources, customSources, hotkeyOverrides, query, registeredHotkeys]);
    useEffect(() => {
        if (open) requestAnimationFrame(() => searchInput.current?.focus());
    }, [open]);
    useEffect(() => {
        if (!visibleSections.some(({ id }) => id === section)) setSection(visibleSections[0]?.id ?? 'views');
    }, [section, visibleSections]);
    const show = (nextSection: SettingsSection) => {
        setSection(nextSection);
        onOpenChange(true);
    };
    useAppHotkey('pimux.open-settings', 'Mod+I', () => show('views'), 'Open settings');
    useAppHotkey('pimux.open-hotkeys', 'Mod+/', () => show('shortcuts'), 'Open hotkeys');
    useAppHotkey('pimux.open-sources', 'Mod+S', () => show('sources'), 'Open sources');
    const searching = Boolean(query.trim());
    const details = searching
        ? { title: 'Search results', description: `Settings matching “${query.trim()}”.` }
        : {
              appearance: { title: 'Appearance', description: 'Configure Pimux visual preferences.' },
              views: { title: 'Views', description: 'Configure view behavior and defaults.' },
              terminal: { title: 'Terminal', description: 'Configure terminal cursor behavior.' },
              shortcuts: { title: 'Shortcuts', description: 'Record or clear keyboard shortcuts.' },
              sources: { title: 'Sources', description: 'Manage available terminal sources and their shortcuts.' },
          }[section];
    const shows = (id: SettingsSection) =>
        searching ? visibleSections.some((item) => item.id === id) : section === id;

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) setQuery('');
                onOpenChange(nextOpen);
            }}
        >
            <DialogTrigger render={<Button variant="outline" size="icon-lg" aria-label="Settings" />}>
                <GearIcon data-icon="inline-start" weight="bold" />
            </DialogTrigger>
            <DialogContent className="flex h-[min(42rem,calc(100svh-2rem))] max-h-[calc(100svh-2rem)] flex-col p-0 sm:max-w-4xl">
                <div className="flex min-h-0 flex-1 overflow-hidden">
                    <nav
                        className="flex w-48 shrink-0 flex-col gap-1 border-r bg-muted/50 p-4"
                        aria-label="Settings sections"
                    >
                        <Input
                            ref={searchInput}
                            type="search"
                            aria-label="Search settings"
                            placeholder="Search settings…"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                        {visibleSections.map((settingSection) => (
                            <Button
                                key={settingSection.id}
                                variant={settingSection.id === section ? 'secondary' : 'ghost'}
                                onClick={() => setSection(settingSection.id)}
                                className="justify-start capitalize"
                            >
                                {settingSection.icon}
                                {settingSection.id}
                            </Button>
                        ))}
                        {visibleSections.length === 0 && (
                            <p className="px-3 py-2 text-xs text-muted-foreground">No settings found.</p>
                        )}
                    </nav>
                    <section className="min-h-0 min-w-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto p-4 pr-5">
                        <DialogHeader className="gap-0 border-b pb-4">
                            <DialogTitle className="text-lg font-bold">{details.title}</DialogTitle>
                            <DialogDescription>{details.description}</DialogDescription>
                        </DialogHeader>

                        {shows('appearance') && (
                            <div className="space-y-3">
                                {searching && <h3 className="font-medium">Appearance</h3>}
                                <GeneralSettings sources={sources} section="appearance" query={query} />
                            </div>
                        )}
                        {shows('views') && (
                            <div className="space-y-3">
                                {searching && <h3 className="font-medium">Views</h3>}
                                <GeneralSettings sources={sources} section="views" query={query} />
                            </div>
                        )}
                        {shows('terminal') && (
                            <div className="space-y-3">
                                {searching && <h3 className="font-medium">Terminal</h3>}
                                <GeneralSettings sources={sources} section="terminal" query={query} />
                            </div>
                        )}
                        {shows('shortcuts') && (
                            <div className="space-y-3">
                                {searching && <h3 className="font-medium">Shortcuts</h3>}
                                <HotkeySettings query={query} />
                            </div>
                        )}
                        {shows('sources') && (
                            <div className="space-y-3">
                                {searching && <h3 className="font-medium">Sources</h3>}
                                <SourcesSettings
                                    sources={availableSources}
                                    customSources={customSources}
                                    addSource={addSource}
                                    updateSource={updateSource}
                                    sourceOverrides={sourceOverrides}
                                    updateSourceOverride={updateSourceOverride}
                                    removeSource={removeSource}
                                    open={open}
                                    query={query}
                                />
                            </div>
                        )}
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
