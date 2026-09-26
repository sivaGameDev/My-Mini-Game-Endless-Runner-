var Spawner = pc.createScript('spawner');

Spawner.attributes.add('laneWidth', { type: 'number', default: 2.2, title: 'Lane Width' });
Spawner.attributes.add('firstRowZ', { type: 'number', default: -36, title: 'First Row Z', description: 'Where the first row of obstacles sits at the start of a run' });
Spawner.attributes.add('spawnZ', { type: 'number', default: -130, title: 'Spawn Z', description: 'Rows are kept filled out to this distance ahead' });
Spawner.attributes.add('despawnZ', { type: 'number', default: 12, title: 'Despawn Z' });
Spawner.attributes.add('minGapTime', { type: 'number', default: 0.85, title: 'Min Gap (s)', description: 'Shortest travel time between rows, so gaps widen as speed rises' });
Spawner.attributes.add('maxGapTime', { type: 'number', default: 1.35, title: 'Max Gap (s)' });
Spawner.attributes.add('barStartDistance', { type: 'number', default: 60, title: 'Bars After (m)', description: 'Overhead bars only appear once the run has covered this distance' });
Spawner.attributes.add('barChance', { type: 'number', default: 0.3, title: 'Bar Chance', description: 'Share of blocked lanes that get an overhead bar' });
Spawner.attributes.add('stripStartDistance', { type: 'number', default: 80, title: 'Boost/Goo After (m)' });
Spawner.attributes.add('stripChance', { type: 'number', default: 0.1, title: 'Boost/Goo Row Chance', description: 'Share of rows with cyan boost strips and green goo' });
Spawner.attributes.add('padStartDistance', { type: 'number', default: 100, title: 'Pads After (m)' });
Spawner.attributes.add('padChance', { type: 'number', default: 0.12, title: 'Pad Row Chance', description: 'Share of rows that are a jump pad in front of a tall block' });
Spawner.attributes.add('padVelocity', { type: 'number', default: 14, title: 'Pad Launch Speed', description: 'With gravity 26 this peaks about 3.8 units up, well over a tall block' });
Spawner.attributes.add('shifterStartDistance', { type: 'number', default: 150, title: 'Shifting Blocks After (m)' });
Spawner.attributes.add('shifterChance', { type: 'number', default: 0.08, title: 'Shifting Block Chance', description: 'Share of rows with a block that slides into the next lane' });
Spawner.attributes.add('platformStartDistance', { type: 'number', default: 200, title: 'Platforms After (m)' });
Spawner.attributes.add('platformChance', { type: 'number', default: 0.12, title: 'Platform Row Chance', description: 'Share of rows that are a ramp-and-rooftop or a step platform' });
Spawner.attributes.add('rooftopHeight', { type: 'number', default: 2, title: 'Rooftop Height', description: 'Too high to jump onto: take the ramp' });
Spawner.attributes.add('stepHeight', { type: 'number', default: 1, title: 'Step Height', description: 'Low platforms you jump onto' });
Spawner.attributes.add('rampLength', { type: 'number', default: 7, title: 'Ramp Length' });
Spawner.attributes.add('crusherStartDistance', { type: 'number', default: 250, title: 'Crushers After (m)' });
Spawner.attributes.add('crusherChance', { type: 'number', default: 0.08, title: 'Crusher Chance', description: 'Share of rows with a block that drops onto a marked lane' });
Spawner.attributes.add('gapStartDistance', { type: 'number', default: 300, title: 'Gaps After (m)' });
Spawner.attributes.add('gapChance', { type: 'number', default: 0.1, title: 'Gap Row Chance', description: 'Share of rows that are holes in the road: in one or two lanes (dodge or jump) or across all three (jump)' });
Spawner.attributes.add('tunnelStartDistance', { type: 'number', default: 350, title: 'Tunnels After (m)' });
Spawner.attributes.add('tunnelChance', { type: 'number', default: 0.06, title: 'Tunnel Chance', description: 'Share of rows that are a tunnel: its low roof stops jumps, so only slide or dodge inside' });
Spawner.attributes.add('stonesStartDistance', { type: 'number', default: 400, title: 'Floating Stones After (m)' });
Spawner.attributes.add('stonesChance', { type: 'number', default: 0.08, title: 'Floating Stones Chance', description: 'Share of rows that are a chasm crossed on floating platforms' });
Spawner.attributes.add('crumbleChance', { type: 'number', default: 0.35, title: 'Crumbling Stone Share', description: 'Share of path stones (orange rim) that fall soon after you land' });
Spawner.attributes.add('skyStartDistance', { type: 'number', default: 450, title: 'Sky Platforms After (m)' });
Spawner.attributes.add('skyChance', { type: 'number', default: 0.06, title: 'Sky Platform Chance', description: 'Share of rows with a strong pad up to platforms floating high over the road' });
Spawner.attributes.add('powerUpStartDistance', { type: 'number', default: 150, title: 'Power-ups After (m)' });
Spawner.attributes.add('powerUpChance', { type: 'number', default: 0.07, title: 'Power-up Chance', description: 'Share of rows that put a power-up in the open lane' });
Spawner.attributes.add('magnetRange', { type: 'number', default: 14, title: 'Magnet Range' });
Spawner.attributes.add('coinSpin', { type: 'number', default: 180, title: 'Coin Spin (deg/s)' });

Spawner.MAX_DT = 1 / 20;

// Obstacle kinds: the Pool template to clone, the clone's scale and height, and its collision
// boxes as [offsetX, offsetY, halfX, halfY, halfZ] from the clone's position.
Spawner.KINDS = {
    // too tall to jump: change lane (or ride a pad over it)
    tall: { template: 'Obstacle', scale: [1.5, 2.4, 1.2], y: 1.2, boxes: [[0, 0, 0.75, 1.2, 0.6]] },
    // barrier: jump it
    low: { template: 'Obstacle', scale: [1.9, 0.55, 0.5], y: 0.275, boxes: [[0, 0, 0.95, 0.275, 0.25]] },
    // overhead beam (underside at 1.2) on two posts: slide under it
    bar: { template: 'Bar', scale: [1, 1, 1], y: 0, boxes: [[0, 1.35, 1.06, 0.15, 0.15], [-1, 0.75, 0.06, 0.75, 0.06], [1, 0.75, 0.06, 0.75, 0.06]] },
    // tall block that slides one lane over, arrow first
    shifter: { template: 'Shifter', scale: [1, 1, 1], y: 0, boxes: [[0, 1.2, 0.75, 1.2, 0.6]] },
    // block hanging high over a marked lane, dropped as you approach (box height follows the drop)
    crusher: { template: 'Crusher', scale: [1, 1, 1], y: 0, boxes: [[0, 0.8, 0.9, 0.8, 0.8]] }
};
Object.keys(Spawner.KINDS).forEach(function (name) {
    var def = Spawner.KINDS[name];
    def.name = name;
    def.maxHz = Math.max.apply(null, def.boxes.map(function (b) { return b[4]; }));
});

Spawner.POWER_TEMPLATES = { magnet: 'PowerMagnet', shield: 'PowerShield', multiplier: 'PowerMultiplier', doubleJump: 'PowerDoubleJump' };
Spawner.TEMPLATES = ['Obstacle', 'Bar', 'Shifter', 'Crusher', 'Coin', 'Pad', 'Ramp', 'Platform', 'Pit', 'Slab', 'CrumbleSlab',
    'Boost', 'Goo', 'Tunnel', 'PowerMagnet', 'PowerShield', 'PowerMultiplier', 'PowerDoubleJump'];

