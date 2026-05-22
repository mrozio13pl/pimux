export type TabLayoutNode =
    | { type: 'group'; id: string }
    | { type: 'split'; orientation: 'horizontal' | 'vertical'; children: TabLayoutNode[] };

export type Workspace = {
    id: string;
    title: string;
    cwd: string;
    createdAt: number;
    updatedAt: number;
    pinned?: boolean;
    tabLayout?: TabLayoutNode;
};
