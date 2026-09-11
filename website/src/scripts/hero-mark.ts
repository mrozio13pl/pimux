const LOBES = 16;
const LOBE_DEPTH = 0.055;
const RADIUS = 0.92;
const THICKNESS = 0.085;
const SEGMENTS = 512;

function rim(t: number) {
    const r = RADIUS * (1 - LOBE_DEPTH + LOBE_DEPTH * Math.cos(LOBES * t));
    return [Math.cos(t) * r, Math.sin(t) * r] as const;
}

function buildCoin() {
    const pos: number[] = [];
    const nrm: number[] = [];
    const face: number[] = [];

    const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, f: number) => {
        pos.push(x, y, z);
        nrm.push(nx, ny, nz);
        face.push(f);
    };

    for (let i = 0; i < SEGMENTS; i++) {
        const t0 = (i / SEGMENTS) * Math.PI * 2;
        const t1 = ((i + 1) / SEGMENTS) * Math.PI * 2;
        const [x0, y0] = rim(t0);
        const [x1, y1] = rim(t1);

        // front cap
        push(0, 0, THICKNESS, 0, 0, 1, 1);
        push(x0, y0, THICKNESS, 0, 0, 1, 1);
        push(x1, y1, THICKNESS, 0, 0, 1, 1);

        // back cap
        push(0, 0, -THICKNESS, 0, 0, -1, 0);
        push(x1, y1, -THICKNESS, 0, 0, -1, 0);
        push(x0, y0, -THICKNESS, 0, 0, -1, 0);

        // side wall, normal points out along the rim tangent's perpendicular
        const dx = x1 - x0;
        const dy = y1 - y0;
        const l = Math.hypot(dx, dy) || 1;
        const nx = dy / l;
        const ny = -dx / l;
        push(x0, y0, THICKNESS, nx, ny, 0, 0);
        push(x0, y0, -THICKNESS, nx, ny, 0, 0);
        push(x1, y1, THICKNESS, nx, ny, 0, 0);
        push(x1, y1, THICKNESS, nx, ny, 0, 0);
        push(x0, y0, -THICKNESS, nx, ny, 0, 0);
        push(x1, y1, -THICKNESS, nx, ny, 0, 0);
    }

    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), face: new Float32Array(face) };
}

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute float aFace;
uniform mat4 uModel;
uniform mat4 uProj;
uniform mat3 uNormalMat;
varying vec3 vNormal;
varying vec3 vView;
varying float vFace;
varying vec2 vLocal;
void main() {
    vec4 world = uModel * vec4(aPos, 1.0);
    vNormal = uNormalMat * aNormal;
    vView = world.xyz;
    vFace = aFace;
    vLocal = aPos.xy;
    gl_Position = uProj * world;
}`;

const FRAG = `
precision highp float;
varying vec3 vNormal;
varying vec3 vView;
varying float vFace;
varying vec2 vLocal;

float seg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

float star(vec2 p) {
    float d = seg(p, vec2(0.0, 0.52), vec2(0.0, -0.52));
    d = min(d, seg(p, vec2(0.45, 0.26), vec2(-0.45, -0.26)));
    d = min(d, seg(p, vec2(0.45, -0.26), vec2(-0.45, 0.26)));
    return d;
}

vec3 env(vec3 r) {
    float y = r.y;
    vec3 floorC = vec3(0.014, 0.014, 0.016);
    vec3 wallC = vec3(0.075, 0.078, 0.090);
    vec3 coolC = vec3(0.88, 0.92, 1.0);
    vec3 sandC = vec3(1.0, 0.883, 0.745); // #f7e1be
    vec3 c = mix(floorC, wallC, smoothstep(-0.9, 0.15, y));
    c += coolC * smoothstep(0.02, 0.26, y) * (1.0 - smoothstep(0.32, 0.62, y)) * 1.15;
    c += coolC * 0.30 * smoothstep(0.72, 1.0, y);
    vec3 key = normalize(vec3(-0.55, 0.7, 0.45));
    float kd = max(dot(normalize(r), key), 0.0);
    c += sandC * 1.35 * pow(kd, 26.0);
    c += sandC * 0.30 * pow(kd, 3.0);
    return c;
}

