import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function compactAge(timestamp: number | undefined) {
    if (!timestamp) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return 'now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 2_592_000) return `${Math.floor(seconds / 86_400)}d`;
    if (seconds < 31_536_000) return `${Math.floor(seconds / 2_592_000)}mo`;
    return `${Math.floor(seconds / 31_536_000)}y`;
}
