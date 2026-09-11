import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const target = process.argv.includes('--window') ? 'window' : 'hero';
const explicit = process.argv.find(
    (arg) => !arg.startsWith('--') && arg.endsWith('.png') && !arg.includes('shoot-hero'),
);
const url = process.env.DEMO_URL || 'http://localhost:5199/demo/index.html';

const defaults = {
    hero: '../website/assets/hero-full.next.png',
    window: '../website/assets/app-window.next.png',
};
const out = explicit
    ? fileURLToPath(new URL(explicit, `file://${process.cwd()}/`))
    : fileURLToPath(new URL(defaults[target], import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
});

await page.goto(url, { waitUntil: 'networkidle' });

const frame = page.frameLocator('#app');
await frame.locator('aside').waitFor();
await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow?.demoReady === true, null, {
    timeout: 30_000,
});

await frame.locator('body').evaluate((body) => {
    const doc = body.ownerDocument;
    const style = doc.createElement('style');
    style.textContent = '*, *::before, *::after { transition: none !important; }';
    doc.head.append(style);
});
await page.waitForTimeout(400);

await frame.locator('body').evaluate((body) => {
    for (const animation of body.ownerDocument.getAnimations()) {
        if (animation.timeline !== body.ownerDocument.timeline) continue;
        animation.currentTime = 600;
        animation.pause();
    }
});

if (target === 'window') {
    await page.locator('.window').evaluate((node) => {
        node.style.boxShadow = 'none';
        document.querySelector('.backdrop')?.remove();
        document.body.style.background = 'transparent';
        document.documentElement.style.background = 'transparent';
    });
    await page.locator('.window').screenshot({ path: out, omitBackground: true });
} else {
    await page.screenshot({ path: out });
}

await browser.close();
console.log(`wrote ${out}`);