void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(-vView);

    float shade = 1.0;
    if (vFace > 0.5) {
        float d = star(vLocal);
        float w = 0.075;
        float g = 1.0 - smoothstep(0.0, w, d);
        vec2 grad = normalize(vec2(
            star(vLocal + vec2(0.004, 0.0)) - star(vLocal - vec2(0.004, 0.0)),
            star(vLocal + vec2(0.0, 0.004)) - star(vLocal - vec2(0.0, 0.004))
        ) + 1e-6);
        n = normalize(n + vec3(grad * g * 1.6, 0.0));
        shade = mix(1.0, 0.55, g);
    }

    vec3 r = reflect(-v, n);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    vec3 base = vec3(0.50, 0.50, 0.515);
    vec3 sandC = vec3(1.0, 0.883, 0.745);
    vec3 key = normalize(vec3(-0.5, 0.72, 0.62));

    vec3 col = env(r) * base * shade;
    float nk = max(dot(n, key), 0.0);
    col += sandC * 0.16 * pow(nk, 1.6) * shade;
    col += sandC * 0.85 * pow(nk, 7.0) * shade;
    col += fres * vec3(0.40, 0.35, 0.27);
    col = col / (col + 0.92); // stay metal
    gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
}

function mul(a: number[], b: number[]) {
    const o = new Array(16).fill(0);
    for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
    return o;
}

export function mountHeroMark(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const { pos, nrm, face } = buildCoin();
    const bind = (data: Float32Array, name: string, size: number) => {
        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        return buf;
    };
    bind(pos, 'aPos', 3);
    bind(nrm, 'aNormal', 3);
    bind(face, 'aFace', 1);
    const count = pos.length / 3;

    const uModel = gl.getUniformLocation(prog, 'uModel');
    const uProj = gl.getUniformLocation(prog, 'uProj');
    const uNormalMat = gl.getUniformLocation(prog, 'uNormalMat');

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    let w = 0,
        h = 0;
    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = canvas.clientWidth;
        h = canvas.clientHeight;
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const TILT = -0.45;
    const FOV = 0.55;
    const FIT = 1.3;
    const SETTLE = 1400;
    const LEAN = 0.16;

    let targetX = 0,
        targetY = 0,
        leanX = 0,
        leanY = 0;
    const onPointer = (e: PointerEvent) => {
        targetX = (e.clientX / window.innerWidth - 0.5) * 2;
        targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!reduced && window.matchMedia('(pointer: fine)').matches) {
        window.addEventListener('pointermove', onPointer, { passive: true });
    }

    let start = 0;

    const frame = (time: number) => {
        if (!start) start = time;
        const elapsed = time - start;

        const p = reduced ? 1 : Math.min(elapsed / SETTLE, 1);
        const settle = 1 - Math.pow(1 - p, 4);

        leanX += (targetX - leanX) * 0.045;
        leanY += (targetY - leanY) * 0.045;

        const a = reduced ? -0.25 : (time / 1000) * -0.14; // clockwise
        const tilt = TILT + (1 - settle) * -0.55;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const ct = Math.cos(tilt);
        const st = Math.sin(tilt);

        const rz = [ca, sa, 0, 0, -sa, ca, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        const rx = [1, 0, 0, 0, 0, ct, st, 0, 0, -st, ct, 0, 0, 0, 0, 1];

        const lx = leanY * LEAN * settle;
        const ly = leanX * LEAN * settle;
        const px = [1, 0, 0, 0, 0, Math.cos(lx), Math.sin(lx), 0, 0, -Math.sin(lx), Math.cos(lx), 0, 0, 0, 0, 1];
        const py = [Math.cos(ly), 0, -Math.sin(ly), 0, 0, 1, 0, 0, Math.sin(ly), 0, Math.cos(ly), 0, 0, 0, 0, 1];
        const model = mul(mul(mul(rz, rx), px), py);

        const aspect = w / Math.max(h, 1);
        const halfTan = Math.tan(FOV / 2);
        model[14] = -(RADIUS * (FIT + (1 - settle) * 0.55)) / (halfTan * Math.min(1, aspect));

        const f = 1 / halfTan;
        const near = 0.1;
        const far = 20;
        const proj = [
            f / aspect,
            0,
            0,
            0,
            0,
            f,
            0,
            0,
            0,
            0,
            (far + near) / (near - far),
            -1,
            0,
            0,
            (2 * far * near) / (near - far),
            0,
        ];

        const nm = [model[0], model[1], model[2], model[4], model[5], model[6], model[8], model[9], model[10]];

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(uModel, false, new Float32Array(model));
        gl.uniformMatrix4fv(uProj, false, new Float32Array(proj));
        gl.uniformMatrix3fv(uNormalMat, false, new Float32Array(nm));
        gl.drawArrays(gl.TRIANGLES, 0, count);
        canvas.style.opacity = String(settle);
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}
