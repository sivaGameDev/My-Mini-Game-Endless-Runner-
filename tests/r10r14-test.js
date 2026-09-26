const fs = require('fs');
const assert = require('assert');
const read = f => fs.readFileSync(__dirname + '/../scripts/' + f, 'utf8');
const pc = { createScript: function () { const S = function () {}; S.attributes = { add: function () {} }; return S; },
    math: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), random: () => { throw new Error('pc.math.random used'); } } };
const G = new Function('pc', read('spawner.js') + read('progress.js') + read('trail.js') + read('shop.js') + read('levels.js') +
    read('zones.js') + read('challenge.js') + '\nreturn { Spawner, Progress, Levels, Zones, Challenge };')(pc);
const { Spawner, Progress, Levels, Zones, Challenge } = G;

// ---- Challenge codes
const code = Challenge.encode(3141592653, 1234, 5678);
assert.deepStrictEqual(Challenge.decode(code), { seed: 3141592653, distance: 1234, score: 5678, code: code });
assert.strictEqual(Challenge.decode(Challenge.encode(0, 0, 0)).seed, 0);
assert.strictEqual(Challenge.decode(Challenge.encode(4294967295, 999999, 1e8)).seed, 4294967295);
const parts = code.split('-');
const tampered = [parts[0], (parseInt(parts[1], 36) + 1).toString(36), parts[2], parts[3]].join('-');
assert.strictEqual(Challenge.decode(tampered), null, 'edited distance must fail the check');
['', 'abc', 'a-b-c', 'A-B-C-D', '1-2-3-4-5', 'zzzzzzzz-1-1-1', null, 42].forEach(bad => assert.strictEqual(Challenge.decode(bad), null, String(bad)));
let rejected = 0;
for (let i = 0; i < 2000; i++) { // random junk almost never passes the check
    const junk = [0, 0, 0, 0].map(() => Math.floor(Math.random() * 1e6).toString(36)).join('-');
    if (!Challenge.decode(junk)) rejected++;
}
assert.ok(rejected > 1980, 'check value rejects junk: ' + rejected);
console.log('challenge codes ok, e.g.', code);

// ---- Zones: unlocks and order
const data = Progress.defaults();
const byId = id => Zones.EXTRA.find(z => z.id === id);
assert.strictEqual(Zones.isUnlocked(byId('bloodmoon'), data), false);
data.level = 3;
assert.strictEqual(Zones.isUnlocked(byId('bloodmoon'), data), true);
data.level = 1; data.records.best = 2000;
assert.strictEqual(Zones.isUnlocked(byId('bloodmoon'), data), true);
assert.strictEqual(Zones.isUnlocked(byId('goldrush'), data), false);
assert.strictEqual(Zones.unlockText(byId('deepspace')), 'Level 12 or 4,000 m');
const avail = [0, 1, 2, 3, 4, 5, 6];
const o1 = Zones.order(avail, 777);
assert.deepStrictEqual(o1, Zones.order(avail, 777));            // same track seed, same order
assert.strictEqual(o1[0], 0);                                     // always starts in Neon Dusk
assert.deepStrictEqual(o1.slice().sort(), avail.slice().sort());  // every zone exactly once
const orders = new Set();
for (let s = 0; s < 200; s++) orders.add(Zones.order(avail, s).join());
assert.ok(orders.size > 100, 'orders vary by seed: ' + orders.size);
assert.strictEqual(Levels.describe(Levels.rewardFor(3)), '+150 coins, Starting Shield, Blood Moon zone');
assert.strictEqual(Levels.nextText(6), 'Gold Rush zone');
const saved = Progress.sanitize({ zones: ['bloodmoon', 'bloodmoon', 'bad id!'], challenges: { [code]: 900, 'nope': 3 } });
assert.deepStrictEqual([saved.zones, saved.challenges], [['bloodmoon'], { [code]: 900 }]);
console.log('zones ok');

// ---- Track determinism: record what every row places, for a seed, with the player at
// different speeds and distances while the rows are built.
const src = read('spawner.js');
const attrs = {};
src.replace(/Spawner\.attributes\.add\('(\w+)',\s*\{[^}]*?default:\s*([^,}]+)/g, (m, k, v) => { attrs[k] = Number(v); });
function build(seed, liveSpeed, liveDistance, rows) {
    const s = new Spawner();
    Object.assign(s, attrs);
    s.game = { startSpeed: 14, maxSpeed: 34, acceleration: 0.3, speed: liveSpeed, distance: liveDistance, factor: 1 };
    s.runner = { gravity: 26 };
    const log = [];
    const rec = name => function (first) {
        this.rowParts++;
        log.push(name + ':' + Array.prototype.map.call(arguments, a => typeof a === 'number' ? Math.round(a * 1000) : JSON.stringify(a)).join(','));
        // The stones row reads the slab it placed.
        if (name === '_addSlab') return { base: (first.top || Spawner.SLAB_TOP) + (first.bob ? Spawner.BOB_AMP : 0) };
    };
    ['_addObstacle', '_addRamp', '_addPlatform', '_addSlab', '_addPit', '_addStrip', '_addTunnel', '_addPad', '_addPickup', '_addCoin']
        .forEach(n => { s[n] = rec(n); });
    s.fixedSeed = seed;
    s.seed = seed;
    s.rowIndex = 0;
    s.trackPos = -attrs.firstRowZ;
    s.fingerprint = seed;
    s.lastRowZ = attrs.firstRowZ;
    s.pendingGap = 0;
    const origLog = console.log;
    console.log = () => {};
    s._placeRow(true);
    for (let i = 1; i < rows; i++) {
        s.lastRowZ -= s.nextGap;
        s.trackPos += s.nextGap;
        s._placeRow(false);
    }
    console.log = origLog;
    return { log: log.join('|'), fingerprint: s.fingerprint, trackPos: s.trackPos };
}
const a = build(12345, 14, 0, 120);
const b = build(12345, 33, 1800, 120);   // same seed, very different live speed and distance
const c = build(12346, 14, 0, 120);
assert.strictEqual(a.log, b.log, 'same seed must place the same rows whatever the live speed/distance');
assert.strictEqual(a.fingerprint, b.fingerprint);
assert.notStrictEqual(a.log, c.log, 'a different seed gives a different track');
const kinds = new Set(a.log.split('|').map(x => x.split(':')[0]));
console.log('determinism ok over 120 rows (' + Math.round(a.trackPos) + ' m, ' + a.log.split('|').length + ' objects, kinds: ' + [...kinds].join(' ') + ')');
console.log('ALL R10/R14 TESTS PASSED');
