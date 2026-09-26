var Markers = pc.createScript('markers');

Markers.SHOW_Z = -150;     // a gate appears this far down the road
Markers.HIDE_Z = 12;       // and goes once it's behind the camera
Markers.MIN_RECORD = 60;   // records shorter than this get no gate
Markers.MIN_GAP = 25;      // gates closer than this to a more important one are left out
Markers.HEIGHT = 5.4;      // above tunnel roofs and sky platforms
Markers.HALF_WIDTH = 5.1;  // posts stand outside the rails and tunnel walls
Markers.THICKNESS = 0.22;
Markers.KINDS = {
    best: { label: 'BEST', color: [1, 0.78, 0.22] },
    yesterday: { label: 'YESTERDAY', color: [0.3, 0.9, 1] },
    friend: { label: 'FRIEND', color: [1, 0.3, 0.84] }
};

// Record gates (R11): a glowing arch over the road at the player's best distance, one at
// yesterday's best and, on a challenge, one at the friend's distance, each with a floating label.
// Passing one fires 'record:passed' (kind, distance).
// Decoration only: the spawner doesn't know about them and nothing collides with them.
Markers.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.progress = this.entity.script.progress;
    this.camera = this.app.root.findByName('Camera');
    this._pos = new pc.Vec3();
    this._screen = new pc.Vec3();

    this._style = document.createElement('style');
    this._style.textContent = '.nr-gate { position: fixed; left: 0; top: 0; z-index: 9; display: none; padding: 2px 9px; border-radius: 6px; ' +
        'background: var(--c); box-shadow: 0 0 14px var(--c); color: #1a0620; pointer-events: none; white-space: nowrap; ' +
        'font: 800 12px/1.35 "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; letter-spacing: 0.12em; }';
    document.head.appendChild(this._style);
    this.gates = [this._buildGate('best'), this._buildGate('yesterday'), this._buildGate('friend')];

    this.app.on('game:start', this._onStart, this);
    this.app.on('game:reset', this._hideAll, this);
    this.on('destroy', this._onDestroy, this);
};

Markers.prototype._buildGate = function (kind) {
    var k = Markers.KINDS[kind];
    var mat = new pc.StandardMaterial();
    mat.diffuse.set(0, 0, 0);
    mat.emissive.set(k.color[0], k.color[1], k.color[2]);
    mat.update();

    var root = new pc.Entity('RecordGate-' + kind);
    var part = function (name, x, y, sx, sy) {
        var e = new pc.Entity(name);
        e.addComponent('render', { type: 'box', material: mat, castShadows: false, receiveShadows: false });
        e.setLocalPosition(x, y, 0);
        e.setLocalScale(sx, sy, Markers.THICKNESS);
        root.addChild(e);
    };
    var h = Markers.HEIGHT;
    var w = Markers.HALF_WIDTH;
    var t = Markers.THICKNESS;
    part('PostL', -w, h / 2, t, h);
    part('PostR', w, h / 2, t, h);
    part('Beam', 0, h, w * 2 + t, t);
    root.enabled = false;
    this.app.root.addChild(root);

    var label = document.createElement('div');
    label.className = 'nr-gate';
    label.style.setProperty('--c', 'rgb(' + k.color.map(function (v) { return Math.round(v * 255); }).join(',') + ')');
    document.body.appendChild(label);
    return { kind: kind, entity: root, material: mat, label: label, at: 0, passed: false };
};

// Targets are fixed for the whole run: the records as they stood when it started.
Markers.prototype._onStart = function () {
    var t = this.progress ? this.progress.getTargets() : { best: 0, yesterday: 0 };
    // A challenge's target gets its own gate; the player's own gates give way when they'd crowd it.
    var challenge = this.entity.script.challenge;
    var friend = challenge && challenge.active ? challenge.active.distance : 0;
    var clear = function (d) { return !friend || Math.abs(d - friend) >= Markers.MIN_GAP; };
    var best = t.best >= Markers.MIN_RECORD && clear(t.best) ? t.best : 0;
    var yesterday = t.yesterday >= Markers.MIN_RECORD && Math.abs(t.yesterday - t.best) >= Markers.MIN_GAP && clear(t.yesterday) ? t.yesterday : 0;
    this._arm(this.gates[0], best);
    this._arm(this.gates[1], yesterday);
    this._arm(this.gates[2], friend);
    if (best || yesterday || friend) {
        console.log('[markers] gates: best ' + (best || 'none') + ' m, yesterday ' + (yesterday || 'none') + ' m, friend ' + (friend || 'none') + ' m');
    }
};

Markers.prototype._arm = function (gate, at) {
    gate.at = at;
    gate.passed = false;
    gate.label.textContent = Markers.KINDS[gate.kind].label + ' ' + String(at).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' m';
};

Markers.prototype._hideAll = function () {
    this.gates.forEach(function (g) {
        g.at = 0;
        g.entity.enabled = false;
        g.label.style.display = 'none';
    });
};

Markers.prototype.update = function () {
    var state = this.game.state;
    if (state === 'ready') return;
    var playing = state === 'playing';
    for (var i = 0; i < this.gates.length; i++) {
        var g = this.gates[i];
        if (!g.at) continue;
        var z = this.game.distance - g.at;
        var show = z > Markers.SHOW_Z && z < Markers.HIDE_Z;
        if (g.entity.enabled !== show) g.entity.enabled = show;
        if (show) g.entity.setLocalPosition(0, 0, z);
        if (playing && !g.passed && this.game.distance >= g.at) {
            g.passed = true;
            console.log('[markers] passed the ' + g.kind + ' gate (' + g.at + ' m)');
            this.app.fire('record:passed', g.kind, g.at);
        }
        this._placeLabel(g, show && playing, z);
    }
};

// The label floats above the middle of the beam, in screen space.
Markers.prototype._placeLabel = function (g, visible, z) {
    var el = g.label;
    if (visible) {
        this._pos.set(0, Markers.HEIGHT + 0.5, z);
        this.camera.camera.worldToScreen(this._pos, this._screen);
        var rect = this.app.graphicsDevice.canvas.getBoundingClientRect();
        visible = this._screen.z > 0 && this._screen.y > 0 && this._screen.y < rect.height;
        if (visible) el.style.transform = 'translate(' + Math.round(rect.left + this._screen.x) + 'px, ' + Math.round(rect.top + this._screen.y) + 'px) translate(-50%, -100%)';
    }
    var display = visible ? 'block' : 'none';
    if (el.style.display !== display) el.style.display = display;
};

Markers.prototype._onDestroy = function () {
    this.app.off('game:start', this._onStart, this);
    this.app.off('game:reset', this._hideAll, this);
    this.gates.forEach(function (g) {
        g.entity.destroy();
        g.material.destroy();
        g.label.remove();
    });
    this._style.remove();
};
