#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import png2icons from 'png2icons';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const sourceSvg = path.join(rootDir, 'assets', 'pimux-logo.svg');
const outDir = path.join(rootDir, 'assets', 'icons');
const masterPng = path.join(outDir, 'icon.png');
const icoPath = path.join(outDir, 'icon.ico');
const icnsPath = path.join(outDir, 'icon.icns');
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

async function renderPng(size, filePath) {
    await sharp(sourceSvg, { density: 1024 })
        .resize(size, size, {
            fit: 'contain',
            kernel: sharp.kernel.nearest,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(filePath);
}

async function main() {
    if (!fs.existsSync(sourceSvg)) {
        throw new Error(`Missing source SVG: ${sourceSvg}`);
    }

    fs.mkdirSync(outDir, { recursive: true });

    for (const size of sizes) {
        await renderPng(size, path.join(outDir, `${size}x${size}.png`));
    }

    await renderPng(1024, masterPng);

    const input = fs.readFileSync(masterPng);

    const ico = png2icons.createICO(input, png2icons.BICUBIC2, 0, false, true);
    if (!ico) throw new Error('Failed to create Windows ICO icon');
    fs.writeFileSync(icoPath, ico);

    const icns = png2icons.createICNS(input, png2icons.BICUBIC2, 0);
    if (!icns) throw new Error('Failed to create macOS ICNS icon');
    fs.writeFileSync(icnsPath, icns);

    console.log(`Generated icons in ${path.relative(rootDir, outDir)}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
