import { PenIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

interface NewViewButtonProps {
    open: boolean;
    onClick: () => void;
}

export function NewViewButton({ open, onClick }: NewViewButtonProps) {
    return (
        <Button
            className="w-full"
            variant="outline"
            size="lg"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={onClick}
        >
            <PenIcon data-icon="inline-start" weight="bold" />
            New View
        </Button>
    );
}