Spawner.COIN_SCALE = [0.75, 0.12, 0.75];
Spawner.COIN_Y = 1;
Spawner.COIN_LOW_Y = 0.55;     // under a bar: the coin's top stays below the beam
Spawner.POP_TIME = 0.25;
Spawner.PAD_HALF = [0.9, 0.8]; // half width, half depth
Spawner.PAD_LEAD = 0.5;        // seconds from pad to block: the block passes under the top of the arc
Spawner.LAND_ROOM = 0.6;       // seconds between landing (from a pad, off a platform, over a hole) and the next row
Spawner.SOLID_WIDTH = 2;       // ramps and platforms fill most of a lane
Spawner.PIT_FLOOR = -30;       // the "floor" inside a hole: nothing to stand on
Spawner.PIT_DEATH = -0.3;      // falling this far below the road is fatal (only possible over a hole)
Spawner.SLAB_TOP = 0.25;       // floating stones sit above the hole's black cover (y 0.05) so they stay visible
Spawner.SLAB_DEPTH = 0.5;
Spawner.BOB_AMP = 0.15;
Spawner.BOB_RATE = 3;          // radians per second
Spawner.CRUMBLE_SHAKE = 0.3;   // seconds after landing on a crumbling stone before it shakes...
Spawner.CRUMBLE_FALL = 0.85;   // ...and before it drops
Spawner.SKY_TOP = 4.2;         // sky platforms float above the camera's eye line, so you can see under them
Spawner.SKY_PAD_VELOCITY = 16; // a sky pad throws you about 4.9 units up
Spawner.SKY_REACH = 0.45;      // seconds after launch that the first sky platform begins
Spawner.SHIFT_LEAD = 1;        // seconds before reaching the runner that a shifting block moves
Spawner.SHIFT_WARN = 2.2;      // ...and that its arrow starts blinking
Spawner.SHIFT_TIME = 0.35;
Spawner.CRUSH_LEAD = 1.2;      // seconds before reaching the runner that a crusher drops
Spawner.CRUSH_HEIGHT = 9;
Spawner.CRUSH_GRAVITY = 60;
Spawner.TUNNEL_CEILING = 2.6;
Spawner.BOOST_LENGTH = 0.4;    // seconds of travel
Spawner.PICKUP_Y = 1.2;
Spawner.SHIELD_GRACE = 1;      // seconds without obstacle hits after the shield takes one
Spawner.STUMBLE_GRACE = 0.5;   // ...and after a stumble, while the runner bounces back
Spawner.CLOSE_CALL_TIME = 0.25; // an obstacle in your lane this close (in seconds of travel) that you then dodge

// Places rows of obstacles, strips, pads, ramps, platforms, holes, floating stones, tunnels, coins
// and power-ups ahead of the player by cloning the disabled templates under this entity, scrolls
// them with the track, tells the runner what it stands on and what is over its head, tests
// everything against its hitbox and reports tricks and close calls.
Spawner.prototype.initialize = function () {
    var game = this.app.root.findByName('Game');
    this.game = game.script.gameManager;
    this.powerUps = game.script.powerUps || null;
    this.runner = this.app.root.findByTag('player')[0].script.runnerController;

    this.templates = {};
    this.free = {};
    var self = this;
    Spawner.TEMPLATES.forEach(function (name) {
        self.templates[name] = self.entity.findByName(name);
        self.free[name] = [];
    });
    this.obstacles = []; // { entity, def, shift?, crush?, passed, danger }
    this.solids = [];    // { entity, template, kind: 'ramp' | 'platform' | 'slab' | 'high', x, h, bottom, len, ... }
    this.pits = [];      // { entity, w, len, stones, passed } holes in the road
    this.strips = [];    // { entity, kind: 'boost' | 'goo', len, used }
    this.tunnels = [];   // { entity, len }
    this.coins = [];     // entities
    this.popping = [];   // { entity, t } collected coins playing their pickup effect
    this.pads = [];      // { entity, used, v }
    this.pickups = [];   // { entity, type, phase, y }
    this.pulled = new WeakSet(); // coins the magnet dragged in from another lane
    this.parts = new WeakMap();  // clone -> its named children
    this.wedgeMesh = this._createWedgeMesh();
    this.clock = 0;

    this.app.on('game:reset', this.reset, this);
    this.on('destroy', function () {
        this.app.off('game:reset', this.reset, this);
        this.wedgeMesh.destroy();
    }, this);
};

Spawner.prototype.reset = function () {
    var self = this;
    this.obstacles.forEach(function (o) { self._release(o.def.template, o.entity); });
    this.solids.forEach(function (s) { self._release(s.template, s.entity); });
    this.pits.forEach(function (p) { self._release('Pit', p.entity); });
    this.strips.forEach(function (s) { self._release(s.kind === 'boost' ? 'Boost' : 'Goo', s.entity); });
    this.tunnels.forEach(function (t) { self._release('Tunnel', t.entity); });
    this.coins.forEach(function (c) { self._release('Coin', c); });
    this.popping.forEach(function (p) { self._release('Coin', p.entity); });
    this.pads.forEach(function (p) { self._release('Pad', p.entity); });
    this.pickups.forEach(function (p) { self._release(Spawner.POWER_TEMPLATES[p.type], p.entity); });
    [this.obstacles, this.solids, this.pits, this.strips, this.tunnels, this.coins, this.popping, this.pads, this.pickups]
        .forEach(function (list) { list.length = 0; });
    this.invulnerable = 0;
    this.pendingGap = 0;
    this.floorSolid = null;
    this.inGoo = false;

    this.lastRowZ = this.firstRowZ;
    this._spawnRow(this.lastRowZ, true);
    this.nextGap = this._gap();
    this._fill();
};

