import { GearIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ExecutableSource, SourceId } from '@/lib/sources';
import { settingDefinitions, useAppHotkey, useSettings, type SettingId, type SettingValue } from '@/lib/settings';

type SourceOption = { value: SourceId; label: ReactNode };
const settingIds = Object.keys(settingDefinitions) as SettingId[];

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
            {!('options' in definition) ? (
                <Switch
                    id={controlId}
                    checked={value as boolean}
                    onCheckedChange={(checked) => setSetting(id, checked as SettingValue<typeof id>)}
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

interface GeneralSettingsDialogProps {
    sources: ReadonlyArray<ExecutableSource>;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function GeneralSettingsDialog({ sources, open, onOpenChange }: GeneralSettingsDialogProps) {
    const resetSettings = useSettings((state) => state.resetSettings);
    useAppHotkey('pimux.open-settings', 'Mod+I', () => onOpenChange(true));
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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger render={<Button variant="outline" size="icon-lg" aria-label="General settings" />}>
                <GearIcon data-icon="inline-start" weight="bold" />
            </DialogTrigger>
            <DialogContent className="min-w-2xl">
                <DialogHeader>
                    <DialogTitle>General settings</DialogTitle>
                    <DialogDescription>Changes save automatically.</DialogDescription>
                </DialogHeader>
                <FieldGroup>
                    {settingIds.map((id) => (
                        <SettingField key={id} id={id} sourceOptions={sourceOptions} />
                    ))}
                </FieldGroup>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={resetSettings}>
                        Reset settings
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
