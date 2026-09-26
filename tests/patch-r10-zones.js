// One-off patch: zone unlocks (R10) in zones.js, plus the profile, level and trophy-page hooks.
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

patch('zones.js', [
[`Zones.KEYS = ['rail', 'lane', 'fog', 'ambient', 'sun'];`, `// Zones that join the rotation once unlocked: by reaching a level or a best distance, whichever first.
Zones.EXTRA = [
    { id: 'bloodmoon', name: 'Blood Moon', level: 3, distance: 2000, rail: [1, 0.15, 0.2], lane: [1, 0.55, 0.3], fog: [0.16, 0.02, 0.03], ambient: [0.16, 0.05, 0.05], sun: [1, 0.5, 0.45] },
    { id: 'goldrush', name: 'Gold Rush', level: 7, distance: 3000, rail: [1, 0.8, 0.2], lane: [1, 0.95, 0.6], fog: [0.14, 0.1, 0.02], ambient: [0.15, 0.12, 0.05], sun: [1, 0.9, 0.6] },
    { id: 'deepspace', name: 'Deep Space', level: 12, distance: 4000, rail: [0.55, 0.3, 1], lane: [0.3, 0.6, 1], fog: [0.02, 0.01, 0.06], ambient: [0.05, 0.04, 0.1], sun: [0.6, 0.6, 1] },
    { id: 'vaporwave', name: 'Vaporwave', level: 18, distance: 5000, rail: [1, 0.45, 0.75], lane: [0.45, 1, 0.95], fog: [0.12, 0.06, 0.16], ambient: [0.12, 0.08, 0.14], sun: [1, 0.8, 0.95] }
];
Zones.KEYS = ['rail', 'lane', 'fog', 'ambient', 'sun'];

Zones.isUnlocked = function (def, data) {
    return data.level >= def.level || data.records.best >= def.distance;
};

Zones.unlockText = function (def) {
    return 'Level ' + def.level + ' or ' + String(def.distance).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',') + ' m';
};

// A run's zone order: the first zone is always the scene's own (index 0); after that every other
// available zone in a shuffled order that comes from the track seed, so a challenge track has the
// same order for everyone.
Zones.order = function (available, seed) {
    var rest = available.slice(1);
    var rand = Spawner.random(Spawner.hash(seed, 0x7a0e5));
    for (var i = rest.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var t = rest[i];
        rest[i] = rest[j];
        rest[j] = t;
    }
    return [available[0]].concat(rest);
};`],
[`    this.palettes = Zones.PALETTES.map(function (p, i) {
        return i === 0 ? Object.assign({ name: p.name }, this.original) : p;
    }, this);`, `    this.palettes = Zones.PALETTES.map(function (p, i) {
        return i === 0 ? Object.assign({ name: p.name }, this.original) : p;
    }, this).concat(Zones.EXTRA);
    this.progress = this.entity.script.progress || null;
    this.spawner = this.app.root.findByName('Pool').script.spawner;
    this.sequence = [0];
    this.newUnlocks = []; // unlocked since the run started, for the crash screen`],
[`    this.reset();
    this.app.on('game:reset', this.reset, this);
    this.on('destroy', this._onDestroy, this);
};`, `    this.reset();
    this.app.on('game:reset', this.reset, this);
    this.app.on('game:start', this._onStart, this);
    this.app.on('level:up', this._checkUnlocks, this);
    this.app.on('progress:runOver', this._checkUnlocks, this);
    this.on('destroy', this._onDestroy, this);
};

// After every script has set up (progress comes later in the order): the crash-screen line, and
// anything already reached (level or records from before these zones existed) unlocks.
Zones.prototype.postInitialize = function () {
    if (this.progress) this.progress.addSection('over', this._overLine, this);
    this._checkUnlocks();
    this.newUnlocks = [];
};

// Palette indices available to this player: the five base zones plus unlocked extras.
Zones.prototype._available = function () {
    var owned = this.progress ? this.progress.data.zones : [];
    var list = [];
    for (var i = 0; i < this.palettes.length; i++) {
        if (i < Zones.PALETTES.length || owned.indexOf(this.palettes[i].id) !== -1) list.push(i);
    }
    return list;
};

Zones.prototype._onStart = function () {
    this.sequence = Zones.order(this._available(), this.spawner.seed);
    this.newUnlocks = [];
};

// Palette index for a zone number (0 = the first 'length' metres).
Zones.prototype._paletteFor = function (n) {
    var seq = this.sequence;
    return n === 0 || seq.length < 2 ? seq[0] : seq[1 + (n - 1) % (seq.length - 1)];
};

Zones.prototype._checkUnlocks = function () {
    if (!this.progress) return;
    var data = this.progress.data;
    Zones.EXTRA.forEach(function (def) {
        if (data.zones.indexOf(def.id) !== -1 || !Zones.isUnlocked(def, data)) return;
        data.zones.push(def.id);
        this.newUnlocks.push(def.id);
        console.log('[zone] unlocked ' + def.name);
        this.progress.toast('New zone unlocked: ' + def.name, 'gold');
        this.app.fire('zone:unlock', def.id);
    }, this);
};

Zones.prototype._overLine = function () {
    if (!this.newUnlocks.length) return '';
    var names = this.newUnlocks.map(function (id) {
        return Zones.EXTRA.filter(function (d) { return d.id === id; })[0].name;
    });
    return '<div class="nr-tro-line">New zone unlocked: <b>' + names.join('</b>, <b>') + '</b></div>';
};

// Rows for the Trophies page: every zone, unlocked or with what unlocks it.
Zones.prototype.pageRows = function () {
    var data = this.progress.data;
    var rgb = function (c) { return 'rgb(' + c.map(function (v) { return Math.round(Math.min(1, v) * 255); }).join(',') + ')'; };
    return this.palettes.map(function (p, i) {
        var open = i < Zones.PALETTES.length || data.zones.indexOf(p.id) !== -1;
        return '<div class="nr-tro-row' + (open ? ' is-done' : '') + '" style="--c: ' + rgb(p.rail) + '"><i></i>' +
            '<div class="nr-tro-main"><b>' + p.name + '</b><small>' + (open ? 'In your runs' : 'Unlocks at ' + Zones.unlockText(p)) + '</small></div>' +
            '<span class="nr-tro-val">' + (open ? '✓' : '') + '</span></div>';
    }).join('');
};`],
[`    var zone = Math.floor(this.game.distance / this.length) % this.palettes.length;
    if (zone !== this.zone) {
        this.zone = zone;`, `    var number = Math.floor(this.game.distance / this.length);
    if (number !== this.number) {
        this.number = number;
        var zone = this._paletteFor(number);
        this.zone = zone;`],
[`Zones.prototype.reset = function () {
    this.zone = 0;`, `Zones.prototype.reset = function () {
    this.zone = 0;
    this.number = 0;`],
[`    this.app.off('game:reset', this.reset, this);
    this._apply(this.original);`, `    this.app.off('game:reset', this.reset, this);
    this.app.off('game:start', this._onStart, this);
    this.app.off('level:up', this._checkUnlocks, this);
    this.app.off('progress:runOver', this._checkUnlocks, this);
    this._apply(this.original);`]
]);

