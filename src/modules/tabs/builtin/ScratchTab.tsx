import { useEffect, useRef } from 'react';
import type { ScratchTab as ScratchTabModel, TabRenderProps } from '../types';

export function ScratchTab({
    tab,
    active,
    focusToken,
    updateTab,
}: TabRenderProps<ScratchTabModel>) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (!active) return;
        const focus = () => textareaRef.current?.focus();
        requestAnimationFrame(() => {
            focus();
            requestAnimationFrame(focus);
        });
        window.setTimeout(focus, 75);
    }, [active, focusToken]);

    return (
        <textarea
            ref={textareaRef}
            spellCheck={false}
            className="h-full w-full resize-none bg-sidebar p-6 font-mono text-sm leading-relaxed caret-primary outline-none placeholder:text-muted-foreground"
            value={tab.text}
            onChange={(event) => updateTab({ ...tab, text: event.target.value })}
        />
    );
}
