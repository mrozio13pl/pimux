import type { WorkspaceTab } from '@/modules/tabs/types';
import type { Workspace } from './types';

export const STORAGE_KEY = 'pimux:v1';

export type StoredState = {
    workspaces: Workspace[];
    activeWorkspaceId: string | null;
    tabs: WorkspaceTab[];
    activeTabId: string | null;
    collapsedGroups: string[];
};

export function emptyState(): StoredState {
    return {
        workspaces: [],
        activeWorkspaceId: null,
        tabs: [],
        activeTabId: null,
        collapsedGroups: [],
    };
}

export function loadState(): StoredState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return normalizeState(JSON.parse(raw));
    } catch {
        // ignore corrupt state
    }
    return emptyState();
}

function normalizeState(value: unknown): StoredState {
    if (!isRecord(value)) return emptyState();

    const rawWorkspaces = Array.isArray(value.workspaces)
        ? value.workspaces
        : Array.isArray(value.chats)
          ? value.chats
          : [];
    const workspaces = rawWorkspaces.filter(isWorkspace);
    const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
    const tabs = Array.isArray(value.tabs)
        ? value.tabs
              .map(migrateTab)
              .filter(
                  (tab): tab is WorkspaceTab => tab != null && workspaceIds.has(tab.workspaceId),
              )
        : [];

    const rawActiveWorkspaceId =
        typeof value.activeWorkspaceId === 'string'
            ? value.activeWorkspaceId
            : typeof value.activeChatId === 'string'
              ? value.activeChatId
              : null;
    const activeWorkspaceId =
        rawActiveWorkspaceId && workspaceIds.has(rawActiveWorkspaceId)
            ? rawActiveWorkspaceId
            : (workspaces[0]?.id ?? null);
    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
    const workspaceActiveTabId = activeWorkspace?.activeTabId;
    const activeTabId =
        typeof value.activeTabId === 'string' &&
        tabs.some((tab) => tab.id === value.activeTabId && tab.workspaceId === activeWorkspaceId)
            ? value.activeTabId
            : workspaceActiveTabId &&
                tabs.some(
                    (tab) =>
                        tab.id === workspaceActiveTabId && tab.workspaceId === activeWorkspaceId,
                )
              ? workspaceActiveTabId
              : (tabs.find((tab) => tab.workspaceId === activeWorkspaceId)?.id ?? null);

    const collapsedGroups = Array.isArray(value.collapsedGroups)
        ? value.collapsedGroups.filter((key): key is string => typeof key === 'string')
        : [];

    return { workspaces, tabs, activeWorkspaceId, activeTabId, collapsedGroups };
}

function migrateTab(value: unknown): WorkspaceTab | null {
    if (!isRecord(value) || !hasBaseTabFields(value)) return null;
    const workspaceId = getWorkspaceId(value);
    if (!workspaceId) return null;

    if (value.kind === 'terminal') {
        return {
            id: value.id,
            kind: value.kind,
            title: value.title,
            workspaceId,
            updatedAt: getUpdatedAt(value),
            pinned: value.pinned === true,
            groupId: typeof value.groupId === 'string' ? value.groupId : undefined,
            scrollback: typeof value.scrollback === 'string' ? value.scrollback : undefined,
        };
    }

    if (value.kind === 'pi') {
        return {
            id: value.id,
            kind: value.kind,
            title: value.title,
            workspaceId,
            updatedAt: getUpdatedAt(value),
            pinned: value.pinned === true,
            groupId: typeof value.groupId === 'string' ? value.groupId : undefined,
            scrollback: typeof value.scrollback === 'string' ? value.scrollback : undefined,
            sessionFile: typeof value.sessionFile === 'string' ? value.sessionFile : undefined,
        };
    }

    // v0.1 persisted scratch tabs as `editor`. Keep user data and migrate forward.
    if (value.kind === 'scratch' || value.kind === 'editor') {
        return {
            id: value.id,
            kind: 'scratch',
            title: value.title === 'Editor' ? 'Scratch' : value.title,
            workspaceId,
            updatedAt: getUpdatedAt(value),
            pinned: value.pinned === true,
            groupId: typeof value.groupId === 'string' ? value.groupId : undefined,
            text: typeof value.text === 'string' ? value.text : '',
        };
    }

    if (value.kind === 'browser') {
        return {
            id: value.id,
            kind: 'browser',
            title: value.title,
            workspaceId,
            updatedAt: getUpdatedAt(value),
            pinned: value.pinned === true,
            groupId: typeof value.groupId === 'string' ? value.groupId : undefined,
            url: typeof value.url === 'string' ? value.url : 'https://example.com',
            favicon: typeof value.favicon === 'string' ? value.favicon : undefined,
        };
    }

    return null;
}

function isWorkspace(value: unknown): value is Workspace {
    return (
        isRecord(value) &&
        typeof value.id === 'string' &&
        typeof value.title === 'string' &&
        typeof value.cwd === 'string' &&
        typeof value.createdAt === 'number' &&
        typeof value.updatedAt === 'number'
    );
}

function hasBaseTabFields(value: Record<string, unknown>): value is Record<string, unknown> & {
    id: string;
    kind: string;
    title: string;
    workspaceId?: string;
    chatId?: string;
} {
    return (
        typeof value.id === 'string' &&
        typeof value.kind === 'string' &&
        typeof value.title === 'string' &&
        getWorkspaceId(value) != null
    );
}

function getWorkspaceId(value: Record<string, unknown>): string | undefined {
    return typeof value.workspaceId === 'string'
        ? value.workspaceId
        : typeof value.chatId === 'string'
          ? value.chatId
          : undefined;
}

function getUpdatedAt(value: Record<string, unknown>): number {
    return typeof value.updatedAt === 'number' ? value.updatedAt : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object';
}
