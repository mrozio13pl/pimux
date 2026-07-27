import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ExecutableSource, SourceId } from '@/lib/sources';
import {
    settingDefinitions,
    useSettings,
    type GeneralSection,
    type SettingId,
    type SettingValue,
} from '@/lib/settings';

type SourceOption = { value: SourceId; label: ReactNode };
export function settingsForSection(section: GeneralSection) {
    return (Object.keys(settingDefinitions) as SettingId[]).filter((id) => settingDefinitions[id].section === section);
}

function SettingField({ id, sourceOptions }: { id: SettingId; sourceOptions: SourceOption[] }) {
    const definition = settingDefinitions[id];
    const value = useSettings((state) => state.values[id]);
    const setSetting = useSettings((state) => state.setSetting);
    const controlId = `setting-${id}`;
    const options =
        definition.type === 'select' && definition.options === 'sources'
            ? sourceOptions
            : definition.type === 'select'
              ? definition.options
              : [];

    return (
        <Field orientation="horizontal">
            <FieldContent>
                <FieldLabel htmlFor={controlId}>{definition.label}</FieldLabel>
                {'description' in definition && <FieldDescription>{definition.description}</FieldDescription>}
            </FieldContent>
            {definition.type === 'boolean' ? (
                <Switch
                    id={controlId}
                    checked={value as boolean}
                    onCheckedChange={(checked) => setSetting(id, checked as SettingValue<typeof id>)}
                />
            ) : definition.type === 'number' ? (
                <Input
                    id={controlId}
                    type="number"
                    className="w-24"
                    min={definition.min}
                    max={definition.max}
                    step={definition.step}
                    value={value as number}
                    onChange={(event) => {
                        const number = event.currentTarget.valueAsNumber;
                        if (!Number.isFinite(number)) return;
                        setSetting(
                            id,
                            Math.round(
                                Math.min(definition.max ?? Infinity, Math.max(definition.min ?? -Infinity, number)),
                            ) as SettingValue<typeof id>,
                        );
                    }}
                />
            ) : (
                <Select
                    items={options}
                    value={value as string}
                    onValueChange={(selected) => selected && setSetting(id, selected as SettingValue<typeof id>)}
                >
                    <SelectTrigger id={controlId} className="min-w-32">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            )}
        </Field>
    );
}

export function GeneralSettings({
    sources,
    section,
    query,
}: {
    sources: ReadonlyArray<ExecutableSource>;
    section: GeneralSection;
    query: string;
}) {
    const resetSettingGroup = useSettings((state) => state.resetSettingGroup);
    const sourceOptions = sources.map((source) => ({
        value: source.id,
        label: (
            <span className="flex items-center gap-1.5">
                {source.icon}
                {source.title}
            </span>
        ),
    }));

    return (
        <div className="flex flex-col gap-5">
            <FieldGroup>
                {settingsForSection(section)
                    .filter((id) => {
                        const definition = settingDefinitions[id];
                        return `${definition.label} ${definition.description || ''}`
                            .toLowerCase()
                            .includes(query.toLowerCase());
                    })
                    .map((id) => (
                        <SettingField key={id} id={id} sourceOptions={sourceOptions} />
                    ))}
            </FieldGroup>
            <div>
                <Button type="button" variant="outline" onClick={() => resetSettingGroup(settingsForSection(section))}>
                    Reset {section}
                </Button>
            </div>
        </div>
    );
}
