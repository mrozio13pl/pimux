import type { ReactNode } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';

export type HotkeyIndicatorProps = {
    keys: ReactNode;
    visible?: boolean;
    className?: string;
};

export function HotkeyIndicator({ keys, visible = true, className }: HotkeyIndicatorProps) {
    if (!visible) return null;

    return (
        <Kbd
            className={cn(
                'h-5 min-w-0 rounded-md bg-background/95 px-1.5 text-[10px] text-foreground shadow-sm',
                className,
            )}
        >
            {keys}
        </Kbd>
    );
}

export type HotkeyIndicatorBadgeProps = HotkeyIndicatorProps;

export function HotkeyIndicatorBadge(props: HotkeyIndicatorBadgeProps) {
    return <HotkeyIndicator {...props} className={cn('shrink-0', props.className)} />;
}