Spawner.prototype.update = function (dt) {
    if (this.game.state === 'paused') return;
    dt = Math.min(dt, Spawner.MAX_DT);
    this.clock += dt;

    var playing = this.game.state === 'playing';
    var step = this.game.getStep(dt);
    var speed = this.game.getSpeed();
    var spin = this.coinSpin * dt;
    var magnet = playing && this.powerUps && this.powerUps.isActive('magnet');
    var hb = this.runner.getHitbox();
    var i, e, p;

    if (playing && this.invulnerable > 0) this.invulnerable -= dt;

    for (i = this.obstacles.length - 1; i >= 0; i--) {
        var o = this.obstacles[i];
        p = o.entity.getLocalPosition();
        if (step) o.entity.setLocalPosition(p.x, p.y, p.z + step);
        if (o.shift) this._updateShifter(o, p, dt, speed);
        if (o.crush) this._updateCrusher(o, p, dt, speed);
        if (p.z - o.def.maxHz > this.despawnZ) {
            this._release(o.def.template, o.entity);
            this.obstacles.splice(i, 1);
        }
    }

    for (i = this.solids.length - 1; i >= 0; i--) {
        var s = this.solids[i];
        p = s.entity.getLocalPosition();
        var jx = 0;
        if (s.amp) {
            // Bobbing floating stone: its top rides up and down around its base height.
            s.phase += dt * Spawner.BOB_RATE;
            s.h = s.base + s.amp * Math.sin(s.phase);
            s.bottom = s.h - s.depth;
        }
        // crumble: null = solid stone, -1 = crumbling stone not yet stepped on, >= 0 = seconds since stepped on
        if (s.crumble !== null && s.crumble >= 0) {
            s.crumble += dt;
            if (s.crumble > Spawner.CRUMBLE_FALL) {
                if (!s.falling) {
                    s.falling = true;
                    s.vy = 0;
                    this.app.fire('stone:crumble');
                }
                s.vy += 30 * dt;
                s.h -= s.vy * dt;
                s.bottom = s.h - s.depth;
            } else if (s.crumble > Spawner.CRUMBLE_SHAKE) {
                jx = Math.sin(s.crumble * 90) * 0.06;
            }
        }
        s.entity.setLocalPosition(s.x + jx, s.kind === 'ramp' || s.kind === 'platform' ? 0 : s.h, p.z + step);
        if (p.z - s.len / 2 > this.despawnZ) {
            this._release(s.template, s.entity);
            this.solids.splice(i, 1);
        }
    }

    this._moveAll(this.pits, 'Pit', step, function (r) { return r.len / 2; });
    this._moveAll(this.tunnels, 'Tunnel', step, function (r) { return r.len / 2; });
    this._moveAll(this.pads, 'Pad', step, function () { return Spawner.PAD_HALF[1]; });
    for (i = this.strips.length - 1; i >= 0; i--) {
        var st = this.strips[i];
        p = st.entity.getLocalPosition();
        if (step) st.entity.setLocalPosition(p.x, p.y, p.z + step);
        if (st.kind === 'goo') {
            var parts = this._partsOf(st.entity);
            for (var b = 0; b < 3; b++) {
                var bub = parts['Bubble' + b];
                var bp = bub.getLocalPosition();
                bub.setLocalPosition(bp.x, 0.06 + 0.05 * Math.sin(this.clock * 3 + b * 2.1), bp.z);
            }
        }
        if (p.z - st.len / 2 > this.despawnZ) {
            this._release(st.kind === 'boost' ? 'Boost' : 'Goo', st.entity);
            this.strips.splice(i, 1);
        }
    }

    // rotate() re-derives the rotation from the scaled world matrix, so even a zero turn
    // nudges it by rounding error; only call it when there is a turn to apply.
    var pull = 1 - Math.exp(-12 * dt);
    for (i = this.coins.length - 1; i >= 0; i--) {
        e = this.coins[i];
        p = e.getLocalPosition();
        var x = p.x;
        var y = p.y;
        var z = p.z + step;
        // Magnet: coins in range ahead home in on the player's chest.
        if (magnet && z > -this.magnetRange && z < 1) {
            if (Math.abs(x - hb.x) > 1.2) this.pulled.add(e);
            x += (hb.x - x) * pull;
            y += (hb.y + 1 - y) * pull;
            z += (hb.z - z) * pull;
        }
        if (step || magnet) e.setLocalPosition(x, y, z);
        if (spin) e.rotate(0, spin, 0);
        if (z > this.despawnZ) {
            this._release('Coin', e);
            this.coins.splice(i, 1);
        }
    }

    for (i = this.popping.length - 1; i >= 0; i--) {
        var pop = this.popping[i];
        pop.t += dt;
        e = pop.entity;
        p = e.getLocalPosition();
        e.setLocalPosition(p.x, p.y + dt * 7, p.z + step);
        if (spin) e.rotate(0, spin * 4, 0);
        var k = Math.max(0, 1 - pop.t / Spawner.POP_TIME);
        e.setLocalScale(Spawner.COIN_SCALE[0] * k, Spawner.COIN_SCALE[1] * k, Spawner.COIN_SCALE[2] * k);
        if (pop.t >= Spawner.POP_TIME) {
            this._release('Coin', e);
            this.popping.splice(i, 1);
        }
    }

    for (i = this.pickups.length - 1; i >= 0; i--) {
        var pk = this.pickups[i];
        e = pk.entity;
        p = e.getLocalPosition();
        pk.phase += dt * 3;
        e.setLocalPosition(p.x, pk.y + Math.sin(pk.phase) * 0.15, p.z + step);
        if (spin) e.rotate(0, spin * 0.7, 0);
        if (p.z > this.despawnZ) {
            this._release(Spawner.POWER_TEMPLATES[pk.type], e);
            this.pickups.splice(i, 1);
        }
    }

    if (step) {
        this.lastRowZ += step;
        this._fill();
    }
    if (playing) {
        // Settle the runner on whatever it now stands on, and under whatever is over it, before testing for hits.
        this.runner.setFloor(this._floorUnder(hb));
        this.runner.setCeiling(this._ceilingOver(hb));
        var fs = this.floorSolid;
        if (fs && fs.crumble === -1 && this.runner.grounded && Math.abs(this.runner.y - fs.h) < 0.05) fs.crumble = 0;
        this._checkHits(step);
    }
};

// Scroll a list of simple records and drop the ones that have passed behind the camera.
Spawner.prototype._moveAll = function (list, template, step, halfLen) {
    for (var i = list.length - 1; i >= 0; i--) {
        var e = list[i].entity;
        var p = e.getLocalPosition();
        if (step) e.setLocalPosition(p.x, p.y, p.z + step);
        if (p.z - halfLen(list[i]) > this.despawnZ) {
            this._release(template, e);
            list.splice(i, 1);
        }
    }
};

// A shifting block shows an arrow toward the lane it will move into; the arrow blinks as it
// gets close, then the block slides over.
Spawner.prototype._updateShifter = function (o, p, dt, speed) {
    var sh = o.shift;
    var parts = this._partsOf(o.entity);
    var ahead = -p.z;
    if (!sh.started) {
        var warn = speed > 0 && ahead < speed * Spawner.SHIFT_WARN;
        var lit = !warn || Math.floor(this.clock * 8) % 2 === 0;
        parts.ArrowL.enabled = sh.to < sh.from && lit;
        parts.ArrowR.enabled = sh.to > sh.from && lit;
        if (speed > 0 && ahead < speed * Spawner.SHIFT_LEAD) {
            sh.started = true;
            this.app.fire('shifter:move', ahead);
        }
        return;
    }
    if (sh.t >= 1) return;
    sh.t = Math.min(1, sh.t + dt / Spawner.SHIFT_TIME);
    var s = sh.t * sh.t * (3 - 2 * sh.t);
    o.entity.setLocalPosition((sh.from + (sh.to - sh.from) * s) * this.laneWidth, p.y, p.z);
    if (sh.t === 1) {
        parts.ArrowL.enabled = false;
        parts.ArrowR.enabled = false;
    }
};

// A crusher hangs over its marked lane and drops as the runner approaches, landing well ahead.
Spawner.prototype._updateCrusher = function (o, p, dt, speed) {
    var c = o.crush;
    if (c.landed) return;
    if (!c.falling) {
        if (speed <= 0 || -p.z > speed * Spawner.CRUSH_LEAD) return;
        c.falling = true;
    }
    c.vy += Spawner.CRUSH_GRAVITY * dt;
    c.y = Math.max(0, c.y - c.vy * dt);
    this._partsOf(o.entity).Head.setLocalPosition(0, c.y, 0);
    if (c.y === 0) {
        c.landed = true;
        this.app.fire('crusher:land', -p.z);
    }
};

// ---- Surfaces

// Height of a solid's top at z = zq (zq inside its extent). A ramp rises from its near end.
Spawner.prototype._surface = function (s, cz, zq) {
    if (s.kind !== 'ramp') return s.h;
    var near = cz + s.len / 2;
    return s.h * pc.math.clamp((near - zq) / s.len, 0, 1);
};

