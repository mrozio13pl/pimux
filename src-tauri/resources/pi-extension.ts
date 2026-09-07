import { Type } from '@earendil-works/pi-ai';
import { Text } from '@earendil-works/pi-tui';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

type Status = 'idle' | 'error' | 'finished' | 'working' | 'attention';
type SidebarState = { title: string; description: string; status: Status; sessionId: string; model: string };

const PREFIX = 'pimux:';
const WAITING_DELAY = 60_000;
const TITLE_TOOL = 'set_view_title';
const TITLE_ENTRY = 'pimux-view-title';
const TITLE_INSTRUCTION =
    'Use set_view_title with a 2–5 word title on the first turn. Call it again only when the conversation topic materially changes.';

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
const clip = (value: string, fromEnd = false) => {
    const text = normalize(value);
    if (text.length <= 160) return text;
    return fromEnd ? `…${text.slice(-159)}` : `${text.slice(0, 159)}…`;
};

const contentText = (content: unknown) => {
    if (!Array.isArray(content)) return '';
    return content
        .filter(
            (part): part is { type: 'text'; text: string } => part?.type === 'text' && typeof part.text === 'string',
        )
        .map((part) => part.text)
        .join(' ');
};

const inputSummary = (input: Record<string, unknown>) => {
    for (const key of ['path', 'file', 'filePath', 'command', 'cmd', 'query', 'pattern']) {
        if (typeof input[key] === 'string') return clip(input[key]);
    }
    const value = Object.values(input).find((item) => typeof item === 'string');
    return typeof value === 'string' ? clip(value) : '';
};

const toolStart = (name: string, input: Record<string, unknown>) => {
    const detail = inputSummary(input);
    const verb =
        name === 'read'
            ? 'Reading'
            : name === 'edit' || name === 'write'
              ? 'Editing'
              : name === 'bash'
                ? 'Running'
                : `Using ${name}`;
    return clip(detail ? `${verb} ${detail}` : verb);
};

const toolEnd = (name: string, content: unknown, isError: boolean) => {
    const result = clip(contentText(content));
    if (isError) return clip(`${name} failed${result ? `: ${result}` : ''}`);
    const verb = name === 'read' ? 'Read' : name === 'edit' || name === 'write' ? 'Updated' : `${name} completed`;
    return clip(result ? `${verb} - ${result}` : verb);
};

