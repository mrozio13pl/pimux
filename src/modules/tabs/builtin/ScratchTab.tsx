import type { ScratchTab as ScratchTabModel, TabRenderProps } from '../types';

export function ScratchTab({ tab, updateTab }: TabRenderProps<ScratchTabModel>) {
    return (
        <textarea
            spellCheck={false}
            className="h-full w-full resize-none bg-sidebar p-6 font-mono text-sm leading-relaxed caret-primary outline-none placeholder:text-muted-foreground"
            value={tab.text}
            onChange={(event) => updateTab({ ...tab, text: event.target.value })}
        />
    );
}