// Top of the solid under the runner's footprint, or null if it is not under it. The step extends
// the test backward to where the solid was at the start of the frame.
Spawner.prototype._topUnder = function (s, hb, step) {
    var p = s.entity.getLocalPosition();
    if (Math.abs(s.x - hb.x) >= Spawner.SOLID_WIDTH / 2 + hb.halfWidth - 0.1) return null;
    var near = p.z + s.len / 2;
    var far = p.z - s.len / 2;
    if (near <= hb.z - hb.halfDepth || far - step >= hb.z + hb.halfDepth) return null;
    // A ramp is highest at the far edge of the footprint.
    return this._surface(s, p.z, Math.max(far, hb.z - hb.halfDepth));
};

// Over a hole: the runner's centre is inside its width and its whole footprint inside its length,
// so clipping an edge still counts as road.
Spawner.prototype._overPit = function (hb) {
    for (var i = 0; i < this.pits.length; i++) {
        var pit = this.pits[i];
        var p = pit.entity.getLocalPosition();
        if (Math.abs(hb.x - p.x) < pit.w / 2 - 0.1 &&
            p.z + pit.len / 2 > hb.z + hb.halfDepth && p.z - pit.len / 2 < hb.z - hb.halfDepth) return true;
    }
    return false;
};

// The road (or nothing, over a hole), raised by any solid under the runner. A floating platform
// only counts when the runner is not underneath it, and a falling stone never does.
// Remembers which solid gave the floor, so a crumbling stone knows it has been stepped on.
Spawner.prototype._floorUnder = function (hb) {
    var floor = this._overPit(hb) ? Spawner.PIT_FLOOR : 0;
    this.floorSolid = null;
    for (var i = 0; i < this.solids.length; i++) {
        var s = this.solids[i];
        if (s.falling || hb.y < s.bottom - 0.05) continue;
        var top = this._topUnder(s, hb, 0);
        if (top !== null && top > floor) {
            floor = top;
            this.floorSolid = s;
        }
    }
    return floor;
};

// A tunnel roof over the runner's footprint.
Spawner.prototype._ceilingOver = function (hb) {
    for (var i = 0; i < this.tunnels.length; i++) {
        var p = this.tunnels[i].entity.getLocalPosition();
        var half = this.tunnels[i].len / 2;
        if (p.z + half > hb.z - hb.halfDepth && p.z - half < hb.z + hb.halfDepth) return Spawner.TUNNEL_CEILING;
    }
    return Infinity;
};

// Whether any tunnel overlaps the stretch of road between z0 and z1 (for the camera).
Spawner.prototype.tunnelOver = function (z0, z1) {
    for (var i = 0; i < this.tunnels.length; i++) {
        var p = this.tunnels[i].entity.getLocalPosition();
        var half = this.tunnels[i].len / 2;
        if (p.z + half > z0 && p.z - half < z1) return true;
    }
    return false;
};

// ---- Hits

// A side hit right after a lane change is a stumble (bounce back, lose some speed) unless it is
// the second one in the warning window.
Spawner.prototype._sideHit = function () {
    if (!this.runner.canStumble()) return 'crash';
    if (!this.game.stumble()) return 'second';
    this.runner.stumble();
    this.invulnerable = Spawner.STUMBLE_GRACE;
    return 'stumble';
};

// Tests are swept along z (each object moved from z - step to z this frame) so a slow frame
// at top speed can't skip over a thin barrier or a pad.
Spawner.prototype._checkHits = function (step) {
    var hb = this.runner.getHitbox();
    var i, b, p, side;

    // Fell into a hole. The shield bounces the runner back out.
    if (!this.runner.grounded && hb.y < Spawner.PIT_DEATH) {
        if (this.powerUps && this.powerUps.consume('shield')) {
            this.runner.launch(this.padVelocity * 0.85);
            this.invulnerable = Spawner.SHIELD_GRACE;
            this.app.fire('runner:shielded', 'gap');
        } else {
            this.app.fire('runner:crash', null, 'gap');
            return;
        }
    }

    // Ramps and platforms: overlapping the solid part below the surface means you ran into its
    // front, or (already alongside it) into its side.
    for (i = 0; i < this.solids.length; i++) {
        var s = this.solids[i];
        if (s.falling) continue;
        var top = this._topUnder(s, hb, step);
        if (top === null || hb.y >= top - 0.05 || hb.y + hb.height <= s.bottom + 0.05) continue;
        if (this.invulnerable > 0) continue;
        if (this.powerUps && this.powerUps.consume('shield')) {
            // The shield throws the runner up on top instead.
            this.runner.standOn(top);
            this.invulnerable = Spawner.SHIELD_GRACE;
            this.app.fire('runner:shielded', s.kind);
            continue;
        }
        p = s.entity.getLocalPosition();
        side = p.z - step + s.len / 2 > hb.z - hb.halfDepth + 0.01 ? this._sideHit() : 'crash';
        if (side === 'stumble') return;
        this.app.fire('runner:crash', s.entity, side === 'second' ? 'second stumble' : s.kind);
        return;
    }

    if (this.invulnerable <= 0) {
        for (i = 0; i < this.obstacles.length; i++) {
            var o = this.obstacles[i];
            var boxes = o.def.boxes;
            var lift = o.crush ? o.crush.y : 0;
            p = o.entity.getLocalPosition();
            for (b = 0; b < boxes.length; b++) {
                var box = boxes[b];
                var cx = p.x + box[0];
                var cy = p.y + box[1] + lift;
                if (Math.abs(cx - hb.x) < box[2] + hb.halfWidth - 0.1 &&
                    p.z + box[4] > hb.z - hb.halfDepth && p.z - step - box[4] < hb.z + hb.halfDepth &&
                    hb.y < cy + box[3] - 0.05 && hb.y + hb.height > cy - box[3]) {
                    if (this.powerUps && this.powerUps.consume('shield')) {
                        // The shield takes the hit and knocks the obstacle away.
                        this._release(o.def.template, o.entity);
                        this.obstacles.splice(i, 1);
                        this.invulnerable = Spawner.SHIELD_GRACE;
                        this.app.fire('runner:shielded', o.def.name);
                        break;
                    }
                    side = p.z - step + box[4] > hb.z - hb.halfDepth + 0.01 ? this._sideHit() : 'crash';
                    if (side === 'stumble') return;
                    this.app.fire('runner:crash', o.entity, side === 'second' ? 'second stumble' : o.def.name);
                    return;
                }
            }
            if (this.invulnerable > 0) break;
        }
    }

    var onRoad = this.runner.grounded && Math.abs(hb.y) < 0.01;

    // Boost strips and goo, on the road only.
    var goo = false;
    if (onRoad) {
        for (i = 0; i < this.strips.length; i++) {
            var st = this.strips[i];
            p = st.entity.getLocalPosition();
            if (Math.abs(p.x - hb.x) < 0.95 &&
                p.z + st.len / 2 > hb.z - hb.halfDepth && p.z - step - st.len / 2 < hb.z + hb.halfDepth) {
                if (st.kind === 'goo') {
                    goo = true;
                } else if (!st.used) {
                    st.used = true;
                    this.game.boost();
                    this.app.fire('runner:boost');
                }
            }
        }
    }
    this.game.setGoo(goo);
    this.runner.setSticky(goo);
    if (goo && !this.inGoo) this.app.fire('runner:goo');
    this.inGoo = goo;

    // Pads fire when the runner is on the road over them.
    if (onRoad) {
        for (i = 0; i < this.pads.length; i++) {
            var pad = this.pads[i];
            if (pad.used) continue;
            p = pad.entity.getLocalPosition();
            if (Math.abs(p.x - hb.x) < Spawner.PAD_HALF[0] &&
                p.z + Spawner.PAD_HALF[1] > hb.z - hb.halfDepth && p.z - step - Spawner.PAD_HALF[1] < hb.z + hb.halfDepth) {
                pad.used = true;
                this.runner.launch(pad.v);
                this.app.fire('runner:pad', pad.v);
                break;
            }
        }
    }

    for (i = this.coins.length - 1; i >= 0; i--) {
        var c = this.coins[i];
        p = c.getLocalPosition();
        if (Math.abs(p.x - hb.x) < 0.8 &&
            p.z + 0.5 > hb.z - hb.halfDepth && p.z - step - 0.5 < hb.z + hb.halfDepth &&
            p.y > hb.y - 0.3 && p.y < hb.y + hb.height + 0.3) {
            this.coins.splice(i, 1);
            this.popping.push({ entity: c, t: 0 });
            this.app.fire('runner:coin', c, this.pulled.has(c));
        }
    }

    for (i = this.pickups.length - 1; i >= 0; i--) {
        var pk = this.pickups[i];
        p = pk.entity.getLocalPosition();
        if (Math.abs(p.x - hb.x) < 0.9 &&
            p.z + 0.6 > hb.z - hb.halfDepth && p.z - step - 0.6 < hb.z + hb.halfDepth &&
            p.y > hb.y - 0.4 && p.y < hb.y + hb.height + 0.4) {
            this.pickups.splice(i, 1);
            this._release(Spawner.POWER_TEMPLATES[pk.type], pk.entity);
            if (this.powerUps) this.powerUps.grant(pk.type);
            this.app.fire('runner:powerup', pk.type);
        }
    }

    this._trackPasses(hb);
};

