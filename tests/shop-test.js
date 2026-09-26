const fs = require('fs');
const assert = require('assert');
const read = f => fs.readFileSync(__dirname + '/../scripts/' + f, 'utf8');
const pc = { createScript: function () { const S = function () {}; S.attributes = { add: function () {} }; return S; },
  math: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } };
const { Progress, Trail, Shop } = new Function('pc', read('progress.js') + read('trail.js') + read('shop.js') + '\nreturn { Progress, Trail, Shop };')(pc);

// Saved shop data: shape-checked, unknown fields dropped, sane limits.
const d = Progress.sanitize({ wallet: 900,
  trails: { owned: ['cyan', 'cyan', 'none', 'bad id!', 7], equipped: 'cyan' },
  upgrades: { magnet: 2, shield: 99, junk: -1, 'x y': 3 },
  items: { shield: { count: 3, use: false }, booster: { count: -4 }, bad: 5 } });
assert.deepStrictEqual(d.trails, { owned: ['none', 'cyan'], equipped: 'cyan' });
assert.deepStrictEqual(d.upgrades, { magnet: 2, shield: 10 });
assert.deepStrictEqual(d.items, { shield: { count: 3, use: false }, booster: { count: 0, use: true } });
assert.deepStrictEqual(Progress.sanitize({ trails: { owned: ['pink'], equipped: 'gold' } }).trails, { owned: ['none', 'pink'], equipped: 'none' });
console.log('sanitize shop fields ok');

// Streak colours stay out of the shop; day 7 still hands them out in order.
assert.deepStrictEqual(Progress.SKINS.filter(s => s.streak).map(s => s.id), ['gold', 'magenta', 'ice']);
assert.strictEqual(Progress.rewardFor(7, ['classic', 'lime', 'crimson']).skin.id, 'gold');
assert.deepStrictEqual(Progress.rewardFor(7, ['classic', 'gold', 'magenta', 'ice', 'lime']), { coins: 750 });

// Prices
const p = Progress.defaults();
assert.strictEqual(Shop.price(p, 'upgrade', 'magnet'), 250);
p.upgrades.magnet = 4;
assert.strictEqual(Shop.price(p, 'upgrade', 'magnet'), 4000);
p.upgrades.magnet = 5;
assert.strictEqual(Shop.price(p, 'upgrade', 'magnet'), null);
p.upgrades.magnet = 10; // corrupt/over-max level still reads as maxed
assert.strictEqual(Shop.price(p, 'upgrade', 'magnet'), null);
assert.strictEqual(Shop.price(p, 'item', 'shield'), 150);
assert.strictEqual(Shop.price(p, 'item', 'nope'), null);
assert.strictEqual(Shop.price(p, 'skin', 'lime'), 600);
assert.strictEqual(Shop.price(p, 'skin', 'gold'), null);      // streak only
assert.strictEqual(Shop.price(p, 'skin', 'classic'), null);   // owned
p.skins.owned.push('lime');
assert.strictEqual(Shop.price(p, 'skin', 'lime'), null);
assert.strictEqual(Shop.price(p, 'trail', 'rainbow'), 2500);
assert.strictEqual(Shop.price(p, 'trail', 'none'), null);
console.log('prices ok');

// Badge: only for something new (upgrade/colour/trail), not items.
const q = Progress.defaults();
q.wallet = 200;
assert.strictEqual(Shop.canAffordNew(q), false); // only items (150/200) affordable
q.wallet = 250;
assert.strictEqual(Shop.canAffordNew(q), true);  // magnet level 1
Shop.UPGRADES.forEach(u => { q.upgrades[u.id] = 5; });
q.wallet = 399;
assert.strictEqual(Shop.canAffordNew(q), false);
q.wallet = 400;
assert.strictEqual(Shop.canAffordNew(q), true);  // cyan trail
console.log('badge ok');

// Trail rainbow colours are valid
for (let h = 0; h < 1; h += 0.05) Trail.hue(h).forEach(v => assert.ok(v >= 0 && v <= 1));
assert.deepStrictEqual(Trail.hue(0), [1, 0, 0]);
console.log('ALL SHOP TESTS PASSED');
