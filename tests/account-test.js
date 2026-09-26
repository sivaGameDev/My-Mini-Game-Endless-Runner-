const fs = require('fs');
const assert = require('assert');
const read = f => fs.readFileSync(__dirname + '/../scripts/' + f, 'utf8');
const pc = { createScript: function () { const S = function () {}; S.attributes = { add: function () {} }; return S; },
    math: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } };
const { Progress, Account, Challenge, Leaderboard } = new Function('pc',
    read('spawner.js') + read('progress.js') + read('trail.js') + read('shop.js') + read('levels.js') +
    read('challenge.js') + read('account.js') + read('leaderboard.js') +
    '\nreturn { Progress, Account, Challenge, Leaderboard };')(pc);

// Merging a cloud profile must never take anything away.
const local = Progress.defaults();
local.wallet = 500; local.xp = 900; local.level = 4; local.runs = 30;
local.records.best = 1800;
local.skins.owned = ['classic', 'gold'];
local.trails.owned = ['none', 'cyan'];
local.stats = { jumps: 400, coins: 2000 };
local.feats = { combo5: 6 };
local.achievements = { run100: 20700 };
local.zones = ['bloodmoon'];
const before = JSON.parse(JSON.stringify(local));

// An older cloud copy: nothing should change.
assert.strictEqual(Account.merge(local, { wallet: 10, xp: 5, level: 1, runs: 2, records: { best: 100 },
    skins: { owned: ['classic'] }, trails: { owned: ['none'] }, stats: { jumps: 3 }, zones: [] }), false);
assert.deepStrictEqual(local, before, 'an older cloud profile must not undo anything');

// A newer cloud copy: the better of each is kept, lists are joined.
assert.strictEqual(Account.merge(local, { wallet: 900, xp: 800, level: 6, runs: 12, records: { best: 2600 },
    skins: { owned: ['classic', 'ice'] }, trails: { owned: ['none', 'rainbow'] },
    stats: { jumps: 100, bars: 55 }, feats: { combo5: 4, sky: 1 }, achievements: { run500: 20710 },
    zones: ['bloodmoon', 'goldrush'] }), true);
assert.strictEqual(local.wallet, 900);
assert.strictEqual(local.xp, 900);              // local XP was higher
assert.strictEqual(local.level, 6);
assert.strictEqual(local.runs, 30);             // local run count was higher
assert.strictEqual(local.records.best, 2600);
assert.deepStrictEqual(local.skins.owned, ['classic', 'gold', 'ice']);
assert.deepStrictEqual(local.trails.owned, ['none', 'cyan', 'rainbow']);
assert.deepStrictEqual(local.stats, { jumps: 400, coins: 2000, bars: 55 });
assert.deepStrictEqual(local.feats, { combo5: 6, sky: 1 });
assert.deepStrictEqual(local.achievements, { run100: 20700, run500: 20710 });
assert.deepStrictEqual(local.zones, ['bloodmoon', 'goldrush']);

// Rubbish from the cloud is ignored rather than trusted.
const safe = JSON.parse(JSON.stringify(local));
[null, undefined, 'nonsense', 42, {}].forEach(junk => {
    Account.merge(local, junk);
    assert.deepStrictEqual(local, safe, 'bad cloud data changed the profile: ' + JSON.stringify(junk));
});
Account.merge(local, { wallet: 'lots', skins: { owned: [1, 2, {}] }, zones: [{}], stats: { jumps: 'many' } });
assert.deepStrictEqual(local, safe, 'wrong types must be skipped');
console.log('cloud merge ok');

// Board names are per day and safe to use as an id.
const name = Leaderboard.dailyName(new Date(2026, 8, 23));
assert.strictEqual(name, 'daily-2026-09-23');
assert.notStrictEqual(name, Leaderboard.dailyName(new Date(2026, 8, 24)));
assert.strictEqual(Leaderboard.dailyName(new Date(2026, 0, 5)), 'daily-2026-01-05');
console.log('board names ok');
console.log('ALL ACCOUNT TESTS PASSED');