// Tricks: getting past something in your own lane (jumping a barrier, sliding a bar, flying a
// block, clearing a hole or a stone chasm). Close calls: something was right in front of you in
// your lane and you dodged it at the last moment.
Spawner.prototype._trackPasses = function (hb) {
    var speed = this.game.getSpeed();
    var i, p, dx;
    for (i = 0; i < this.obstacles.length; i++) {
        var o = this.obstacles[i];
        if (o.passed) continue;
        p = o.entity.getLocalPosition();
        dx = Math.abs(p.x - hb.x);
        var near = p.z + o.def.maxHz;
        if (dx < 1 && -near < speed * Spawner.CLOSE_CALL_TIME) o.danger = true;
        if (p.z - o.def.maxHz <= hb.z + hb.halfDepth) continue;
        o.passed = true;
        if (dx < 1) this.app.fire('runner:trick', o.def.name === 'low' ? 'jump' : o.def.name === 'bar' ? 'slide' : 'fly');
        else if (o.danger) this.app.fire('runner:closecall', o.def.name);
    }
    for (i = 0; i < this.pits.length; i++) {
        var pit = this.pits[i];
        if (pit.passed) continue;
        p = pit.entity.getLocalPosition();
        if (p.z - pit.len / 2 <= hb.z + hb.halfDepth) continue;
        pit.passed = true;
        if (Math.abs(hb.x - p.x) < pit.w / 2) this.app.fire('runner:trick', pit.stones ? 'stones' : 'hole');
    }
};

// ---- Rows

Spawner.prototype._fill = function () {
    while (this.lastRowZ - this.nextGap >= this.spawnZ) {
        this.lastRowZ -= this.nextGap;
        this._spawnRow(this.lastRowZ, false);
        // Long rows (pads, platforms, holes, tunnels) ask for extra room before the next row.
        this.nextGap = Math.max(this._gap(), this.pendingGap);
        this.pendingGap = 0;
    }
};

Spawner.prototype._gap = function () {
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
};

// A blocked lane gets a bar (slide), a barrier (jump) or a tall block (dodge).
Spawner.prototype._pickKind = function () {
    if (this._barsAllowed() && Math.random() < this.barChance) return 'bar';
    return Math.random() < 0.35 ? 'low' : 'tall';
};

Spawner.prototype._chance = function (startDistance, chance) {
    return this.game.distance >= startDistance && Math.random() < chance;
};

// Every row leaves a way through: a free lane, or lanes you can jump, slide, climb or pad over.
Spawner.prototype._spawnRow = function (z, gentle) {
    var lanes = this._shuffledLanes();
    var d = pc.math.clamp(this.game.distance / 3000, 0, 1);
    var i, kind;

    if (!gentle) {
        if (this._chance(this.stonesStartDistance, this.stonesChance)) return this._spawnStonesRow(z, lanes);
        if (this._chance(this.gapStartDistance, this.gapChance)) return this._spawnGapRow(z, lanes);
        if (this._chance(this.tunnelStartDistance, this.tunnelChance)) return this._spawnTunnelRow(z);
        if (this._chance(this.skyStartDistance, this.skyChance)) return this._spawnSkyRow(z, lanes);
        if (this._chance(this.platformStartDistance, this.platformChance)) return this._spawnPlatformRow(z, lanes);
        if (this._chance(this.padStartDistance, this.padChance)) return this._spawnPadRow(z, lanes);
        if (this._chance(this.crusherStartDistance, this.crusherChance)) return this._spawnCrusherRow(z, lanes);
        if (this._chance(this.shifterStartDistance, this.shifterChance)) return this._spawnShifterRow(z, lanes);
        if (this._chance(this.stripStartDistance, this.stripChance)) return this._spawnStripRow(z, lanes);

        // A wall across all three lanes: each lane needs a jump or a slide.
        if (this.game.distance > 250 && Math.random() < 0.08 + 0.07 * d) {
            for (i = 0; i < 3; i++) {
                kind = this._barsAllowed() && Math.random() < 0.5 ? 'bar' : 'low';
                this._addObstacle(i - 1, z, kind);
                if (i - 1 === lanes[0]) this._addLaneCoins(i - 1, z, kind);
            }
            return;
        }
    }

    var roll = Math.random();
    var blocked = gentle ? 1 : (roll < 0.15 ? 0 : (roll < 0.62 - 0.25 * d ? 1 : 2));
    for (i = 0; i < blocked; i++) {
        kind = this._pickKind();
        this._addObstacle(lanes[i], z, kind);
        if (Math.random() < 0.5) this._addLaneCoins(lanes[i], z, kind);
    }
    var freeLane = lanes[blocked + Math.floor(Math.random() * (3 - blocked))];
    if (!gentle && this._chance(this.powerUpStartDistance, this.powerUpChance)) {
        this._addPickup(freeLane, z + 4);
    } else if (Math.random() < 0.7) {
        this._addCoinTrail(freeLane, z);
    }
};

// A pad in front of a tall block: the pad throws the runner over it along an arc of coins.
Spawner.prototype._spawnPadRow = function (z, lanes) {
    var lane = lanes[0];
    var speed = this._speedAt(z);
    var v = this.padVelocity;
    var g = this.runner.gravity;
    var airtime = 2 * v / g;
    var padZ = z + speed * Spawner.PAD_LEAD;

    this._addObstacle(lane, z, 'tall');
    this._addPad(lane, padZ, v);
    for (var t = 0.2; t < 1.05; t += 0.16) {
        this._addCoin(lane * this.laneWidth, v * t - 0.5 * g * t * t + 0.9, padZ - speed * t);
    }
    if (Math.random() < 0.5) this._addObstacle(lanes[1], z, 'tall');
    else if (Math.random() < 0.7) this._addCoinTrail(lanes[1], z);

    // The runner lands (airtime - PAD_LEAD) s past the block; keep the next row LAND_ROOM s beyond that.
    this.pendingGap = speed * (airtime - Spawner.PAD_LEAD + Spawner.LAND_ROOM);
};

