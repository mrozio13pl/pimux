import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type DeleteTarget =
    | { kind: 'workspace'; id: string; title: string }
    | { kind: 'tab'; id: string; title: string };

export function DeleteConfirmDialog({
    target,
    onOpenChange,
    onConfirm,
}: {
    target: DeleteTarget | null;
    onOpenChange(open: boolean): void;
    onConfirm(): void;
}) {
    return (
        <AlertDialog open={target != null} onOpenChange={onOpenChange}>
            <AlertDialogContent onBackdropMouseDown={() => onOpenChange(false)}>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Remove {target?.kind === 'workspace' ? 'project' : 'tab'} from Pimux?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        All tabs from <i>{target?.title}</i> will be deleted. This action is not
                        recoverable.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onConfirm}>
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
