var Zones = pc.createScript('zones');

Zones.attributes.add('length', { type: 'number', default: 500, title: 'Zone Length (m)' });
Zones.attributes.add('blendTime', { type: 'number', default: 2, title: 'Blend Time (s)' });

Zones.MAX_DT = 1 / 20;
// Zone 0 is the scene as authored (read at start); the rest recolour the neon: rail glow
// (MatRail), lane and edge glow (MatLane), fog, ambient light and sunlight.
Zones.PALETTES = [
    { name: 'Neon Dusk' },
    { name: 'Cyber Teal', rail: [0.1, 1, 0.8], lane: [1, 0.35, 0.9], fog: [0.02, 0.1, 0.12], ambient: [0.05, 0.13, 0.13], sun: [0.6, 1, 0.95] },
    { name: 'Sunset Drive', rail: [1, 0.45, 0.1], lane: [1, 0.85, 0.4], fog: [0.2, 0.06, 0.08], ambient: [0.18, 0.08, 0.08], sun: [1, 0.75, 0.6] },
    { name: 'Toxic', rail: [0.5, 1, 0.1], lane: [0.2, 1, 0.6], fog: [0.04, 0.11, 0.02], ambient: [0.08, 0.14, 0.05], sun: [0.8, 1, 0.6] },
    { name: 'Ice', rail: [0.45, 0.75, 1], lane: [0.9, 0.95, 1], fog: [0.1, 0.13, 0.2], ambient: [0.1, 0.12, 0.2], sun: [0.85, 0.9, 1] }
];
// Zones that join the rotation once unlocked: by reaching a level or a best distance, whichever first.
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
    return 'Level ' + def.level + ' or ' + String(def.distance).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' m';
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
};

// Every `length` metres the scene blends into the next palette, and the zone name flashes up.
// The changes are runtime-only and are put back when the run resets or the script is destroyed.
Zones.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    var find = function (app, name) {
        var asset = app.assets.find(name, 'material');
        return asset && asset.resource;
    };
    this.railMat = find(this.app, 'MatRail');
    this.laneMat = find(this.app, 'MatLane');
    this.sun = this.app.root.findByName('Sun');

    var scene = this.app.scene;
    this.original = {
        rail: this._arr(this.railMat.emissive),
        lane: this._arr(this.laneMat.emissive),
        fog: this._arr(scene.fog.color),
        ambient: this._arr(scene.ambientLight),
        sun: this._arr(this.sun.light.color)
    };
    this.palettes = Zones.PALETTES.map(function (p, i) {
        return i === 0 ? Object.assign({ name: p.name }, this.original) : p;
    }, this).concat(Zones.EXTRA);
    this.progress = this.entity.script.progress || null;
    this.spawner = this.app.root.findByName('Pool').script.spawner;
    this.sequence = [0];
    this.newUnlocks = []; // unlocked since the run started, for the crash screen

    this._buildHud();
    this.reset();
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
};

Zones.prototype._arr = function (c) {
    return [c.r, c.g, c.b];
};

Zones.prototype.reset = function () {
    this.zone = 0;
    this.number = 0;
    this.t = 1;
    this.from = this.palettes[0];
    this.current = this._copy(this.palettes[0]);
    this._apply(this.current);
};

Zones.prototype._copy = function (p) {
    var out = {};
    Zones.KEYS.forEach(function (k) { out[k] = p[k].slice(); });
    return out;
};

Zones.prototype.update = function (dt) {
    if (this.game.state !== 'playing') return;
    var number = Math.floor(this.game.distance / this.length);
    if (number !== this.number) {
        this.number = number;
        var zone = this._paletteFor(number);
        this.zone = zone;
        this.from = this._copy(this.current);
        this.t = 0;
        var p = this.palettes[zone];
        console.log('[zone] ' + (Math.floor(this.game.distance / this.length) + 1) + ': ' + p.name + ' at ' + Math.floor(this.game.distance) + ' m');
        this.app.fire('zone:change', zone, p.name);
        this._toast(p);
    }
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + Math.min(dt, Zones.MAX_DT) / this.blendTime);
    var s = this.t * this.t * (3 - 2 * this.t);
    var to = this.palettes[this.zone];
    var from = this.from;
    var cur = this.current;
    Zones.KEYS.forEach(function (k) {
        for (var i = 0; i < 3; i++) cur[k][i] = from[k][i] + (to[k][i] - from[k][i]) * s;
    });
    this._apply(cur);
};

Zones.prototype._apply = function (c) {
    this.railMat.emissive.set(c.rail[0], c.rail[1], c.rail[2]);
    this.railMat.update();
    this.laneMat.emissive.set(c.lane[0], c.lane[1], c.lane[2]);
    this.laneMat.update();
    this.app.scene.fog.color.set(c.fog[0], c.fog[1], c.fog[2]);
    this.app.scene.ambientLight.set(c.ambient[0], c.ambient[1], c.ambient[2]);
    this.sun.light.color = new pc.Color(c.sun[0], c.sun[1], c.sun[2]);
};

// ---- HUD: the zone name, in the zone's rail colour

Zones.HUD_CSS = [
    '.nr-zone { position: fixed; top: 30%; left: 50%; z-index: 10; transform: translateX(-50%); opacity: 0; pointer-events: none; white-space: nowrap; text-align: center; font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; color: var(--c); text-shadow: 0 0 18px var(--c); }',
    '.nr-zone small { display: block; font-size: 13px; font-weight: 700; letter-spacing: 0.4em; opacity: 0.85; }',
    '.nr-zone b { display: block; font-size: clamp(26px, 6vw, 42px); font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }',
    '.nr-zone.is-on { animation: nr-zone 2.4s ease-out; }',
    '@keyframes nr-zone { 0% { opacity: 0; transform: translate(-50%, 12px); } 15% { opacity: 1; transform: translate(-50%, 0); } 75% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -10px); } }'
].join('\n');

Zones.prototype._buildHud = function () {
    this._style = document.createElement('style');
    this._style.textContent = Zones.HUD_CSS;
    document.head.appendChild(this._style);
    this._el = document.createElement('div');
    this._el.className = 'nr-zone';
    document.body.appendChild(this._el);
};

Zones.prototype._toast = function (p) {
    var c = p.rail;
    var el = this._el;
    el.style.setProperty('--c', 'rgb(' + c.map(function (v) { return Math.round(Math.min(1, v) * 255); }).join(',') + ')');
    el.innerHTML = '<small>ZONE ' + (Math.floor(this.game.distance / this.length) + 1) + '</small><b>' + p.name + '</b>';
    el.classList.remove('is-on');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('is-on');
};

Zones.prototype._onDestroy = function () {
    this.app.off('game:reset', this.reset, this);
    this.app.off('game:start', this._onStart, this);
    this.app.off('level:up', this._checkUnlocks, this);
    this.app.off('progress:runOver', this._checkUnlocks, this);
    this._apply(this.original);
    this._el.remove();
    this._style.remove();
};
