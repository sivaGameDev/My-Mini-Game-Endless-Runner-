const fs = require('fs');
const assert = require('assert');
const src = fs.readFileSync(process.argv[2], 'utf8');
// Minimal pc stub: createScript returns a constructor with attributes.add.
const pc = { createScript: function () { const S = function () {}; S.attributes = { add: function () {} }; return S; } };
const Progress = new Function('pc', src + '\nreturn Progress;')(pc);

// dayIndex: consecutive days across month ends, year end and DST changes (local time).
let prev = Progress.dayIndex(new Date(2026, 0, 1, 12));
for (let i = 1; i < 800; i++) {
  const d = new Date(2026, 0, 1 + i, i % 2 ? 0 : 23, 30);   // just after midnight / just before
  const idx = Progress.dayIndex(d);
  assert.strictEqual(idx, prev + 1, 'day ' + i + ' ' + d);
  prev = idx;
}
assert.strictEqual(Progress.dayIndex(new Date(2026, 8, 22, 0, 0, 1)), Progress.dayIndex(new Date(2026, 8, 22, 23, 59, 59)));
console.log('dayIndex ok');

// msToMidnight
assert.strictEqual(Progress.msToMidnight(new Date(2026, 8, 22, 23, 0, 0)), 3600000);
console.log('fmtTime', Progress.fmtTime(3600000), '|', Progress.fmtTime(5 * 3600000 + 12 * 60000 + 1), '|', Progress.fmtTime(30000));

// streakStatus
const T = 20000;
let s = Progress.streakStatus({ count: 0, last: -1 }, T);
assert.deepStrictEqual([s.pending, s.count, s.day, s.broken], [true, 1, 1, false]);
s = Progress.streakStatus({ count: 3, last: T - 1 }, T);
assert.deepStrictEqual([s.pending, s.count, s.day, s.broken], [true, 4, 4, false]);
s = Progress.streakStatus({ count: 3, last: T }, T);
assert.deepStrictEqual([s.pending, s.count, s.day], [false, 3, 3]);
s = Progress.streakStatus({ count: 5, last: T - 2 }, T);
assert.deepStrictEqual([s.pending, s.count, s.day, s.broken], [true, 1, 1, true]);
s = Progress.streakStatus({ count: 7, last: T - 1 }, T);
assert.deepStrictEqual([s.count, s.day], [8, 1]);
s = Progress.streakStatus({ count: 13, last: T - 1 }, T);
assert.deepStrictEqual([s.count, s.day], [14, 7]);
s = Progress.streakStatus({ count: 4, last: T + 3 }, T); // clock went back
assert.strictEqual(s.pending, false);
console.log('streakStatus ok');

// Rewards: days 1-6 coins, day 7 next skin until all owned, then 750.
assert.deepStrictEqual(Progress.rewardFor(1, ['classic']), { coins: 50 });
assert.deepStrictEqual(Progress.rewardFor(6, ['classic']), { coins: 300 });
assert.strictEqual(Progress.rewardFor(7, ['classic']).skin.id, 'gold');
assert.strictEqual(Progress.rewardFor(7, ['classic', 'gold']).skin.id, 'magenta');
assert.strictEqual(Progress.rewardFor(7, ['classic', 'gold', 'magenta']).skin.id, 'ice');
assert.deepStrictEqual(Progress.rewardFor(7, ['classic', 'gold', 'magenta', 'ice']), { coins: 750 });
console.log('rewards ok');

// Missions: deterministic, one per tier, groups distinct, every mission reachable.
const seen = {};
for (let day = 19000; day < 21000; day++) {
  const a = Progress.pickMissions(day);
  assert.deepStrictEqual(a, Progress.pickMissions(day));
  assert.strictEqual(a.length, 3);
  const defs = a.map(m => Progress.byId[m.id]);
  assert.deepStrictEqual(defs.map(d => d.tier), [0, 1, 2]);
  assert.strictEqual(new Set(defs.map(d => d.group)).size, 3, 'groups ' + day);
  defs.forEach(d => { seen[d.id] = (seen[d.id] || 0) + 1; });
}
const unseen = Progress.MISSIONS.filter(m => !seen[m.id]).map(m => m.id);
assert.deepStrictEqual(unseen, []);
console.log('missions ok; frequency over 2000 days:', JSON.stringify(seen));
const d0 = Progress.dayIndex(new Date(2026, 8, 22));
console.log('today (' + d0 + '):', Progress.pickMissions(d0).map(m => Progress.byId[m.id].text).join(' | '));
console.log('tomorrow:', Progress.pickMissions(d0 + 1).map(m => Progress.byId[m.id].text).join(' | '));
// Consecutive days shouldn't repeat the exact same set too often.
let same = 0;
for (let day = 19000; day < 21000; day++) if (JSON.stringify(Progress.pickMissions(day)) === JSON.stringify(Progress.pickMissions(day + 1))) same++;
console.log('identical consecutive days out of 2000:', same);

// sanitize: junk and partial data fall back safely.
assert.deepStrictEqual(Progress.sanitize(null), Progress.defaults());
assert.deepStrictEqual(Progress.sanitize('x'), Progress.defaults());
const junk = Progress.sanitize({ wallet: -5, runs: 'a', streak: { count: 2.7, last: 'z' },
  missions: { day: 5, list: [{ id: 'nope' }, { id: 'jumps30', progress: 3 }], bonus: 1 },
  records: { best: 1e3, days: { '20000': 400, 'x': 3, '19999': -1 } },
  skins: { owned: ['gold', 'gold', 'hat', 'classic'], equipped: 'hat' } });
assert.strictEqual(junk.wallet, 0);
assert.strictEqual(junk.runs, 0);
assert.deepStrictEqual(junk.streak, { count: 2, last: -1, best: 2 }); // best streak is never below the current one
assert.deepStrictEqual(junk.missions, { day: -1, list: [], bonus: false });
assert.deepStrictEqual(junk.records, { best: 1000, days: { '20000': 400 } });
assert.deepStrictEqual(junk.skins, { owned: ['classic', 'gold'], equipped: 'classic' });
const good = Progress.defaults();
good.wallet = 1230; good.missions = { day: 3, list: Progress.pickMissions(3), bonus: true };
good.skins = { owned: ['classic', 'ice'], equipped: 'ice' };
assert.deepStrictEqual(Progress.sanitize(JSON.parse(JSON.stringify(good))), good);
console.log('sanitize ok');
assert.strictEqual(Progress.fmt(1234567), '1,234,567');
assert.strictEqual(Progress.fmt(999), '999');
console.log('ALL PASSED');
