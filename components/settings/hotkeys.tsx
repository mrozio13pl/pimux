import { formatForDisplay, type Hotkey, useHotkeyRecorder } from '@tanstack/react-hotkeys';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useRegisteredHotkeys, useSettings } from '@/lib/settings';

interface HotkeyButtonProps {
    id: string;
    label: string;
    defaultHotkey?: Hotkey;
    query?: string;
}

export function HotkeyButton({ id, label, defaultHotkey, query = '' }: HotkeyButtonProps) {
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

    if (!`${label} ${defaultHotkey || ''} ${hotkey || ''}`.toLowerCase().includes(query.toLowerCase())) return null;

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

export function HotkeySettings({ query }: { query: string }) {
    const resetHotkeys = useSettings((state) => state.resetHotkeys);
    const hotkeys = useRegisteredHotkeys();

    return (
        <div className="flex flex-col gap-5">
            <FieldGroup className="gap-2">
                {hotkeys.map((hotkey) => (
                    <HotkeyButton key={hotkey.id} {...hotkey} query={query} />
                ))}
            </FieldGroup>
            <div>
                <Button type="button" variant="outline" onClick={resetHotkeys}>
                    Reset shortcuts
                </Button>
            </div>
        </div>
    );
}
