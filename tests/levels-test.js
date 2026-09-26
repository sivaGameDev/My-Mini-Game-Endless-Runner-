const fs = require('fs');
const assert = require('assert');
const read = f => fs.readFileSync(__dirname + '/../scripts/' + f, 'utf8');
const pc = { createScript: function () { const S = function () {}; S.attributes = { add: function () {} }; return S; },
    math: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } };
const { Progress, Trail, Shop, Levels, Achievements } = new Function('pc',
    read('progress.js') + read('trail.js') + read('shop.js') + read('levels.js') + read('achievements.js') +
    '\nreturn { Progress, Trail, Shop, Levels, Achievements };')(pc);

// XP curve
assert.strictEqual(Levels.needed(1), 100);
assert.strictEqual(Levels.needed(4), 280);
assert.strictEqual(Levels.totalFor(1), 0);
assert.strictEqual(Levels.totalFor(2), 100);
assert.strictEqual(Levels.totalFor(5), 100 + 160 + 220 + 280);
assert.deepStrictEqual(Levels.fromXp(0), { level: 1, into: 0, need: 100 });
assert.deepStrictEqual(Levels.fromXp(99), { level: 1, into: 99, need: 100 });
assert.deepStrictEqual(Levels.fromXp(100), { level: 2, into: 0, need: 160 });
for (let l = 1; l < 60; l++) {
    assert.strictEqual(Levels.fromXp(Levels.totalFor(l)).level, l);
    assert.strictEqual(Levels.fromXp(Levels.totalFor(l + 1) - 1).level, l);
}
assert.strictEqual(Levels.fromXp(1e12).level, Levels.MAX); // capped, no endless loop
console.log('curve ok; XP to reach level 10:', Levels.totalFor(10), ', level 20:', Levels.totalFor(20));

// Level rewards
assert.deepStrictEqual(Levels.rewardFor(2), { coins: 100 });
assert.deepStrictEqual(Levels.rewardFor(3), { coins: 150, item: 'shield' });
assert.deepStrictEqual(Levels.rewardFor(6), { coins: 300, item: 'booster' });
assert.strictEqual(Levels.rewardFor(5).unlock.def.id, 'plasma');
assert.strictEqual(Levels.rewardFor(10).unlock.def.id, 'chrome');
assert.strictEqual(Levels.rewardFor(15).unlock.def.id, 'ember');   // not an item level: unlock wins
assert.strictEqual(Levels.rewardFor(15).item, undefined);
assert.strictEqual(Levels.rewardFor(20).unlock.def.id, 'aurora');
assert.strictEqual(Levels.describe(Levels.rewardFor(5)), '+250 coins, Plasma trail');
assert.strictEqual(Levels.describe(Levels.rewardFor(9)), '+450 coins, Starting Shield');
assert.strictEqual(Levels.nextText(4), 'Plasma trail');
assert.strictEqual(Levels.nextText(1), '+100 coins');
// Level-only cosmetics are not for sale
const p = Progress.defaults();
assert.strictEqual(Shop.price(p, 'trail', 'plasma'), null);
assert.strictEqual(Shop.price(p, 'skin', 'chrome'), null);
console.log('level rewards ok');

// Trophies: unique ids, sane definitions, values
const ids = new Set(Achievements.LIST.map(d => d.id));
assert.strictEqual(ids.size, Achievements.LIST.length);
assert.strictEqual(Achievements.LIST.length, 26);
Achievements.LIST.forEach(d => {
    assert.ok(!!d.run !== !!d.stat, d.id);
    assert.ok(d.target > 0 && Achievements.TIERS[d.tier], d.id);
});
const d = Progress.defaults();
const byId = id => Achievements.LIST.find(x => x.id === id);
d.records.best = 1234;
assert.strictEqual(Achievements.value(byId('run1000'), d, null), 1234); // existing best counts
d.feats.combo5 = 3;
assert.strictEqual(Achievements.value(byId('combo5'), d, { combo: 2 }), 3);
assert.strictEqual(Achievements.value(byId('combo5'), d, { combo: 6 }), 6);
d.runs = 30; d.streak.count = 4; d.stats.jumps = 12;
assert.strictEqual(Achievements.value(byId('runs25'), d, null), 30);
assert.strictEqual(Achievements.value(byId('streak7'), d, null), 4);
assert.strictEqual(Achievements.value(byId('jumps500'), d, null), 12);
assert.strictEqual(Achievements.value(byId('pads100'), d, null), 0);
// Saved trophy data survives a save/load round trip
d.xp = 777; d.level = 4; d.streak = { count: 4, last: -1, best: 4 }; d.achievements = { run100: 20718, runs25: 20718 }; d.feats = { combo5: 3, sky: 1 };
assert.deepStrictEqual(Progress.sanitize(JSON.parse(JSON.stringify(d))), d);
const bad = Progress.sanitize({ xp: -5, level: 500, stats: { jumps: -1, 'bad key!': 4, pads: 7 }, achievements: { x: 'no' } });
assert.deepStrictEqual([bad.xp, bad.level, bad.stats, bad.achievements], [0, 99, { pads: 7 }, {}]);
console.log('trophies ok');
console.log('ALL LEVEL/TROPHY TESTS PASSED');
