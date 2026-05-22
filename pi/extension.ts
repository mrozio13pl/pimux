import dgram from 'node:dgram';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

const port = Number(process.env.PIMUX_STATUS_PORT || 0);
const tabId = process.env.PIMUX_PI_TAB_ID || '';
const socket = port > 0 && tabId ? dgram.createSocket('udp4') : null;

const TITLE_INSTRUCTION =
    'Pimux: At the start of this session, call pimux_set_title with a 2-5 word title. Later, call it only if the topic changes drastically. Do not call it every turn.';

type PiStatus = 'idle' | 'thinking' | 'answering' | 'running-tool' | 'done' | 'exited' | 'error';

type SetTitleParams = {
    title?: string;
};

function sendStatus(status: PiStatus, detail?: string): void {
    send({ status, detail });
}

function sendTitle(title: string): void {
    send({ title });
}

function sendSessionFile(sessionFile: string | undefined): void {
    if (sessionFile) send({ sessionFile });
}

function sendTheme(ctx: ExtensionContext): void {
    send({
        theme: {
            name: ctx.ui.theme.name,
            accentAnsi: ctx.ui.theme.getFgAnsi('accent'),
        },
    });
}

function send(payload: Record<string, unknown>): void {
    if (!socket) return;
    const message = Buffer.from(JSON.stringify({ tabId, ...payload, timestamp: Date.now() }));
    socket.send(message, port, '127.0.0.1');
}

function normalizeTitle(title: string): string {
    return title.replace(/\s+/g, ' ').trim().slice(0, 48);
}

export default function pimuxExtension(pi: ExtensionAPI): void {
    sendStatus('idle', 'started');

    pi.registerTool({
        name: 'pimux_set_title',
        label: 'Set Pimux Title',
        description: 'Set the Pimux tab title for this pi session.',
        promptSnippet: 'Set a 2-5 word Pimux tab title when the session topic changes drastically.',
        promptGuidelines: [
            'Use pimux_set_title only occasionally, when the session topic changes drastically; title must be 2-5 words.',
        ],
        parameters: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Extremely brief session title, 2-5 words.',
                },
            },
            required: ['title'],
            additionalProperties: false,
        },
        async execute(_toolCallId, params: SetTitleParams) {
            const title = normalizeTitle(params.title ?? '');
            if (!title) {
                return {
                    content: [{ type: 'text' as const, text: 'No title set.' }],
                    details: { ok: false, title: undefined as string | undefined },
                };
            }
            sendTitle(title);
            pi.setSessionName(title);
            return {
                content: [{ type: 'text' as const, text: `Title set: ${title}` }],
                details: { ok: true, title: title as string | undefined },
            };
        },
    });

    pi.on('session_start', (_event, ctx) => {
        sendStatus('idle', 'session');
        sendSessionFile(ctx.sessionManager.getSessionFile());
        sendTheme(ctx);
    });
    let hasRequestedInitialTitle = false;

    pi.on('before_agent_start', (event, ctx) => {
        sendTheme(ctx);
        sendStatus('thinking');
        const titleInstruction = hasRequestedInitialTitle
            ? TITLE_INSTRUCTION
            : `${TITLE_INSTRUCTION} This is the first user turn, so set the title during this turn.`;
        hasRequestedInitialTitle = true;
        return { systemPrompt: `${event.systemPrompt}\n\n${titleInstruction}` };
    });
    pi.on('agent_start', () => sendStatus('thinking'));
    pi.on('turn_start', () => sendStatus('thinking'));
    pi.on('before_provider_request', () => sendStatus('thinking', 'provider'));
    pi.on('message_update', () => sendStatus('answering'));
    pi.on('tool_execution_start', (event) => sendStatus('running-tool', event?.toolName));
    pi.on('tool_execution_update', (event) => sendStatus('running-tool', event?.toolName));
    pi.on('tool_execution_end', () => sendStatus('thinking'));
    pi.on('agent_end', () => sendStatus('done'));
    pi.on('session_shutdown', () => {
        sendStatus('exited');
        socket?.close();
    });
}