export default function pimuxExtension(pi: ExtensionAPI) {
    const state: SidebarState = {
        title: 'New Pi Session',
        description: 'New Pi instance',
        status: 'idle',
        sessionId: '',
        model: '',
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let waiting: ReturnType<typeof setTimeout> | undefined;
    let pending: Partial<SidebarState> | undefined;

    const emit = (value: Partial<SidebarState> & { userSubmitted?: boolean }) => {
        const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
        process.stdout.write(`\x1b]0;${PREFIX}${payload}\x07`);
    };

    const update = (patch: Partial<SidebarState>, event?: { userSubmitted: true }) => {
        if (timer) clearTimeout(timer);
        if (waiting) clearTimeout(waiting);
        timer = undefined;
        waiting = undefined;
        pending = undefined;
        Object.assign(state, patch);
        emit({ ...patch, ...event, sessionId: state.sessionId });
    };

    const stream = (patch: Partial<SidebarState>) => {
        pending = patch;
        if (timer) return;
        timer = setTimeout(() => {
            timer = undefined;
            const patch = pending;
            if (patch) Object.assign(state, patch);
            pending = undefined;
            if (patch) emit({ ...patch, sessionId: state.sessionId });
        }, 150);
    };

    const waitForUser = () => {
        if (waiting) clearTimeout(waiting);
        waiting = setTimeout(() => {
            waiting = undefined;
            update({ status: 'attention' });
        }, WAITING_DELAY);
        waiting.unref?.();
    };

    pi.registerTool({
        name: TITLE_TOOL,
        label: 'Set view title',
        description: 'Set Pimux view title when conversation topic materially changes. Title must contain 2–5 words.',
        parameters: Type.Object({ title: Type.String() }),
        renderShell: 'self',
        async execute(_toolCallId, { title }) {
            const cleanTitle = normalize(title);
            const words = cleanTitle.split(' ').filter(Boolean);
            if (words.length < 2 || words.length > 5 || cleanTitle.length > 48) {
                throw new Error('Title must contain 2–5 words and be at most 48 characters.');
            }
            if (state.title !== cleanTitle) {
                pi.appendEntry(TITLE_ENTRY, { title: cleanTitle });
                update({ title: cleanTitle });
            }
            return { content: [{ type: 'text', text: 'Title updated.' }], details: undefined };
        },
        renderCall: () => new Text('', 0, 0),
        renderResult: (result, _options, theme) => {
            const text = contentText(result.content);
            return new Text(text === 'Title updated.' ? '' : theme.fg('error', text), 0, 0);
        },
    });

    pi.on('session_start', (_event, ctx) => {
        const sessionId = ctx.sessionManager.getSessionId();
        state.sessionId = sessionId;
        state.model = ctx.model?.id || '';
        const entry = ctx.sessionManager
            .getEntries()
            .toReversed()
            .find((candidate) => candidate.type === 'custom' && candidate.customType === TITLE_ENTRY);
        const title = entry?.type === 'custom' && (entry.data as { title?: unknown })?.title;
        if (typeof title === 'string') {
            state.title = title;
            emit({ title, sessionId, model: state.model });
        } else {
            emit({ sessionId, model: state.model });
        }
    });

    pi.on('model_select', (event) => update({ model: event.model.id }));

    pi.on('before_agent_start', (event) => {
        update({ description: clip(event.prompt), status: 'working' }, { userSubmitted: true });
        return { systemPrompt: `${event.systemPrompt}\n\n${TITLE_INSTRUCTION}` };
    });

    pi.on('message_update', (event) => {
        const streamEvent = event.assistantMessageEvent;
        if ('partial' in streamEvent && streamEvent.type.startsWith('thinking_')) {
            const thinking = streamEvent.partial.content
                .filter((part) => part.type === 'thinking')
                .map((part) => part.thinking)
                .join(' ');
            if (thinking) stream({ description: clip(thinking, true), status: 'working' });
        } else if ('partial' in streamEvent && streamEvent.type.startsWith('text_')) {
            const text = streamEvent.partial.content
                .filter((part) => part.type === 'text')
                .map((part) => part.text)
                .join(' ');
            if (text) stream({ description: clip(text, true), status: 'working' });
        }
    });

    pi.on('message_end', (event) => {
        if (event.message.role !== 'assistant') return;
        const message = event.message;
        if (message.stopReason === 'error') {
            update({ description: clip(message.errorMessage || 'Pi failed'), status: 'error' });
            return;
        }
        if (message.stopReason === 'aborted') {
            update({ description: 'Cancelled', status: 'idle' });
            return;
        }
        const text = contentText(message.content);
        if (text) update({ description: clip(text), status: message.stopReason === 'stop' ? 'finished' : 'working' });
    });

    pi.on('tool_call', (event) => {
        if (event.toolName !== TITLE_TOOL) {
            update({ description: toolStart(event.toolName, event.input), status: 'working' });
        }
    });

    pi.on('tool_result', (event) => {
        if (event.toolName !== TITLE_TOOL) {
            update({
                description: toolEnd(event.toolName, event.content, event.isError),
                status: event.isError ? 'error' : 'working',
            });
        }
    });

    pi.on('agent_start', () => update({ status: 'working' }));
    pi.on('agent_settled', () => {
        update({ status: state.status === 'error' ? 'error' : 'finished' });
        waitForUser();
    });
    pi.on('session_before_compact', () => update({ description: 'Compacting context', status: 'working' }));
    pi.on('session_compact', (event) => {
        if (!event.willRetry) update({ description: 'Context compacted', status: 'finished' });
    });
    pi.on('session_shutdown', () => {
        if (timer) clearTimeout(timer);
        if (waiting) clearTimeout(waiting);
    });
}