// Platforms starting at z (their near end) in lanes[0]:
// - a ramp up onto a rooftop, sometimes with a second rooftop alongside to hop across to;
// - or a low step to jump onto.
// lanes[2] always stays open at ground level.
Spawner.prototype._spawnPlatformRow = function (z, lanes) {
    var speed = this._speedAt(z);
    var lane = lanes[0];
    var x = lane * this.laneWidth;
    var extent, height, i, len;

    if (Math.random() < 0.6) {
        height = this.rooftopHeight;
        var ramp = this.rampLength;
        len = pc.math.random(16, 30);
        this._addRamp(lane, z - ramp / 2, height, ramp);
        this._addPlatform(lane, z - ramp - len / 2, height, len);
        for (i = 0; i < 3; i++) {
            var f = (i + 0.5) / 3;
            this._addCoin(x, height * f + Spawner.COIN_Y, z - ramp * f);
        }
        for (var dz = 2; dz < len - 1; dz += 2.5) this._addCoin(x, height + Spawner.COIN_Y, z - ramp - dz);
        if (Math.random() < 0.5) {
            // A neighbouring rooftop from the top of the ramp: hop across on the roofs.
            var len2 = len * pc.math.random(0.5, 1);
            this._addPlatform(lanes[1], z - ramp - len2 / 2, height, len2);
        } else if (Math.random() < 0.6) {
            this._addObstacle(lanes[1], z, 'tall');
        }
        extent = ramp + len;
    } else {
        height = this.stepHeight;
        len = pc.math.random(10, 18);
        this._addPlatform(lane, z - len / 2, height, len);
        for (var sz = 1.5; sz < len - 1; sz += 2.5) this._addCoin(x, height + Spawner.COIN_Y, z - sz);
        if (Math.random() < 0.5) this._addObstacle(lanes[1], z, 'tall');
        extent = len;
    }
    if (Math.random() < 0.6) this._addCoinTrail(lanes[2], z);

    // Room to drop off the far end and settle before the next row.
    var fall = Math.sqrt(2 * height / this.runner.gravity);
    this.pendingGap = extent + speed * (fall + Spawner.LAND_ROOM);
};

// A hole starting at z (its near edge): across all three lanes (jump it, along an arc of coins),
// or in one or two lanes (dodge it or jump it). Its length scales with speed so a jump always clears it.
Spawner.prototype._spawnGapRow = function (z, lanes) {
    var speed = this._speedAt(z);
    var len = speed * pc.math.random(0.3, 0.42);
    var i;

    if (Math.random() < 0.4) {
        this._addPit(-1, 1, z - len / 2, len, false);
        var lane = lanes[0];
        for (i = 0; i <= 4; i++) {
            var f = i / 4;
            this._addCoin(lane * this.laneWidth, Spawner.COIN_Y + 1.2 * Math.sin(Math.PI * f), z + 1.5 - (len + 3) * f);
        }
    } else {
        var holes = lanes.slice(0, Math.random() < 0.6 ? 1 : 2).sort();
        if (holes.length === 2 && holes[1] - holes[0] === 1) {
            this._addPit(holes[0], holes[1], z - len / 2, len, false);
        } else {
            for (i = 0; i < holes.length; i++) this._addPit(holes[i], holes[i], z - len / 2, len, false);
        }
        if (Math.random() < 0.7) this._addCoinTrail(lanes[2], z);
    }
    this.pendingGap = len + speed * Spawner.LAND_ROOM;
};

// A long chasm crossed on floating stones. The first ones fill all three lanes, so the runner can
// step on from any lane; after that a single path of stones, separated by gaps short enough to
// jump, wanders between lanes. Some bob; some (orange rim) crumble soon after you land.
Spawner.prototype._spawnStonesRow = function (z, lanes) {
    var speed = this._speedAt(z);
    var cursor = z;
    var len, lane, i;

    var first = speed * pc.math.random(0.5, 0.7);
    for (lane = -1; lane <= 1; lane++) this._addSlab({ lane: lane, cz: cursor - first / 2, len: first });
    cursor -= first;

    lane = lanes[0];
    var count = 3 + Math.floor(Math.random() * 3);
    for (i = 0; i < count; i++) {
        cursor -= speed * pc.math.random(0.22, 0.3);                  // gap to jump
        len = speed * pc.math.random(0.4, 0.6);
        if (i > 0) lane = pc.math.clamp(lane + [-1, 0, 1][Math.floor(Math.random() * 3)], -1, 1);
        var bob = Math.random() < 0.3;
        var crumble = !bob && Math.random() < this.crumbleChance;
        var slab = this._addSlab({ lane: lane, cz: cursor - len / 2, len: len, bob: bob, crumble: crumble });
        this._addCoin(lane * this.laneWidth, slab.base + Spawner.COIN_Y, cursor - len * 0.3);
        this._addCoin(lane * this.laneWidth, slab.base + Spawner.COIN_Y, cursor - len * 0.7);
        cursor -= len;
    }
    cursor -= speed * pc.math.random(0.22, 0.3);                      // last jump, back onto the road

    var total = z - cursor;
    this._addPit(-1, 1, z - total / 2, total, true);
    this.pendingGap = total + speed * Spawner.LAND_ROOM;
};

// A block in lanes[0] that slides into a neighbouring lane a second before you reach it (its arrow
// shows which way). Half the time the third lane is blocked too, so the lane it leaves is the way through.
Spawner.prototype._spawnShifterRow = function (z, lanes) {
    var from = lanes[0];
    var to = from === 0 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    this._addObstacle(from, z, 'shifter', { to: to });
    var third = -from - to; // the lane that is neither
    if (Math.random() < 0.5) this._addObstacle(third, z, 'tall');
    else this._addCoinTrail(third, z);
};

// A crusher over lanes[0], marked on the road; sometimes a second obstacle in lanes[1].
Spawner.prototype._spawnCrusherRow = function (z, lanes) {
    this._addObstacle(lanes[0], z, 'crusher');
    if (Math.random() < 0.5) this._addObstacle(lanes[1], z, this._pickKind());
    else this._addCoinTrail(lanes[1], z);
    if (Math.random() < 0.6) this._addCoinTrail(lanes[2], z);
};

// Cyan boost strips (a burst of speed) and green goo (slows you, no jumping in it).
Spawner.prototype._spawnStripRow = function (z, lanes) {
    var speed = this._speedAt(z);
    var boost = speed * Spawner.BOOST_LENGTH;
    this._addStrip('boost', lanes[0], z - boost / 2, boost);
    for (var i = 0; i < 3; i++) this._addCoin(lanes[0] * this.laneWidth, Spawner.COIN_Y, z - boost * (0.2 + 0.3 * i));
    var goo = 0;
    if (Math.random() < 0.6) {
        goo = speed * pc.math.random(0.5, 0.8);
        this._addStrip('goo', lanes[1], z - goo / 2, goo);
    } else {
        this._addStrip('boost', lanes[1], z - boost / 2, boost);
    }
    if (Math.random() < 0.6) this._addCoinTrail(lanes[2], z);
    this.pendingGap = Math.max(boost, goo) + speed * Spawner.LAND_ROOM;
};

