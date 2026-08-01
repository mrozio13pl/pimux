import { formatForDisplay } from '@tanstack/react-hotkeys';
import { Ansis } from 'ansis';
import type { Terminal } from 'ghostty-web';
import stripAnsi from 'strip-ansi';

const ansi = new Ansis(3);
const logo = [
    '       _                      ',
    ' _ __ (_)_ __ ___  _   ___  __',
    "| '_ \\| | '_ ` _ \\| | | \\ \\/ /",
    '| |_) | | | | | | | |_| |>  < ',
    '| .__/|_|_| |_| |_|\\__,_/_/\\_\\',
    '|_|',
];
const logoWidth = Math.max(...logo.map((line) => line.length));
const logoColor = ansi.rgb(175, 255, 120);
const hint = ansi.rgb(
    125,
    145,
    175,
)(`Press ${ansi.bold.white(formatForDisplay('Mod+N', { useSymbols: false }))} to open first view!`);
const layers = [
    { glyphs: ['.', '·'], colors: [ansi.rgb(65, 85, 125), ansi.rgb(90, 110, 155)] },
    { glyphs: ['*', '+'], colors: [ansi.rgb(120, 155, 205), ansi.rgb(155, 190, 235)] },
    { glyphs: ['✦', '*'], colors: [ansi.rgb(215, 235, 255), ansi.rgb(255, 225, 175)] },
];

function createSky(width: number, height: number) {
    return Array.from({ length: height }, () =>
        Array.from({ length: width }, () => {
            if (Math.random() > 0.045) return ' ';

            const depth = Math.random();
            const layer = layers[depth < 0.6 ? 0 : depth < 0.9 ? 1 : 2];
            const glyph = layer.glyphs[Math.floor(Math.random() * layer.glyphs.length)];
            const color = layer.colors[Math.floor(Math.random() * layer.colors.length)];
            return color(glyph);
        }),
    );
}

export function renderHeroAscii(terminal: Terminal) {
    const width = Math.max(120, terminal.cols);
    const sky = createSky(width, Math.max(40, terminal.rows));
    let frame = 0;

    const render = () => {
        const offset = frame % width;
        let output = '\x1b[?25l';

        for (let row = 0; row < terminal.rows; row += 1) {
            const line = sky[row % sky.length];
            const visible = Array.from(
                { length: terminal.cols },
                (_, column) => line[(column - offset + width) % width],
            ).join('');
            output += `\x1b[${row + 1};1H\x1b[2K${visible}`;
        }

        const logoTop = Math.max(0, Math.floor((terminal.rows - logo.length) / 2) - 2);
        const logoLeft = Math.max(0, Math.floor((terminal.cols - logoWidth) / 2));
        output += logo
            .map((line, row) => `\x1b[${logoTop + row + 1};${logoLeft + 1}H${logoColor(line.padEnd(logoWidth))}`)
            .join('');

        const hintRow = logoTop + logo.length + 1;
        const hintLeft = Math.max(0, Math.floor((terminal.cols - stripAnsi(hint).length) / 2));
        if (hintRow < terminal.rows) {
            output += `\x1b[${hintRow + 1};${hintLeft + 1}H${hint}`;
        }

        terminal.write(output);
        frame += 1;
    };

    terminal.write('\x1b[2J\x1b[H\x1b[?25l');
    render();
    const timer = window.setInterval(render, 140);

    return () => window.clearInterval(timer);
}
