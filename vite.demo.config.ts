import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const stub = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        tsconfigPaths: true,
        alias: {
            '@tauri-apps/api/core': stub('./demo/tauri/core.ts'),
            '@tauri-apps/plugin-store': stub('./demo/tauri/store.ts'),
            '@tauri-apps/plugin-dialog': stub('./demo/tauri/dialog.ts'),
        },
    },
    server: { port: 5199 },
});
