// One-off patch: extension points in progress, level cosmetics, shared button dock.
const fs = require('fs');
const dir = __dirname + '/../scripts/';
const patch = (file, pairs) => {
    let a = fs.readFileSync(dir + file, 'utf8');
    pairs.forEach(([from, to]) => {
        if (!a.includes(from)) throw new Error(file + ' missing: ' + from.slice(0, 80));
        a = a.replace(from, to);
    });
    fs.writeFileSync(dir + file, a);
};

patch('progress.js', [
[`    { id: 'midnight', name: 'Midnight', price: 2000, diffuse: [0.06, 0.07, 0.14], emissive: [0.05, 0.55, 0.75] }
];`, `    { id: 'midnight', name: 'Midnight', price: 2000, diffuse: [0.06, 0.07, 0.14], emissive: [0.05, 0.55, 0.75] },
    { id: 'chrome', name: 'Chrome', level: 10, diffuse: [0.75, 0.78, 0.82], emissive: [0.15, 0.16, 0.2] },
    { id: 'aurora', name: 'Aurora', level: 20, diffuse: [0.3, 1, 0.75], emissive: [0.1, 0.45, 0.35] }
];`],
[`// Runner colours: streak colours come only from day 7 of the daily reward; the rest are in the shop.`,
 `// Runner colours: streak colours come only from day 7 of the daily reward, level colours only from
// reaching that level (levels script); the rest are in the shop.`],
[`        upgrades: {},                              // shop upgrade id -> level
        items: {}                                  // shop item id -> { count, use }
    };`, `        upgrades: {},                              // shop upgrade id -> level
        items: {},                                 // shop item id -> { count, use }
        xp: 0,                                     // all XP ever earned (levels script)
        level: 1,                                  // highest level whose reward has been given
        stats: {},                                 // lifetime counters (achievements script)
        feats: {},                                 // best single-run value per trophy
        achievements: {}                           // trophy id -> day it was unlocked
    };`],
[`    if (raw.items && typeof raw.items === 'object') {`, `    d.xp = Math.max(0, Math.floor(num(raw.xp, 0)));
    d.level = Math.max(1, Math.min(99, Math.floor(num(raw.level, 1))));
    var counters = function (src, dst) {
        if (!src || typeof src !== 'object') return;
        Object.keys(src).forEach(function (k) {
            var v = num(src[k], -1);
            if (/^[a-zA-Z0-9]{1,24}$/.test(k) && v >= 0) dst[k] = v;
        });
    };
    counters(raw.stats, d.stats);
    counters(raw.feats, d.feats);
    counters(raw.achievements, d.achievements);
    if (raw.items && typeof raw.items === 'object') {`],
[`Progress.prototype.toast = function (text, kind) {`, `// Adds coins to the bank that also show as earned on this run's crash screen.
Progress.prototype.earn = function (amount) {
    this.data.wallet += amount;
    this.run.earned += amount;
};

// Other scripts add lines to the start ('ready') or crash ('over') screen: fn(run) returns HTML or ''.
Progress.prototype.addSection = function (panel, fn, scope) {
    this._sections[panel].push([fn, scope]);
};

Progress.prototype._sectionHtml = function (panel) {
    var run = this.run;
    return this._sections[panel].map(function (s) { return s[0].call(s[1], run) || ''; }).join('');
};

Progress.prototype.toast = function (text, kind) {`],
[`    this.run = this._newRun();
    this._timers = [];`, `    this.run = this._newRun();
    this._timers = [];
    this._sections = { ready: [], over: [] };`],
[`    this.data.wallet += run.coins;
    this.data.runs++;
    this._save();`, `    this.data.wallet += run.coins;
    this.data.runs++;
    // Other scripts settle up (XP, trophies) before the save and the crash screen.
    this.app.fire('progress:runOver', run);
    this._save();`],
[`        '<div class="nr-runline">' + dist + ' · +' + Progress.fmt(run.coins + run.earned) + ' coins · bank <b>' + Progress.fmt(this.data.wallet) + '</b></div>' +
        this._missionHead('Daily missions')`, `        '<div class="nr-runline">' + dist + ' · +' + Progress.fmt(run.coins + run.earned) + ' coins · bank <b>' + Progress.fmt(this.data.wallet) + '</b></div>' +
        this._sectionHtml('over') + this._missionHead('Daily missions')`],
[`        '</div>' + this._missionHead("Today's missions") + this._missionRows() + '</div>';`,
 `        '</div>' + this._sectionHtml('ready') + this._missionHead("Today's missions") + this._missionRows() + '</div>';`]
]);

patch('trail.js', [
[`// Trail styles, sold in the shop (Style tab).`, `// Trail styles: sold in the shop (Style tab), or unlocked by reaching a level (levels script).`],
[`    { id: 'rainbow', name: 'Rainbow', price: 2500, rainbow: true }
];`, `    { id: 'rainbow', name: 'Rainbow', price: 2500, rainbow: true },
    { id: 'plasma', name: 'Plasma', level: 5, color: [0.7, 0.8, 1] },
    { id: 'ember', name: 'Ember', level: 15, color: [1, 0.35, 0.08] }
];`]
]);

patch('shop.js', [
[`        else if (price === null) { cls += ' is-locked'; note = 'Day 7 reward'; act = ''; }`,
 `        else if (price === null) { cls += ' is-locked'; note = def.level ? 'Level ' + def.level : 'Day 7 reward'; act = ''; }`],
[`// Price of the next step for sale, or null if there's nothing to buy (owned, maxed, streak-only).`,
 `// Price of the next step for sale, or null if there's nothing to buy (owned, maxed, streak or level only).`],
[`    '.nr-shop-btn { position: fixed; left: 16px; bottom: 16px; z-index: 10; display: none;`, `    '.nr-shop-btn { display: none;`],
[`    this._button.addEventListener('click', function () { self.open(); });
    document.body.appendChild(this._button);`, `    this._button.addEventListener('click', function () { self.open(); });
    this.game.getDock().appendChild(this._button);`]
]);

patch('gameManager.js', [
[`    '.nr-slot:empty { display: none; }',`, `    '.nr-slot:empty { display: none; }',
    '.nr-dock { position: absolute; left: 16px; bottom: 16px; display: flex; gap: 8px; }',
    '.nr-dock > * { pointer-events: auto; }',`],
[`    '<div class="nr-warn" data-warn>CAREFUL!</div>',`, `    '<div class="nr-warn" data-warn>CAREFUL!</div>',
    '<div class="nr-dock" data-dock></div>',`],
[`// Returning players get a one-line controls reminder instead of the full list.`, `// Bottom-left row where other scripts put their buttons (shop, trophies).
GameManager.prototype.getDock = function () {
    return this._hud.dock;
};

// Returning players get a one-line controls reminder instead of the full list.`],
[`        warn: q('[data-warn]'),`, `        warn: q('[data-warn]'),
        dock: q('[data-dock]'),`]
]);
console.log('patched');
