// Draws the game's icon and writes a PNG, with no image libraries: the scene is rasterised by hand
// at 3x and averaged down for clean edges, then encoded as a PNG chunk by chunk.
const fs = require('fs');
const zlib = require('zlib');

const SIZE = Number(process.argv[3]) || 512;
const SS = 3;                 // supersampling factor
const W = SIZE * SS;
const HORIZON = 0.30 * W;     // where the road vanishes

const mix = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

const SKY_TOP = [26, 18, 56];
const SKY_LOW = [13, 2, 24];
const ROAD = [22, 16, 34];
const VERGE = [255, 61, 242];
const LANE = [150, 220, 255];
const RUNNER = [53, 196, 255];
const RUNNER_LIT = [140, 235, 255];

// Half the road's width at a given depth: a point at the horizon, wide at the bottom.
const halfRoad = (y) => {
    const t = (y - HORIZON) / (W - HORIZON);
    return 0.02 * W + t * 0.40 * W;
};

const glowAt = (x, y) => {
    const dx = (x - W / 2) / (0.36 * W);
    const dy = (y - 0.66 * W) / (0.32 * W);
    return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
};

const shade = (x, y) => {
    // Sky, darkening towards the ground.
    let c = mixC(SKY_TOP, SKY_LOW, y / W);
    if (y < HORIZON) {
        // A faint glow sitting on the horizon.
        const d = (HORIZON - y) / (0.3 * W);
        c = mixC(c, [70, 20, 90], Math.max(0, 0.35 - d * 0.35));
        return c;
    }

    const half = halfRoad(y);
    const dx = Math.abs(x - W / 2);
    const depth = (y - HORIZON) / (W - HORIZON);

    // The verges: a bright band just outside the road, thickening towards the viewer.
    const bandOuter = half + 0.012 * W + depth * 0.06 * W;
    if (dx > half && dx < bandOuter) {
        const edge = (dx - half) / (bandOuter - half);
        return mixC(VERGE, [255, 180, 250], 0.25 * (1 - edge));
    }
    // Their glow spilling onto the ground.
    if (dx >= bandOuter) {
        const fall = Math.max(0, 1 - (dx - bandOuter) / (0.10 * W));
        return mixC(c, VERGE, 0.22 * fall * fall);
    }

    // The road itself, with two lane lines.
    let road = mixC(ROAD, [8, 5, 14], 1 - depth);
    const lane = half * 0.34;
    const lineW = 0.004 * W + depth * 0.006 * W;
    if (Math.abs(dx - lane) < lineW) {
        const soft = 1 - Math.abs(dx - lane) / lineW;
        road = mixC(road, LANE, 0.75 * soft);
    }
    const g = glowAt(x, y);
    return mixC(road, RUNNER, 0.3 * g * g);
};

// The runner: a capsule standing in the middle lane, lit from the front.
const runner = (x, y) => {
    const cx = W / 2;
    const top = 0.50 * W;
    const bottom = 0.84 * W;
    const rx = 0.105 * W;
    const r = rx;
    if (y < top || y > bottom) return null;
    let dx = Math.abs(x - cx);
    let dy = 0;
    if (y < top + r) dy = top + r - y;
    else if (y > bottom - r) dy = y - (bottom - r);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > rx) return null;
    // Rounder shading: brighter up the left side where the neon hits it.
    const lit = Math.max(0, 1 - (x - (cx - rx)) / (2 * rx));
    return mixC(RUNNER, RUNNER_LIT, 0.15 + 0.5 * lit * (1 - d / rx));
};

const big = Buffer.alloc(W * W * 3);
for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
        const c = runner(x, y) || shade(x, y);
        const i = (y * W + x) * 3;
        big[i] = Math.round(Math.max(0, Math.min(255, c[0])));
        big[i + 1] = Math.round(Math.max(0, Math.min(255, c[1])));
        big[i + 2] = Math.round(Math.max(0, Math.min(255, c[2])));
    }
}

// Average each SSxSS block down to one pixel, and lay out the PNG's raw scanlines.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let p = 0;
for (let y = 0; y < SIZE; y++) {
    raw[p++] = 0;   // filter: none
    for (let x = 0; x < SIZE; x++) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < SS; sy++) {
            for (let sx = 0; sx < SS; sx++) {
                const i = ((y * SS + sy) * W + (x * SS + sx)) * 3;
                r += big[i];
                g += big[i + 1];
                b += big[i + 2];
            }
        }
        const n = SS * SS;
        raw[p++] = Math.round(r / n);
        raw[p++] = Math.round(g / n);
        raw[p++] = Math.round(b / n);
        raw[p++] = 255;
    }
}

const TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();
const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;    // bit depth
ihdr[9] = 6;    // colour type: RGBA
const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
]);

const out = process.argv[2];
fs.writeFileSync(out, png);
console.log('wrote ' + out + ' (' + SIZE + 'x' + SIZE + ', ' + png.length + ' bytes)');
