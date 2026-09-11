const PX = 5;
const TOP = 0.3;
const GAMMA = 2.4;
const PEAK = 0.7;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const CLEAR = 0.5;
const FADE = 80;

// #7a5c38
const R = 122;
const G = 92;
const B = 56;

export function mountDitherField(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const src = document.createElement('canvas');
    const sctx = src.getContext('2d');
    if (!sctx) return;

    let cols = 0;
    let rows = 0;
    let image: ImageData | null = null;
    let ramp: Float32Array = new Float32Array(0);

    let holeX = 0;
    let holeY = 0;
    let holeIn = -1;
    let holeOut = 0;

    const ax = [6.2, 0, 3.1, 2.0];
    const ay = [0, 4.4, 2.6, -4.8];
    const speed = [0.33, -0.26, 0.19, -0.15];
    const sinX = [0, 0, 0, 0].map(() => new Float32Array(0));
    const cosX = [0, 0, 0, 0].map(() => new Float32Array(0));
    const sinY = [0, 0, 0, 0].map(() => new Float32Array(0));
    const cosY = [0, 0, 0, 0].map(() => new Float32Array(0));

    const resize = () => {
        cols = Math.max(1, Math.ceil(canvas.clientWidth / PX) + 1);
        rows = Math.max(1, Math.ceil(canvas.clientHeight / PX) + 1);
        canvas.width = cols * PX;
        canvas.height = rows * PX;
        src.width = cols;
        src.height = rows;
        image = sctx.createImageData(cols, rows);
        ctx.imageSmoothingEnabled = false;

        const mark = document.querySelector<HTMLCanvasElement>('.mark-canvas');
        if (mark) {
            const f = canvas.getBoundingClientRect();
            const m = mark.getBoundingClientRect();
            holeX = (m.left + m.width / 2 - f.left) / PX;
            holeY = (m.top + m.height / 2 - f.top) / PX;
            holeIn = (m.width * CLEAR) / PX;
            holeOut = holeIn + FADE / PX;
        } else {
            holeIn = -1;
        }

        ramp = new Float32Array(rows);
        for (let y = 0; y < rows; y++) {
            ramp[y] = Math.max(0, (y / rows - TOP) / (1 - TOP)) ** GAMMA;
        }
        for (let k = 0; k < 4; k++) {
            sinX[k] = new Float32Array(cols);
            cosX[k] = new Float32Array(cols);
            sinY[k] = new Float32Array(rows);
            cosY[k] = new Float32Array(rows);
            for (let y = 0; y < rows; y++) {
                const b = (y / rows) * ay[k];
                sinY[k][y] = Math.sin(b);
                cosY[k][y] = Math.cos(b);
            }
        }
    };
    resize();

    if (document.fonts) document.fonts.ready.then(resize);

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(resize, 150);
    });

    const draw = (t: number) => {
        if (!image) return;
        const data = image.data;

        for (let k = 0; k < 4; k++) {
            for (let x = 0; x < cols; x++) {
                const a = (x / cols) * ax[k] + t * speed[k];
                sinX[k][x] = Math.sin(a);
                cosX[k][x] = Math.cos(a);
            }
        }

        const in2 = holeIn * holeIn;
        const out2 = holeOut * holeOut;
        const span = Math.max(out2 - in2, 1);

        for (let y = 0; y < rows; y++) {
            const lane = ramp[y];
            const rowOff = y * cols;
            const bay = (y & 3) * 4;
            const dy = y - holeY;
            const dy2 = dy * dy;

            for (let x = 0; x < cols; x++) {
                let wave = 0;
                for (let k = 0; k < 4; k++) {
                    wave += sinX[k][x] * cosY[k][y] + cosX[k][x] * sinY[k][y];
                }

                let keep = 1;
                if (holeIn > 0) {
                    const dx = x - holeX;
                    const d2 = dx * dx + dy2;
                    if (d2 <= in2) keep = 0;
                    else if (d2 < out2) keep = (d2 - in2) / span;
                }

                const v = lane * (0.5 + 0.125 * wave) * PEAK * keep;
                const i = (rowOff + x) * 4;
                data[i] = R;
                data[i + 1] = G;
                data[i + 2] = B;
                data[i + 3] = v > BAYER[bay + (x & 3)] ? 255 : 0;
            }
        }

        sctx.putImageData(image, 0, 0);
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(src, 0, 0, cols, rows, 0, 0, canvas.width, canvas.height);
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        draw(0);
        return;
    }

    const frame = (now: number) => {
        draw(now / 1000);
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}
