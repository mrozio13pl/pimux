import {
    ArrowLeftIcon,
    FolderOpenIcon,
    ImageIcon,
    PlusIcon,
    TerminalWindowIcon,
    TrashIcon,
} from '@phosphor-icons/react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { lazy, Suspense, useState, type SubmitEvent } from 'react';
import { HotkeyButton } from '@/components/settings/hotkeys';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { AvailableSource, CustomSourceId } from '@/lib/sources';
import type { CustomSourceRecord } from '@/lib/sources/custom';
import { useAppHotkey, type SourceOverride } from '@/lib/settings';

const LobeHubIconDialog = lazy(() =>
    import('@/components/settings/lobehub-icon-dialog').then((module) => ({ default: module.LobeHubIconDialog })),
);

interface SourcesDialogProps {
    sources: ReadonlyArray<AvailableSource>;
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
}

export function SourcesDialog({
    sources,
    customSources,
    addSource,
    updateSource,
    sourceOverrides,
    updateSourceOverride,
    removeSource,
}: SourcesDialogProps) {
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<{ id: string; custom?: CustomSourceRecord }>();
    const [title, setTitle] = useState('');
    const [executable, setExecutable] = useState('');
    const [icon, setIcon] = useState('');
    const [iconMonochrome, setIconMonochrome] = useState(false);
    const [error, setError] = useState<string>();
    const [saving, setSaving] = useState(false);
    useAppHotkey('pimux.open-sources', 'Mod+S', () => setOpen(true));

    async function chooseExecutable() {
        const path = await openDialog({ directory: false, multiple: false, title: 'Choose executable' });
        if (typeof path === 'string') setExecutable(path);
    }

    async function chooseIcon() {
        const path = await openDialog({
            directory: false,
            multiple: false,
            title: 'Choose icon',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        });
        if (typeof path === 'string') {
            setIcon(path);
            setIconMonochrome(false);
        }
    }

    function editSource(source: AvailableSource, customSource?: CustomSourceRecord) {
        const override = sourceOverrides[source.id];
        setEditing({ id: source.id, custom: customSource });
        setTitle(customSource?.title || source.title);
        setExecutable(customSource?.executable || '');
        setIcon(customSource?.icon || override?.icon || '');
        setIconMonochrome(customSource?.iconMonochrome || override?.iconMonochrome || false);
        setError(undefined);
        setCreating(true);
    }

    async function submit(event: SubmitEvent) {
        event.preventDefault();
        if (!title.trim() || ((!editing || editing.custom) && !executable.trim())) return;
        setSaving(true);
        setError(undefined);
        try {
            if (editing?.custom) {
                await updateSource(
                    editing.custom.id,
                    title.trim(),
                    executable.trim(),
                    icon || undefined,
                    iconMonochrome,
                );
            } else if (editing) {
                updateSourceOverride(editing.id, {
                    title: title.trim(),
                    icon: icon || undefined,
                    iconMonochrome,
                });
            } else {
                await addSource(title.trim(), executable.trim(), icon || undefined, iconMonochrome);
            }
            setEditing(undefined);
            setTitle('');
            setExecutable('');
            setIcon('');
            setIconMonochrome(false);
            setCreating(false);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (!nextOpen) {
                    setCreating(false);
                    setEditing(undefined);
                }
            }}
        >
            <DialogTrigger render={<Button variant="outline" size="icon-lg" aria-label="Sources" />}>
                <TerminalWindowIcon data-icon="inline-start" weight="bold" />
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100svh-2rem)] sm:max-w-lg">
                {creating ? (
                    <form className="flex min-h-0 flex-col gap-4" onSubmit={(event) => void submit(event)}>
                        <DialogHeader>
                            <DialogTitle>{editing ? 'Edit source' : 'Create source'}</DialogTitle>
                            <DialogDescription>
                                {editing
                                    ? 'Update this terminal source.'
                                    : 'Add a trusted local executable as a terminal source.'}
                            </DialogDescription>
                        </DialogHeader>
                        <FieldGroup className="overflow-y-auto pr-1">
                            <Field>
                                <FieldLabel htmlFor="source-title">Name</FieldLabel>
                                <Input
                                    id="source-title"
                                    value={title}
                                    maxLength={64}
                                    onChange={(event) => setTitle(event.target.value)}
                                    placeholder="Random Agentic CLI"
                                    autoFocus
                                />
                            </Field>
                            {(!editing || editing.custom) && (
                                <Field>
                                    <FieldLabel htmlFor="source-executable">Command or executable</FieldLabel>
                                    <ButtonGroup className="w-full">
                                        <Input
                                            id="source-executable"
                                            value={executable}
                                            onChange={(event) => setExecutable(event.target.value)}
                                            placeholder="some_cli.sh"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            aria-label="Choose executable"
                                            onClick={() =>
                                                void chooseExecutable().catch((reason) => setError(String(reason)))
                                            }
                                        >
                                            <FolderOpenIcon />
                                        </Button>
                                    </ButtonGroup>
                                </Field>
                            )}
                            <Field>
                                <FieldLabel htmlFor="source-icon">Icon</FieldLabel>
                                <ButtonGroup className="w-full">
                                    <Input
                                        id="source-icon"
                                        value={icon}
                                        onChange={(event) => {
                                            setIcon(event.target.value);
                                            setIconMonochrome(false);
                                        }}
                                        placeholder="Optional image path"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        aria-label="Choose icon"
                                        onClick={() => void chooseIcon().catch((reason) => setError(String(reason)))}
                                    >
                                        <ImageIcon />
                                    </Button>
                                    <Suspense
                                        fallback={
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                aria-label="Loading LobeHub icons"
                                                disabled
                                            >
                                                <ImageIcon />
                                            </Button>
                                        }
                                    >
                                        <LobeHubIconDialog
                                            onSelect={(path, monochrome) => {
                                                setIcon(path);
                                                setIconMonochrome(monochrome);
                                            }}
                                        />
                                    </Suspense>
                                </ButtonGroup>
                            </Field>
                            {editing && (
                                <>
                                    <HotkeyButton id={`source.open:${editing.id}`} label="Open with current path" />
                                    <HotkeyButton
                                        id={`source.open-folder:${editing.id}`}
                                        label="Choose folder and open"
                                    />
                                </>
                            )}
                        </FieldGroup>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setCreating(false);
                                    setEditing(undefined);
                                }}
                            >
                                <ArrowLeftIcon data-icon="inline-start" />
                                Back
                            </Button>
                            <Button
                                type="submit"
                                disabled={
                                    saving || !title.trim() || ((!editing || editing.custom) && !executable.trim())
                                }
                            >
                                {!editing && <PlusIcon data-icon="inline-start" />}
                                {editing ? 'Save changes' : 'Add source'}
                            </Button>
                        </DialogFooter>
                    </form>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Sources</DialogTitle>
                            <DialogDescription>
                                Manage available terminal sources and their shortcuts.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
                            {sources.map((source) => {
                                const customSource = customSources.find((candidate) => candidate.id === source.id);
                                return (
                                    <div
                                        key={source.id}
                                        role="button"
                                        tabIndex={0}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted"
                                        onClick={() => editSource(source, customSource)}
                                        onKeyDown={(event) => {
                                            if (
                                                event.target === event.currentTarget &&
                                                (event.key === 'Enter' || event.key === ' ')
                                            ) {
                                                event.preventDefault();
                                                editSource(source, customSource);
                                            }
                                        }}
                                    >
                                        <div className="flex size-8 shrink-0 items-center justify-center">
                                            {source.icon}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium">{source.title}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {customSource?.executable || 'Built-in'}
                                            </p>
                                        </div>
                                        {customSource && (
                                            <Button
                                                type="button"
                                                size="icon-sm"
                                                variant="ghost"
                                                aria-label={`Remove ${source.title}`}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    void removeSource(customSource.id).catch((reason) =>
                                                        setError(String(reason)),
                                                    );
                                                }}
                                            >
                                                <TrashIcon />
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <DialogFooter>
                            <Button
                                type="button"
                                onClick={() => {
                                    setEditing(undefined);
                                    setTitle('');
                                    setExecutable('');
                                    setIcon('');
                                    setIconMonochrome(false);
                                    setError(undefined);
                                    setCreating(true);
                                }}
                            >
                                <PlusIcon data-icon="inline-start" />
                                Create source
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
