import test from 'node:test';

const handlers = new Map();
let titleTool;

const { default: extension } = await import('../src-tauri/resources/pi-extension.ts');
const { parsePiSidebarUpdate } = await import('../lib/sources/pi/protocol.ts');

extension({
    registerTool(tool) {
        titleTool = tool;
    },
    on(event, handler) {
        handlers.set(event, handler);
    },
    appendEntry() {},
});

test('Pi extension emits valid sidebar updates', async () => {
    let output = '';
    const write = process.stdout.write;
    process.stdout.write = (value) => {
        output += value;
        return true;
    };
    try {
        handlers.get('session_start')(
            {},
            {
                model: { id: 'gpt-start' },
                sessionManager: { getSessionId: () => 'session-1234', getEntries: () => [] },
            },
        );
        handlers.get('model_select')({ model: { id: 'gpt-next' } });
        await titleTool.execute('valid', { title: 'Implement Pi Extension' });
        await titleTool.execute('invalid', { title: 'Invalid' }).then(
            () => {
                throw new Error('Invalid title accepted');
            },
            () => undefined,
        );
        handlers.get('before_agent_start')({ prompt: 'Test prompt', systemPrompt: 'Base prompt' });
        handlers.get('session_before_compact')();
        handlers.get('session_compact')({ willRetry: false });
    } finally {
        process.stdout.write = write;
    }

    const payloads = output
        .split('\u0007')
        .map((chunk) => chunk.split('pimux:')[1])
        .filter(Boolean);
    const updates = payloads.map((payload) => JSON.parse(Buffer.from(payload, 'base64url')));
    const startup = parsePiSidebarUpdate(`pimux:${payloads[0]}`);
    if (
        startup?.title !== undefined ||
        startup?.sessionId !== 'session-1234' ||
        startup?.model !== 'gpt-start' ||
        !updates.some((update) => update.model === 'gpt-next') ||
        !updates.some((update) => update.title === 'Implement Pi Extension') ||
        !updates.some((update) => update.userSubmitted === true) ||
        updates.at(-1)?.description !== 'Context compacted' ||
        updates.at(-1)?.status !== 'finished' ||
        parsePiSidebarUpdate(`pimux:${payloads.at(-1)}`)?.status !== 'finished'
    ) {
        throw new Error('Invalid Pi sidebar updates');
    }
});
