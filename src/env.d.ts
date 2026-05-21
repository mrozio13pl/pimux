import type * as React from 'react';
import type { PimuxBridge } from './ipc';

declare global {
    interface Window {
        pimux: PimuxBridge;
    }

    namespace JSX {
        interface IntrinsicElements {
            webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                src?: string;
                allowpopups?: boolean;
            };
        }
    }
}