// A tunnel across all three lanes. Its roof (2.6 up) stops jumps, so inside there are only bars
// to slide under and blocks to dodge.
Spawner.prototype._spawnTunnelRow = function (z) {
    var speed = this._speedAt(z);
    var len = speed * pc.math.random(2.2, 3);
    this._addTunnel(z - len / 2, len);

    var row = z - speed * 0.6;
    while (row > z - len + speed * 0.3) {
        var lanes = this._shuffledLanes();
        var blocked = Math.random() < 0.5 ? 1 : 2;
        for (var i = 0; i < blocked; i++) {
            var kind = Math.random() < 0.5 ? 'bar' : 'tall';
            this._addObstacle(lanes[i], row, kind);
            if (kind === 'bar' && Math.random() < 0.5) this._addCoinsUnder(lanes[i], row);
        }
        if (Math.random() < 0.6) this._addCoinTrail(lanes[2], row);
        row -= speed * pc.math.random(0.85, 1.1);
    }
    this.pendingGap = len + speed * Spawner.LAND_ROOM;
};

// A strong pad up to platforms floating high over the road: a first one to land on, a gap, a
// second one (often a lane over) with a power-up on it, then a drop back to the road.
// Underneath, the road stays open.
Spawner.prototype._spawnSkyRow = function (z, lanes) {
    var speed = this._speedAt(z);
    var lane = lanes[0];
    var x = lane * this.laneWidth;
    var top = Spawner.SKY_TOP;
    var i;

    this._addPad(lane, z, Spawner.SKY_PAD_VELOCITY);
    var cursor = z - speed * Spawner.SKY_REACH;
    var len1 = speed * pc.math.random(1.2, 1.5);
    this._addSlab({ lane: lane, cz: cursor - len1 / 2, len: len1, top: top, kind: 'high' });
    for (i = 1; i <= 4; i++) this._addCoin(x, top + Spawner.COIN_Y, cursor - len1 * i / 5);
    cursor -= len1 + speed * 0.25;

    var lane2 = pc.math.clamp(lane + [-1, 0, 1][Math.floor(Math.random() * 3)], -1, 1);
    var len2 = speed * pc.math.random(0.8, 1.1);
    this._addSlab({ lane: lane2, cz: cursor - len2 / 2, len: len2, top: top, kind: 'high' });
    this._addPickup(lane2, cursor - len2 * 0.5, top + Spawner.PICKUP_Y);
    cursor -= len2;

    if (Math.random() < 0.7) this._addCoinTrail(lanes[1], z);
    var fall = Math.sqrt(2 * top / this.runner.gravity);
    this.pendingGap = (z - cursor) + speed * (fall + Spawner.LAND_ROOM);
};

Spawner.prototype._shuffledLanes = function () {
    var a = [-1, 0, 1];
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
};

Spawner.prototype._addObstacle = function (lane, z, kind, opts) {
    var def = Spawner.KINDS[kind];
    var e = this._take(def.template);
    e.setLocalScale(def.scale[0], def.scale[1], def.scale[2]);
    e.setLocalPosition(lane * this.laneWidth, def.y, z);
    var o = { entity: e, def: def, passed: false, danger: false };
    var parts;
    if (kind === 'shifter') {
        o.shift = { from: lane, to: opts.to, started: false, t: 0 };
        parts = this._partsOf(e);
        parts.ArrowL.enabled = opts.to < lane;
        parts.ArrowR.enabled = opts.to > lane;
    } else if (kind === 'crusher') {
        o.crush = { y: Spawner.CRUSH_HEIGHT, vy: 0, falling: false, landed: false };
        this._partsOf(e).Head.setLocalPosition(0, Spawner.CRUSH_HEIGHT, 0);
    }
    this.obstacles.push(o);
};

// cz is the centre of the ramp along z; it rises from 0 at its near end to h at its far end.
Spawner.prototype._addRamp = function (lane, cz, h, len) {
    var e = this._take('Ramp');
    var parts = this._partsOf(e);
    var w = Spawner.SOLID_WIDTH;
    var slope = Math.sqrt(len * len + h * h);
    var angle = Math.atan2(h, len) * pc.math.RAD_TO_DEG;
    parts.Wedge.setLocalScale(w, h, len);
    parts.RailL.setLocalPosition(-w / 2 + 0.05, h / 2 + 0.04, 0);
    parts.RailR.setLocalPosition(w / 2 - 0.05, h / 2 + 0.04, 0);
    parts.RailL.setLocalEulerAngles(angle, 0, 0);
    parts.RailR.setLocalEulerAngles(angle, 0, 0);
    parts.RailL.setLocalScale(0.1, 0.06, slope);
    parts.RailR.setLocalScale(0.1, 0.06, slope);
    var x = lane * this.laneWidth;
    e.setLocalPosition(x, 0, cz);
    this.solids.push({ entity: e, template: 'Ramp', kind: 'ramp', x: x, h: h, bottom: 0, len: len });
};

Spawner.prototype._addPlatform = function (lane, cz, h, len) {
    var e = this._take('Platform');
    var parts = this._partsOf(e);
    var w = Spawner.SOLID_WIDTH;
    parts.Body.setLocalPosition(0, h / 2, 0);
    parts.Body.setLocalScale(w, h, len);
    parts.EdgeL.setLocalPosition(-w / 2 + 0.05, h + 0.03, 0);
    parts.EdgeR.setLocalPosition(w / 2 - 0.05, h + 0.03, 0);
    parts.EdgeL.setLocalScale(0.1, 0.06, len);
    parts.EdgeR.setLocalScale(0.1, 0.06, len);
    parts.Front.setLocalPosition(0, h - 0.12, len / 2 + 0.02);
    var x = lane * this.laneWidth;
    e.setLocalPosition(x, 0, cz);
    this.solids.push({ entity: e, template: 'Platform', kind: 'platform', x: x, h: h, bottom: 0, len: len });
};

// A floating platform, rooted at its top surface: a stone over a chasm ('slab', optionally
// bobbing or crumbling) or a sky platform ('high'). Bobbing stones ride higher so their lowest
// point still clears the hole's black cover.
Spawner.prototype._addSlab = function (o) {
    var template = o.crumble ? 'CrumbleSlab' : 'Slab';
    var e = this._take(template);
    var parts = this._partsOf(e);
    var w = Spawner.SOLID_WIDTH;
    var d = Spawner.SLAB_DEPTH;
    parts.Body.setLocalPosition(0, -d / 2, 0);
    parts.Body.setLocalScale(w, d, o.len);
    parts.EdgeL.setLocalPosition(-w / 2 + 0.05, 0.03, 0);
    parts.EdgeR.setLocalPosition(w / 2 - 0.05, 0.03, 0);
    parts.EdgeL.setLocalScale(0.1, 0.06, o.len);
    parts.EdgeR.setLocalScale(0.1, 0.06, o.len);
    parts.Rim.setLocalScale(w + 0.04, 0.06, o.len + 0.04);
    var amp = o.bob ? Spawner.BOB_AMP : 0;
    var base = (o.top || Spawner.SLAB_TOP) + amp;
    var phase = Math.random() * Math.PI * 2;
    var top = base + amp * Math.sin(phase);
    var x = o.lane * this.laneWidth;
    e.setLocalPosition(x, top, o.cz);
    var slab = {
        entity: e, template: template, kind: o.kind || 'slab', x: x, h: top, bottom: top - d, depth: d, len: o.len,
        base: base, amp: amp, phase: phase, crumble: o.crumble ? -1 : null, falling: false, vy: 0
    };
    this.solids.push(slab);
    return slab;
};

