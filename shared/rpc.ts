export type MaybePromise<T> = T | Promise<T>;

export type IpcSender = {
    send(channel: string, payload: unknown): void;
    isDestroyed(): boolean;
};

export type HandlerContext = {
    sender: IpcSender;
};

export type Handler<I, O> = {
    __kind: 'handler';
    resolve(input: I, ctx: HandlerContext): MaybePromise<O>;
};

export type RouterShape = {
    [key: string]: Handler<unknown, unknown> | RouterShape;
};

export function defineRouter<R extends RouterShape>(router: R): R {
    return router;
}

export function handler<O>(resolve: (ctx: HandlerContext) => MaybePromise<O>): Handler<void, O>;
export function handler<I, O>(
    resolve: (input: I, ctx: HandlerContext) => MaybePromise<O>,
): Handler<I, O>;
export function handler(resolve: (...args: never[]) => unknown): Handler<unknown, unknown> {
    return {
        __kind: 'handler',
        resolve(input, ctx) {
            return resolve.length === 0 || (resolve.length === 1 && input === undefined)
                ? resolve(ctx as never)
                : resolve(input as never, ctx as never);
        },
    };
}

export function isHandler(value: unknown): value is Handler<unknown, unknown> {
    return (
        value != null &&
        typeof value === 'object' &&
        (value as { __kind?: unknown }).__kind === 'handler'
    );
}

export type Client<R> = {
    [K in keyof R]: R[K] extends Handler<infer I, infer O>
        ? void extends I
            ? () => Promise<O>
            : (input: I) => Promise<O>
        : R[K] extends RouterShape
          ? Client<R[K]>
          : never;
};

export type Invoke = (path: readonly string[], input: unknown) => Promise<unknown>;

function buildClient(invoke: Invoke, prefix: readonly string[]): unknown {
    return new Proxy(() => undefined, {
        get(_target, key) {
            if (typeof key !== 'string') return undefined;
            return buildClient(invoke, [...prefix, key]);
        },
        apply(_target, _thisArg, args) {
            return invoke(prefix, args[0]);
        },
    });
}

export function createClient<R extends RouterShape>(invoke: Invoke): Client<R> {
    return buildClient(invoke, []) as Client<R>;
}

export type EventBridge<E extends Record<string, unknown>> = {
    on<K extends keyof E & string>(channel: K, cb: (event: E[K]) => void): () => void;
};
