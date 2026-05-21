import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { isHandler, type Handler, type HandlerContext, type RouterShape } from '../shared/rpc';

export type RpcRequest = {
    path: string[];
    input: unknown;
};

function resolveHandler(
    router: RouterShape,
    path: readonly string[],
): Handler<unknown, unknown> | null {
    let cursor: unknown = router;
    for (const segment of path) {
        if (cursor == null || typeof cursor !== 'object' || isHandler(cursor)) return null;
        cursor = (cursor as Record<string, unknown>)[segment];
    }
    return isHandler(cursor) ? cursor : null;
}

export function attachRpc(ipcMain: IpcMain, router: RouterShape): void {
    ipcMain.handle('rpc:call', async (event: IpcMainInvokeEvent, request: RpcRequest) => {
        const proc = resolveHandler(router, request.path);
        if (!proc) throw new Error(`No IPC handler at ${request.path.join('.')}`);

        const ctx: HandlerContext = {
            sender: event.sender,
        };

        return await proc.resolve(request.input, ctx);
    });
}
