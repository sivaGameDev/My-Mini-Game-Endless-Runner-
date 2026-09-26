// One-off patch: seeded, reproducible track generation in the spawner (for challenge links).
const fs = require('fs');
const file = __dirname + '/../scripts/spawner.js';
let a = fs.readFileSync(file, 'utf8');
const rep = (from, to, count) => {
    const n = a.split(from).length - 1;
    if (n === 0) throw new Error('missing: ' + from.slice(0, 80));
    if (count !== undefined && n !== count) throw new Error('expected ' + count + ' of ' + from.slice(0, 60) + ', found ' + n);
    a = a.split(from).join(to);
};

// ---- Seed and per-row generator
rep(`Spawner.prototype.initialize = function () {`, `// Small seeded generator (mulberry32) and a hash to give every row its own stream.
Spawner.random = function (seed) {
    var s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

Spawner.hash = function (a, b) {
    var h = Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b >>> 0) + 0x632be5ab, 0xc2b2ae35);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    return h >>> 0;
};

Spawner.FINGERPRINT_EVERY = 25; // rows between layout fingerprints in the log

Spawner.prototype.initialize = function () {`);

rep(`    this.wedgeMesh = this._createWedgeMesh();
    this.clock = 0;`, `    this.wedgeMesh = this._createWedgeMesh();
    this.clock = 0;
    this.fixedSeed = null; // set for a challenge: every run builds the same track
    this.seed = 0;
    this.rand = Math.random;`);

rep(`    this.lastRowZ = this.firstRowZ;
    this._spawnRow(this.lastRowZ, true);
    this.nextGap = this._gap();
    this._fill();
};`, `    // The track is a pure function of the seed: each row has its own random stream (seed + row number)
    // and is laid out for its place along the track, not for how the player got there, so two players
    // with the same seed get the same rows whatever their speed, boosts or stumbles.
    this.seed = this.fixedSeed !== null ? this.fixedSeed : (Math.random() * 4294967296) >>> 0;
    this.rowIndex = 0;
    this.trackPos = -this.firstRowZ;
    this.fingerprint = this.seed;
    this.lastRowZ = this.firstRowZ;
    this._placeRow(true);
    this._fill();
};

// Use the same track for every run from now on (a challenge), or go back to random tracks (null).
Spawner.prototype.setSeed = function (seed) {
    this.fixedSeed = seed === null ? null : seed >>> 0;
};

Spawner.prototype._placeRow = function (gentle) {
    this.rowIndex++;
    this.rand = Spawner.random(Spawner.hash(this.seed, this.rowIndex));
    this.rowDistance = this.trackPos;
    this.rowParts = 0;
    this._spawnRow(this.lastRowZ, gentle);
    // Long rows (pads, platforms, holes, tunnels) ask for extra room before the next row.
    this.nextGap = Math.max(this._gap(), this.pendingGap);
    this.pendingGap = 0;
    this.fingerprint = Spawner.hash(this.fingerprint, Spawner.hash(Math.round(this.nextGap * 100), this.rowParts));
    if (this.rowIndex % Spawner.FINGERPRINT_EVERY === 0) {
        console.log('[spawner] seed ' + this.seed + ', rows 1-' + this.rowIndex + ' (to ' + Math.round(this.trackPos) + ' m): layout ' + this.fingerprint.toString(36));
    }
};`);

rep(`Spawner.prototype._fill = function () {
    while (this.lastRowZ - this.nextGap >= this.spawnZ) {
        this.lastRowZ -= this.nextGap;
        this._spawnRow(this.lastRowZ, false);
        // Long rows (pads, platforms, holes, tunnels) ask for extra room before the next row.
        this.nextGap = Math.max(this._gap(), this.pendingGap);
        this.pendingGap = 0;
    }
};`, `Spawner.prototype._fill = function () {
    while (this.lastRowZ - this.nextGap >= this.spawnZ) {
        this.lastRowZ -= this.nextGap;
        this.trackPos += this.nextGap;
        this._placeRow(false);
    }
};

Spawner.prototype._between = function (min, max) {
    return min + (max - min) * this.rand();
};`);

rep(`Spawner.prototype._gap = function () {
    var speed = Math.max(this.game.speed, this.game.startSpeed);
    return Math.max(11, speed * pc.math.random(this.minGapTime, this.maxGapTime));
};

// Roughly how fast the player will be going by the time they reach z.
Spawner.prototype._speedAt = function (z) {
    var g = this.game;
    var speed = Math.max(g.speed, g.startSpeed);
    return Math.min(g.maxSpeed, speed + g.acceleration * (-z / speed));
};

Spawner.prototype._barsAllowed = function () {
    return this.game.distance >= this.barStartDistance;
};`, `Spawner.prototype._gap = function () {
    return Math.max(11, this._speedAt() * this._between(this.minGapTime, this.maxGapTime));
};

// How fast a player runs on reaching the row being built, without boosts or goo:
// v = sqrt(v0² + 2ad) for steady acceleration a from v0 over distance d.
Spawner.prototype._speedAt = function () {
    var g = this.game;
    return Math.min(g.maxSpeed, Math.sqrt(g.startSpeed * g.startSpeed + 2 * g.acceleration * this.rowDistance));
};

Spawner.prototype._barsAllowed = function () {
    return this.rowDistance >= this.barStartDistance;
};`);

rep(`    return this.game.distance >= startDistance && Math.random() < chance;`, `    return this.rowDistance >= startDistance && this.rand() < chance;`);
rep(`    var d = pc.math.clamp(this.game.distance / 3000, 0, 1);`, `    var d = pc.math.clamp(this.rowDistance / 3000, 0, 1);`);
rep(`        if (this.game.distance > 250 && Math.random() < 0.08 + 0.07 * d) {`, `        if (this.rowDistance > 250 && this.rand() < 0.08 + 0.07 * d) {`);
rep(`this._speedAt(z)`, `this._speedAt()`);

// Everything that shapes the track draws from the row's stream. (Coin spin stays Math.random: looks only.)
const coinSpin = `e.rotate(0, Math.random() * 360, 0);`;
if (!a.includes(coinSpin)) throw new Error('coin spin line missing');
a = a.replace(coinSpin, '@@COINSPIN@@');
a = a.replace(/pc\.math\.random\(/g, 'this._between(');
a = a.replace(/Math\.random\(\)/g, 'this.rand()');
a = a.replace('@@COINSPIN@@', coinSpin);
// ...except the per-run seed itself, which must stay truly random.
a = a.replace(`this.fixedSeed : (this.rand() * 4294967296) >>> 0;`, `this.fixedSeed : (Math.random() * 4294967296) >>> 0;`);
// ...and the default before the first row.
a = a.replace(`    this.rand = this.rand;`, `    this.rand = Math.random;`);

// Count what each row builds, for the fingerprint.
rep(`Spawner.prototype._take = function (template) {`, `Spawner.prototype._take = function (template) {
    this.rowParts++;`);

fs.writeFileSync(file, a);
console.log('patched; remaining Math.random uses:');
a.split('\n').forEach((line, i) => { if (/Math\.random|pc\.math\.random|game\.distance|game\.speed\b/.test(line)) console.log((i + 1) + ': ' + line.trim()); });