patch('progress.js', [
[`        feats: {},                                 // best single-run value per trophy
        achievements: {}                           // trophy id -> day it was unlocked
    };`, `        feats: {},                                 // best single-run value per trophy
        achievements: {},                          // trophy id -> day it was unlocked
        zones: [],                                 // unlocked extra colour zones (zones script)
        challenges: {}                             // challenge code -> best distance on it (challenge script)
    };`],
[`    counters(raw.achievements, d.achievements);`, `    counters(raw.achievements, d.achievements);
    if (Array.isArray(raw.zones)) {
        d.zones = raw.zones.filter(function (z, i, all) { return id(z) && all.indexOf(z) === i; });
    }
    if (raw.challenges && typeof raw.challenges === 'object') {
        Object.keys(raw.challenges).slice(-20).forEach(function (k) {
            var v = num(raw.challenges[k], -1);
            if (/^[0-9a-z]{1,7}(-[0-9a-z]{1,7}){3}$/.test(k) && v >= 0) d.challenges[k] = Math.floor(v);
        });
    }`]
]);

patch('levels.js', [
[`    else if (level % 3 === 0) r.item = (level / 3) % 2 ? 'shield' : 'booster';
    return r;
};`, `    else if (level % 3 === 0) r.item = (level / 3) % 2 ? 'shield' : 'booster';
    var zone = typeof Zones !== 'undefined' && Zones.EXTRA.filter(function (z) { return z.level === level; })[0];
    if (zone) r.zone = zone; // unlocked by the zones script, listed here so the reward shows it
    return r;
};`],
[`    if (r.item) parts.push(Shop.ITEMS.filter(function (i) { return i.id === r.item; })[0].name);
    return parts.join(', ');`, `    if (r.item) parts.push(Shop.ITEMS.filter(function (i) { return i.id === r.item; })[0].name);
    if (r.zone) parts.push(r.zone.name + ' zone');
    return parts.join(', ');`],
[`    if (r.unlock) return r.unlock.def.name + (r.unlock.kind === 'skin' ? ' colour' : ' trail');
    if (r.item)`, `    if (r.unlock) return r.unlock.def.name + (r.unlock.kind === 'skin' ? ' colour' : ' trail');
    if (r.zone) return r.zone.name + ' zone';
    if (r.item)`]
]);

patch('achievements.js', [
[`        '<div class="nr-tro-h">Over time</div>' + rows(function (d) { return d.stat; }) + '</div></div>';`,
 `        '<div class="nr-tro-h">Over time</div>' + rows(function (d) { return d.stat; }) +
        (this.zones ? '<div class="nr-tro-h">Colour zones</div>' + this.zones.pageRows() : '') + '</div></div>';`],
[`    this.levels = this.entity.script.levels;`, `    this.levels = this.entity.script.levels;
    this.zones = this.entity.script.zones || null;`]
]);

patch('audioFx.js', [
[`    on('trophy:unlock', function (id, tier) { this.play('trophy', tier); });`, `    on('trophy:unlock', function (id, tier) { this.play('trophy', tier); });
    on('zone:unlock', function () { this.play('reward'); });
    on('challenge:beaten', function () { this.play('record'); });`]
]);
console.log('patched');
