import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron/simple';
import { resolve } from 'node:path';

export default defineConfig({
    publicDir: false,
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@shared': resolve(__dirname, 'shared'),
        },
    },
    plugins: [
        react(),
        tailwindcss(),
        electron({
            main: {
                entry: 'main/index.ts',
                vite: {
                    build: {
                        outDir: 'out/main',
                        rollupOptions: {
                            external: ['node-pty'],
                        },
                    },
                },
            },
            preload: {
                input: 'preload/index.ts',
                vite: {
                    build: {
                        outDir: 'out/preload',
                    },
                },
            },
        }),
    ],
    build: {
        outDir: 'out/renderer',
        emptyOutDir: true,
    },
});
