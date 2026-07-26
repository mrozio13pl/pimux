import { CommandIcon } from '@phosphor-icons/react';
import { formatForDisplay, type Hotkey, useHotkeyRecorder } from '@tanstack/react-hotkeys';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { useAppHotkey, useSettings } from '@/lib/settings';

interface HotkeyButtonProps {
    id: string;
    label: string;
    defaultHotkey?: Hotkey;
}

export function HotkeyButton({ id, label, defaultHotkey }: HotkeyButtonProps) {
    const hotkey = useSettings((state) => (Object.hasOwn(state.hotkeys, id) ? state.hotkeys[id] : defaultHotkey));
    const setHotkey = useSettings((state) => state.setHotkey);
    const recorder = useHotkeyRecorder({
        onRecord: (value) => {
            if (value) setHotkey(id, value);
        },
        onClear: () => setHotkey(id, null),
        ignoreInputs: false,
    });
    const controlId = `hotkey-${id}`;

    return (
        <Field orientation="horizontal">
            <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
            <Button
                id={controlId}
                type="button"
                variant="outline"
                className="min-w-28 font-mono"
                aria-pressed={recorder.isRecording}
                onClick={recorder.startRecording}
            >
                {recorder.isRecording ? 'Press keys…' : hotkey ? formatForDisplay(hotkey) : 'Unassigned'}
            </Button>
        </Field>
    );
}

export function HotkeysDialog() {
    const [open, setOpen] = useState(false);
    const resetHotkeys = useSettings((state) => state.resetHotkeys);
    useAppHotkey('pimux.open-hotkeys', 'Mod+/', () => setOpen(true));

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button variant="outline" size="icon-lg" aria-label="Keyboard shortcuts" />}>
                <CommandIcon data-icon="inline-start" weight="bold" />
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100svh-2rem)] sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Keyboard shortcuts</DialogTitle>
                    <DialogDescription>Click to record. Press Delete to unassign.</DialogDescription>
                </DialogHeader>
                <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
                    <FieldSet>
                        <FieldLegend variant="label">View actions</FieldLegend>
                        <FieldGroup className="gap-2">
                            <HotkeyButton id="view.new" label="New view" defaultHotkey="Mod+N" />
                            <HotkeyButton id="view.open" label="Add project" defaultHotkey="Control+Shift+N" />
                            <HotkeyButton id="view.delete" label="Delete view" defaultHotkey="Mod+D" />
                            <HotkeyButton id="view.change-title" label="Change title" defaultHotkey="F2" />
                        </FieldGroup>
                    </FieldSet>
                    <FieldSet>
                        <FieldLegend variant="label">View navigation</FieldLegend>
                        <FieldGroup className="gap-2">
                            {Array.from({ length: 9 }, (_, index) => (
                                <HotkeyButton
                                    key={index}
                                    id={`view.switch.${index + 1}`}
                                    label={index === 8 ? 'Last view' : `View ${index + 1}`}
                                    defaultHotkey={`Ctrl+${index + 1}` as Hotkey}
                                />
                            ))}
                        </FieldGroup>
                    </FieldSet>
                    <FieldSet>
                        <FieldLegend variant="label">Pimux management</FieldLegend>
                        <FieldGroup className="gap-2">
                            <HotkeyButton id="pimux.commands" label="Open command palette" defaultHotkey="Mod+K" />
                            <HotkeyButton id="pimux.open-settings" label="Open settings" defaultHotkey="Mod+I" />
                            <HotkeyButton id="pimux.open-sources" label="Open sources" defaultHotkey="Mod+S" />
                            <HotkeyButton id="pimux.open-hotkeys" label="Open hotkeys" defaultHotkey="Mod+/" />
                        </FieldGroup>
                    </FieldSet>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={resetHotkeys}>
                        Reset shortcuts
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
