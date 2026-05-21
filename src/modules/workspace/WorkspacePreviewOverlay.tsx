import { Fragment, useEffect, useState } from 'react';
import { PiIcon } from '@phosphor-icons/react';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import type { WorkspaceTab } from '@/modules/tabs';
import type { Workspace } from './types';
import { workspaceHotkeyLabel } from './hotkeys';
import { ipc } from '@/ipc';

type WorkspacePreviewOverlayProps = {
    workspaces: Workspace[];
    tabs: WorkspaceTab[];
    activeWorkspaceId: string | null;
    workspaceOrderIds: string[];
    selectedIndex: number;
    bindings: { key: string; description?: string }[];
    onPreviewIndexChange(index: number): void;
    onSelectWorkspace(workspaceId: string): void;
};

export function WorkspacePreviewOverlay({
    workspaces,
    tabs,
    activeWorkspaceId,
    workspaceOrderIds,
    selectedIndex,
    bindings,
    onPreviewIndexChange,
    onSelectWorkspace,
}: WorkspacePreviewOverlayProps) {
    const workspacesById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
    const orderedWorkspaces = (
        workspaceOrderIds.length ? workspaceOrderIds : workspaces.map((workspace) => workspace.id)
    )
        .map((id) => workspacesById.get(id))
        .filter((workspace): workspace is Workspace => Boolean(workspace))
        .slice(0, 10);
    const [workspaceIcons, setWorkspaceIcons] = useState<Record<string, string | null>>({});
    const tabsByWorkspace = new Map<string, WorkspaceTab[]>();
    for (const tab of tabs) {
        const workspaceTabs = tabsByWorkspace.get(tab.workspaceId) ?? [];
        workspaceTabs.push(tab);
        tabsByWorkspace.set(tab.workspaceId, workspaceTabs);
    }

    useEffect(() => {
        let cancelled = false;
        const missing = orderedWorkspaces.filter((workspace) => !(workspace.id in workspaceIcons));
        if (missing.length === 0) return;

        void Promise.all(
            missing.map(async (workspace) => {
                try {
                    const result = await ipc.system.workspaceIcon({ cwd: workspace.cwd });
                    return [workspace.id, result.icon] as const;
                } catch {
                    return [workspace.id, null] as const;
                }
            }),
        ).then((entries) => {
            if (cancelled) return;
            setWorkspaceIcons((current) => ({ ...current, ...Object.fromEntries(entries) }));
        });

        return () => {
            cancelled = true;
        };
    }, [orderedWorkspaces, workspaceIcons]);

    const actionBindings = bindings.filter((binding) => !/^\[Control\]\+\d$/.test(binding.key));

    return (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-background/15 p-6 pt-8">
            <div className="w-full max-w-7xl rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-2xl">
                <div className="grid grid-cols-5 gap-1">
                    {Array.from({ length: 10 }, (_, index) => {
                        const workspace = orderedWorkspaces[index];
                        const active = workspace?.id === activeWorkspaceId;
                        const selected = index === selectedIndex;
                        const workspaceIcon = workspace ? workspaceIcons[workspace.id] : null;
                        return (
                            <button
                                key={workspace?.id ?? index}
                                type="button"
                                disabled={!workspace}
                                onClick={() => workspace && onSelectWorkspace(workspace.id)}
                                onMouseEnter={() => onPreviewIndexChange(index)}
                                className={cn(
                                    'group relative h-36 overflow-hidden rounded-xl border border-border bg-background p-2.5 text-left shadow-lg transition',
                                    workspace
                                        ? 'hover:border-primary/70 hover:bg-accent/30'
                                        : 'cursor-default opacity-35',
                                    active && 'border-primary/60',
                                    selected && 'ring-2 ring-primary/50',
                                )}
                            >
                                <div className="absolute top-2.5 right-2.5 flex size-8 items-center justify-center rounded-lg bg-muted text-base font-semibold text-muted-foreground">
                                    {workspaceHotkeyLabel(index)}
                                </div>
                                {workspace ? (
                                    <>
                                        <div className="relative max-w-[80%] truncate text-sm font-semibold">
                                            {workspace.title}
                                        </div>
                                        <div className="relative mt-1 max-w-[80%] truncate text-[11px] text-muted-foreground">
                                            {workspace.cwd}
                                        </div>
                                        <div className="pointer-events-none inset-0 flex items-center justify-center">
                                            {workspaceIcon ? (
                                                <img
                                                    src={workspaceIcon}
                                                    alt=""
                                                    className="z-40 size-12 rounded-lg object-contain"
                                                    draggable={false}
                                                />
                                            ) : (
                                                <PiIcon className="size-12 text-foreground/70" />
                                            )}
                                        </div>
                                        <div className="relative mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                                            <span>
                                                {tabsByWorkspace.get(workspace.id)?.length ?? 0}{' '}
                                                tabs
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex h-full items-center justify-center text-3xl font-semibold text-muted-foreground">
                                        {workspaceHotkeyLabel(index)}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="fixed bottom-12">
                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-popover px-2 py-1.5 md:grid-cols-3 shadow-2xl">
                    {actionBindings.map((binding) => (
                        <div key={binding.key} className="flex min-w-0 items-center gap-1.5">
                            <KbdGroup>
                                {binding.key.split('+').map((key, i) => (
                                    <Fragment key={i}>
                                        {i > 0 && <span className="text-muted-foreground">+</span>}
                                        <Kbd>{key}</Kbd>
                                    </Fragment>
                                ))}
                            </KbdGroup>
                            <span className="min-w-0 truncate text-lg text-muted-foreground">
                                {binding.description}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