// A hole across lanes fromLane..toLane: a black cover over the road with glowing lips.
Spawner.prototype._addPit = function (fromLane, toLane, cz, len, stones) {
    var e = this._take('Pit');
    var parts = this._partsOf(e);
    var w = (toLane - fromLane + 1) * this.laneWidth;
    parts.Hole.setLocalScale(w, 0.02, len);
    parts.LipFront.setLocalPosition(0, 0.07, len / 2);
    parts.LipBack.setLocalPosition(0, 0.07, -len / 2);
    parts.LipFront.setLocalScale(w + 0.15, 0.06, 0.15);
    parts.LipBack.setLocalScale(w + 0.15, 0.06, 0.15);
    parts.LipL.setLocalPosition(-w / 2, 0.07, 0);
    parts.LipR.setLocalPosition(w / 2, 0.07, 0);
    parts.LipL.setLocalScale(0.15, 0.06, len);
    parts.LipR.setLocalScale(0.15, 0.06, len);
    e.setLocalPosition((fromLane + toLane) / 2 * this.laneWidth, 0, cz);
    this.pits.push({ entity: e, w: w, len: len, stones: !!stones, passed: false });
};

Spawner.prototype._addStrip = function (kind, lane, cz, len) {
    var e = this._take(kind === 'boost' ? 'Boost' : 'Goo');
    var parts = this._partsOf(e);
    var i;
    if (kind === 'boost') {
        parts.Base.setLocalScale(1.8, 0.03, len);
        for (i = 0; i < 3; i++) parts['Chev' + i].setLocalPosition(0, 0.06, len * (0.3 - 0.3 * i));
    } else {
        parts.Pool.setLocalScale(1.9, 0.03, len);
        var spots = [0.3, -0.05, -0.35];
        for (i = 0; i < 3; i++) {
            var bp = parts['Bubble' + i].getLocalPosition();
            parts['Bubble' + i].setLocalPosition(bp.x, bp.y, len * spots[i]);
        }
    }
    e.setLocalPosition(lane * this.laneWidth, 0, cz);
    this.strips.push({ entity: e, kind: kind, len: len, used: false });
};

Spawner.prototype._addTunnel = function (cz, len) {
    var e = this._take('Tunnel');
    var parts = this._partsOf(e);
    ['Roof', 'WallL', 'WallR', 'LightL', 'LightR'].forEach(function (name) {
        var s = parts[name].getLocalScale();
        parts[name].setLocalScale(s.x, s.y, len);
    });
    ['ArchTop', 'ArchL', 'ArchR'].forEach(function (name) {
        var p = parts[name].getLocalPosition();
        parts[name].setLocalPosition(p.x, p.y, len / 2 + 0.02);
    });
    e.setLocalPosition(0, 0, cz);
    this.tunnels.push({ entity: e, len: len });
};

Spawner.prototype._addPad = function (lane, z, v) {
    var e = this._take('Pad');
    e.setLocalPosition(lane * this.laneWidth, 0, z);
    this.pads.push({ entity: e, used: false, v: v });
};

Spawner.prototype._addPickup = function (lane, z, y) {
    var types = Object.keys(Spawner.POWER_TEMPLATES);
    var type = types[Math.floor(Math.random() * types.length)];
    var e = this._take(Spawner.POWER_TEMPLATES[type]);
    var baseY = y || Spawner.PICKUP_Y;
    e.setLocalPosition(lane * this.laneWidth, baseY, z);
    e.setLocalEulerAngles(0, 0, 0);
    this.pickups.push({ entity: e, type: type, phase: Math.random() * Math.PI * 2, y: baseY });
};

// Coins that reward the right move through an obstacle: an arc over a barrier, a low line under a bar.
Spawner.prototype._addLaneCoins = function (lane, z, kind) {
    if (kind === 'low') this._addCoinArc(lane, z);
    else if (kind === 'bar') this._addCoinsUnder(lane, z);
};

// A line of coins leading up to the row, in a lane that is open. Stays short of the
// previous row (the minimum gap is 11) so coins never sit inside an obstacle.
Spawner.prototype._addCoinTrail = function (lane, z) {
    for (var i = 0; i < 4; i++) this._addCoin(lane * this.laneWidth, Spawner.COIN_Y, z + 3 + i * 2.2);
};

Spawner.prototype._addCoinArc = function (lane, z) {
    for (var i = -2; i <= 2; i++) {
        var t = i / 2;
        this._addCoin(lane * this.laneWidth, Spawner.COIN_Y + 1.1 * (1 - t * t), z + i * 1.2);
    }
};

Spawner.prototype._addCoinsUnder = function (lane, z) {
    for (var i = -1; i <= 1; i++) this._addCoin(lane * this.laneWidth, Spawner.COIN_LOW_Y, z + i * 1.4);
};

Spawner.prototype._addCoin = function (x, y, z) {
    var e = this._take('Coin');
    e.setLocalScale(Spawner.COIN_SCALE[0], Spawner.COIN_SCALE[1], Spawner.COIN_SCALE[2]);
    e.setLocalPosition(x, y, z);
    e.setLocalEulerAngles(90, 0, 0); // stand the disc up to face the player
    e.rotate(0, Math.random() * 360, 0);
    this.coins.push(e);
};

// ---- Ramp mesh: PlayCanvas has no wedge primitive, so build a unit one (x -0.5..0.5,
// z -0.5..0.5, rising from y 0 at z +0.5 to y 1 at z -0.5) and scale it per ramp.

Spawner.prototype._createWedgeMesh = function () {
    var A = [-0.5, 0, 0.5], B = [0.5, 0, 0.5], C = [0.5, 1, -0.5], D = [-0.5, 1, -0.5];
    var E = [0.5, 0, -0.5], F = [-0.5, 0, -0.5];
    var s = Math.SQRT1_2;
    // Counter-clockwise seen from outside; flat normals, so each face gets its own vertices.
    var faces = [
        { v: [A, B, C, D], n: [0, s, s] },  // slope
        { v: [E, F, D, C], n: [0, 0, -1] }, // back
        { v: [A, F, E, B], n: [0, -1, 0] }, // bottom
        { v: [B, E, C], n: [1, 0, 0] },     // right side
        { v: [A, D, F], n: [-1, 0, 0] }     // left side
    ];
    var positions = [];
    var normals = [];
    var indices = [];
    faces.forEach(function (f) {
        var base = positions.length / 3;
        f.v.forEach(function (v) {
            positions.push(v[0], v[1], v[2]);
            normals.push(f.n[0], f.n[1], f.n[2]);
        });
        indices.push(base, base + 1, base + 2);
        if (f.v.length === 4) indices.push(base, base + 2, base + 3);
    });
    var mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return mesh;
};

// The Ramp template's Wedge is a box placeholder in the editor; swap in the wedge, keeping its material.
Spawner.prototype._applyWedge = function (e) {
    var wedge = this._partsOf(e).Wedge;
    var render = wedge.render;
    var material = render.meshInstances && render.meshInstances.length ? render.meshInstances[0].material : null;
    if (!material && render.materialAssets.length) {
        var asset = this.app.assets.get(render.materialAssets[0]);
        material = asset && asset.resource;
    }
    render.meshInstances = [new pc.MeshInstance(this.wedgeMesh, material, wedge)];
};

Spawner.prototype._partsOf = function (e) {
    var parts = this.parts.get(e);
    if (!parts) {
        parts = {};
        e.children.forEach(function (c) { parts[c.name] = c; });
        this.parts.set(e, parts);
    }
    return parts;
};

// ---- Pooling: clones are made on demand and reused, never destroyed during play.

Spawner.prototype._take = function (template) {
    var e = this.free[template].pop();
    if (!e) {
        e = this.templates[template].clone();
        this.entity.addChild(e);
        if (template === 'Ramp') this._applyWedge(e);
    }
    e.enabled = true;
    return e;
};

Spawner.prototype._release = function (template, e) {
    e.enabled = false;
    this.free[template].push(e);
};
