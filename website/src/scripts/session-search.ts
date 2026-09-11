import { matches, segments, SESSIONS } from '@/lib/sessions';

function paint(el: Element, text: string, query: string) {
    el.textContent = '';
    for (const part of segments(text, query)) {
        if (!part.hit) {
            el.append(part.text);
            continue;
        }
        const mark = document.createElement('mark');
        mark.textContent = part.text;
        el.append(mark);
    }
}

export function mountSessionSearch() {
    const input = document.querySelector<HTMLInputElement>('[data-search]');
    const empty = document.querySelector<HTMLElement>('[data-empty]');
    const heading = document.querySelector<HTMLElement>('[data-group-heading]');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-row]')];
    if (!input || !empty || rows.length !== SESSIONS.length) return;

    const apply = () => {
        const query = input.value;
        let shown = 0;

        rows.forEach((row, i) => {
            const session = SESSIONS[i];
            const hit = matches(session, query);
            row.hidden = !hit;
            delete row.dataset.first;
            if (hit) {
                if (shown === 0) row.dataset.first = '';
                shown++;
            }

            for (const field of row.querySelectorAll<HTMLElement>('[data-text]')) {
                paint(field, field.dataset.text ?? '', query);
            }
        });

        empty.hidden = shown > 0;

        if (heading) heading.hidden = shown === 0;
    };

    input.addEventListener('input', apply);

    if (!/Mac/i.test(navigator.userAgent)) {
        for (const label of document.querySelectorAll<HTMLElement>('[data-mod-label]')) {
            label.textContent = 'Ctrl K';
        }
    }
}
