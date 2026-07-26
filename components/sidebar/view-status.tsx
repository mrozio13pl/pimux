import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const statusVariants = cva('size-2 rounded-full', {
    variants: {
        variant: {
            idle: 'hidden',
            error: 'bg-destructive',
            finished: 'bg-green-400',
            working: 'bg-yellow-400',
        },
    },
});

export type ViewStatusType = NonNullable<VariantProps<typeof statusVariants>['variant']>;

export function ViewStatus({
    variant = 'idle',
    showIdle = false,
    className,
    ...props
}: React.ComponentProps<'span'> & VariantProps<typeof statusVariants> & { showIdle?: boolean }) {
    return (
        <span
            className={cn(
                statusVariants({ variant }),
                showIdle && variant === 'idle' && 'block bg-muted-foreground/50',
                className,
            )}
            {...props}
        />
    );
}
