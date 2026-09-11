// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    site: process.env.SITE,
    base: process.env.BASE_PATH?.replace(/\/?$/, '/'),
    vite: {
        plugins: [tailwindcss()],
    },
});
