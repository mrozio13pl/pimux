import { type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { cn } from '@/lib/utils';
import { renderTab, type TabKind, type WorkspaceTab } from '@/modules/tabs';
import { TabStrip } from '@/modules/workbench/TabStrip';
import type { Workspace, TabLayoutNode } from '@/modules/workspace/types';
import type { PiStatusEvent } from '../../../shared/events';

export const DEFAULT_TAB_GROUP_ID = 'main';

export type TabSplitDirection = 'left' | 'right' | 'top' | 'bottom';

export function tabGroupId(tab: WorkspaceTab): string {
    return tab.groupId ?? DEFAULT_TAB_GROUP_ID;
}

export function collectLayoutGroupIds(node: TabLayoutNode | undefined): string[] {
    if (!node) return [];
    if (node.type === 'group') return [node.id];
    return node.children.flatMap(collectLayoutGroupIds);
}

export function ensureTabLayout(
    layout: TabLayoutNode | undefined,
    groupIds: string[],
): TabLayoutNode {
    const present = new Set(groupIds);
    const seen = new Set<string>();
    function prune(node: TabLayoutNode | undefined): TabLayoutNode | null {
        if (!node) return null;
        if (node.type === 'group') {
            if (!present.has(node.id) || seen.has(node.id)) return null;
            seen.add(node.id);
            return node;
        }
        const children = node.children
            .map(prune)
            .filter((child): child is TabLayoutNode => child != null);
        if (children.length === 0) return null;
        if (children.length === 1) return children[0];
        return { ...node, children };
    }

    const pruned = prune(layout);
    const used = new Set(collectLayoutGroupIds(pruned ?? undefined));
    const missing = groupIds
        .filter((id) => !used.has(id))
        .map((id) => ({ type: 'group' as const, id }));
    if (!pruned) return { type: 'split', orientation: 'horizontal', children: missing };
    if (missing.length === 0) return pruned;
    return { type: 'split', orientation: 'horizontal', children: [pruned, ...missing] };
}

function splitOrientation(direction: TabSplitDirection): 'horizontal' | 'vertical' {
    return direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
}

export function insertGroupInLayout(
    node: TabLayoutNode,
    targetGroupId: string,
    newGroupId: string,
    direction: TabSplitDirection,
): TabLayoutNode {
    const orientation = splitOrientation(direction);
    const before = direction === 'left' || direction === 'top';
    const newGroup: TabLayoutNode = { type: 'group', id: newGroupId };

    if (node.type === 'group') {
        if (node.id !== targetGroupId) return node;
        return {
            type: 'split',
            orientation,
            children: before ? [newGroup, node] : [node, newGroup],
        };
    }

    const targetIndex = node.children.findIndex((child) =>
        collectLayoutGroupIds(child).includes(targetGroupId),
    );
    if (targetIndex < 0) return node;
    if (node.orientation === orientation) {
        const children = [...node.children];
        children.splice(before ? targetIndex : targetIndex + 1, 0, newGroup);
        return { ...node, children };
    }
    return {
        ...node,
        children: node.children.map((child, index) =>
            index === targetIndex
                ? insertGroupInLayout(child, targetGroupId, newGroupId, direction)
                : child,
        ),
    };
}

export function TabLayoutRenderer({
    node,
    groups,
    workspace,
    activeTabId,
    activeGroupId,
    piStatuses,
    dragging,
    workspacesById,
    showHotkeyIndicators,
    onSelectTab,
    onCloseTab,
    onAddTab,
    onToggleTabPin,
    onActivateGroup,
    updateTab,
    path = 'root',
}: {
    node: TabLayoutNode;
    groups: Map<string, WorkspaceTab[]>;
    workspace: Workspace;
    activeTabId: string | null;
    activeGroupId: string;
    piStatuses: Record<string, PiStatusEvent>;
    dragging: boolean;
    workspacesById: Map<string, Workspace>;
    showHotkeyIndicators: boolean;
    onSelectTab(tabId: string): void;
    onCloseTab(tabId: string): void;
    onAddTab(workspaceId: string, kind: TabKind, groupId?: string): void;
    onToggleTabPin(tabId: string): void;
    onActivateGroup(groupId: string): void;
    updateTab(tab: WorkspaceTab): void;
    path?: string;
}): ReactNode {
    if (node.type === 'group') {
        const tabs = groups.get(node.id) ?? [];
        if (tabs.length === 0) return null;
        const groupActiveTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
        return (
            <div
                className={cn(
                    'flex h-full min-h-0 min-w-0 flex-col border-r border-b last:border-r-0 last:border-b-0',
                    activeGroupId === node.id && 'ring-1 ring-primary/40 ring-inset',
                )}
                onPointerEnter={() => onActivateGroup(node.id)}
                onFocusCapture={() => onActivateGroup(node.id)}
            >
                <TabStrip
                    tabs={tabs}
                    workspace={workspace}
                    activeTabId={groupActiveTab?.id ?? null}
                    piStatuses={piStatuses}
                    onSelectTab={onSelectTab}
                    onCloseTab={onCloseTab}
                    onAddTab={(kind) => onAddTab(workspace.id, kind, node.id)}
                    onToggleTabPin={onToggleTabPin}
                    showHotkeyIndicators={showHotkeyIndicators}
                />
                <section className="relative min-h-0 flex-1 overflow-hidden">
                    <SplitDropTargets groupId={node.id} dragging={dragging} />
                    {tabs.map((tab) => {
                        const tabWorkspace = workspacesById.get(tab.workspaceId);
                        if (!tabWorkspace) return null;
                        const active = tab.id === groupActiveTab?.id;
                        return (
                            <div
                                key={tab.id}
                                aria-hidden={!active}
                                className={
                                    active
                                        ? 'absolute inset-0'
                                        : 'pointer-events-none absolute inset-0 opacity-0'
                                }
                            >
                                {renderTab(tab, { workspace: tabWorkspace, updateTab })}
                            </div>
                        );
                    })}
                </section>
            </div>
        );
    }

    return (
        <ResizablePanelGroup orientation={node.orientation} className="min-h-0 flex-1">
            {node.children.map((child, index) => {
                const childPath = `${path}-${index}`;
                return (
                    <FragmentWithHandle key={childPath} showHandle={index > 0}>
                        <ResizablePanel id={`layout-${childPath}`}>
                            <TabLayoutRenderer
                                node={child}
                                groups={groups}
                                workspace={workspace}
                                activeTabId={activeTabId}
                                activeGroupId={activeGroupId}
                                piStatuses={piStatuses}
                                dragging={dragging}
                                workspacesById={workspacesById}
                                showHotkeyIndicators={showHotkeyIndicators}
                                onSelectTab={onSelectTab}
                                onCloseTab={onCloseTab}
                                onAddTab={onAddTab}
                                onToggleTabPin={onToggleTabPin}
                                onActivateGroup={onActivateGroup}
                                updateTab={updateTab}
                                path={childPath}
                            />
                        </ResizablePanel>
                    </FragmentWithHandle>
                );
            })}
        </ResizablePanelGroup>
    );
}

function FragmentWithHandle({
    children,
    showHandle,
}: {
    children: ReactNode;
    showHandle: boolean;
}) {
    return (
        <>
            {showHandle ? <ResizableHandle /> : null}
            {children}
        </>
    );
}

function SplitDropTargets({ groupId, dragging }: { groupId: string; dragging: boolean }) {
    return (
        <div
            className={cn(
                'pointer-events-none absolute inset-0 z-20 transition-opacity',
                dragging ? 'opacity-100' : 'opacity-0',
            )}
        >
            <SplitDropTarget id={`merge:${groupId}`} kind="center" enabled={dragging} />
            <SplitDropTarget id={`split:${groupId}:left`} kind="left" enabled={dragging} />
            <SplitDropTarget id={`split:${groupId}:right`} kind="right" enabled={dragging} />
            <SplitDropTarget id={`split:${groupId}:top`} kind="top" enabled={dragging} />
            <SplitDropTarget id={`split:${groupId}:bottom`} kind="bottom" enabled={dragging} />
        </div>
    );
}

function SplitDropTarget({
    id,
    kind,
    enabled,
}: {
    id: string;
    kind: TabSplitDirection | 'center';
    enabled: boolean;
}) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={cn(
                'absolute border-primary/80 transition-colors',
                enabled ? 'pointer-events-auto' : 'pointer-events-none',
                kind === 'left' && 'inset-y-0 left-0 w-1/3 border-l-2',
                kind === 'right' && 'inset-y-0 right-0 w-1/3 border-r-2',
                kind === 'top' && 'top-0 right-1/3 left-1/3 h-1/3 border-t-2',
                kind === 'bottom' && 'right-1/3 bottom-0 left-1/3 h-1/3 border-b-2',
                kind === 'center' && 'inset-[33%] rounded-md border border-dashed opacity-0',
                isOver &&
                    kind !== 'center' &&
                    'bg-primary/15 shadow-[inset_0_0_0_1px_var(--primary)]',
                isOver && kind === 'center' && 'bg-primary/10 opacity-100',
            )}
        />
    );
}
