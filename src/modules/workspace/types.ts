export type Workspace = {
    id: string;
    title: string;
    cwd: string;
    createdAt: number;
    updatedAt: number;
    pinned?: boolean;
};
