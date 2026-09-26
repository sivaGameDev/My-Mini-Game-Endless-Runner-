var CameraFollow = pc.createScript('cameraFollow');

CameraFollow.attributes.add('followX', { type: 'number', default: 0.55, title: 'Follow X', description: "Share of the player's sideways movement the camera copies" });
CameraFollow.attributes.add('followY', { type: 'number', default: 0.35, title: 'Follow Y', description: 'Share of jump height the camera copies (it always rises fully with the ground: ramps, rooftops, sky platforms)' });
CameraFollow.attributes.add('smoothing', { type: 'number', default: 6, title: 'Smoothing', description: 'Higher follows tighter' });
CameraFollow.attributes.add('fovBoost', { type: 'number', default: 8, title: 'FOV Boost', description: 'Extra field of view at max speed' });
CameraFollow.attributes.add('tunnelHeight', { type: 'number', default: 2.2, title: 'Tunnel Camera Height', description: 'Camera height while a tunnel roof is between it and the runner (the roof is at 2.6)' });
CameraFollow.attributes.add('shakeTime', { type: 'number', default: 0.35, title: 'Shake Time', description: 'Roughly how long a full-strength shake takes to die away' });
CameraFollow.attributes.add('shakeAmount', { type: 'number', default: 0.3, title: 'Shake Amount' });
CameraFollow.attributes.add('motion', { type: 'number', default: 1, min: 0, max: 1.5, title: 'Motion', description: "Scales shake, landing dips and FOV kicks. 0 holds the camera steady; it is cut down automatically when the player's system asks for reduced motion" });
CameraFollow.attributes.add('lookAhead', { type: 'number', default: 4, title: 'Look Ahead', description: 'How much further down the road the camera aims at top speed' });
CameraFollow.attributes.add('pullBack', { type: 'number', default: 0.8, title: 'Speed Pull Back', description: 'How far the camera drops back and down at top speed' });
CameraFollow.attributes.add('cinematic', { type: 'boolean', default: true, title: 'Cinematic Start/End', description: 'Circle the runner on the start screen and after a crash, and swoop in when a run starts' });

CameraFollow.MAX_DT = 1 / 20;
CameraFollow.MIN_FOLLOW_Y = -0.5;   // don't follow the runner down a hole
CameraFollow.TUNNEL_LOOKAHEAD = 16; // start ducking this far before the runner reaches a tunnel
CameraFollow.SPEED_FOV = 20;        // degrees per unit of speed factor (boost widens, goo narrows)
CameraFollow.REDUCED_MOTION = 0.35; // motion scale when the system asks for reduced motion
CameraFollow.SLIDE_DROP = 0.45;     // camera drop while sliding
CameraFollow.SHAKE_ANGLE = 3;       // degrees of rotational shake at full trauma
CameraFollow.MAX_KICK = 12;         // cap on stacked FOV kicks (degrees)
CameraFollow.INTRO_TIME = 0.9;      // swoop from the start-screen shot into the chase
CameraFollow.OUTRO_TIME = 1.6;      // ease from the chase into the crash shot
CameraFollow.CINE_FOV = -6;         // start and crash shots are a little tighter

// Chase camera: keeps its editor placement as the base pose and moves around it.
// - Slides sideways with the runner, keeping its angle. Rises fully with the ground under the
//   runner (ramps, rooftops, sky platforms) so the view ahead on high ground matches the road;
//   jumps lift it only partway.
// - Speed: looks further ahead, drops back and down, widens the view; boost and goo push the FOV.
// - Reacts to play: dips on hard landings, drops low in a slide, ducks under tunnel roofs, punches
//   the FOV on pads, boosts and close calls, and shakes (position and rotation) on hits and crushers.
// - Start screen: circles the runner; a run starts with a swoop into the chase; a crash eases into
//   a slow orbit around the runner.
CameraFollow.prototype.initialize = function () {
    this.game = this.app.root.findByName('Game').script.gameManager;
    this.spawner = this.app.root.findByName('Pool').script.spawner;
    this.player = this.app.root.findByTag('player')[0];
    this.runner = this.player.script.runnerController;
    this.basePos = this.entity.getLocalPosition().clone();
    this.baseRot = this.entity.getLocalRotation().clone();
    this.baseFov = this.entity.camera.fov;

    // Where the editor placement looks at the road: the chase aims relative to this point.
    var fwd = this.entity.forward;
    var t = fwd.y < -0.01 ? -this.basePos.y / fwd.y : 15;
    this.baseFocus = this.basePos.clone().add(fwd.clone().mulScalar(t));

    this.reducedMotion = false;
    try {
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (err) {
        // No media queries: full motion.
    }

    this._pos = new pc.Vec3();
    this._focus = new pc.Vec3();
    this._cinePos = new pc.Vec3();
    this._cineFocus = new pc.Vec3();
    this._q = new pc.Quat();
    this._qx = new pc.Quat();
    this._qz = new pc.Quat();
    this.time = 0;

    var self = this;
    var on = function (event, fn) {
        self.app.on(event, fn, self);
        self._offs = self._offs || [];
        self._offs.push([event, fn]);
    };
    on('game:reset', this.reset);
    on('game:over', function () { this._addTrauma(0.7); });
    on('runner:crash', function (entity, kind) {
        this.overSide = this.runner.x > 0.1 ? -1 : 1; // circle round toward the middle of the road
        this.fellIn = kind === 'gap';                 // a fall stays on the chase view: the orbit would stare into the hole
    });
    on('runner:shielded', function () { this._addTrauma(0.45); });
    on('runner:stumble', function () { this._addTrauma(0.5); });
    on('runner:bonk', function () { this._addTrauma(0.2); });
    on('stone:crumble', function () { this._addTrauma(0.12); });
    on('crusher:land', function (distance) {
        if (distance < 30) this._addTrauma(0.45 * (1 - distance / 30));
    });
    on('runner:land', function (impact) {
        if (impact > 3) this.dip.v -= Math.min(impact, 20) * 0.12 * this._motion();
    });
    on('runner:pad', function () { this._kick(7); });
    on('runner:boost', function () { this._kick(5); });
    on('runner:closecall', function () { this._kick(3); });
    on('runner:airjump', function () { this._kick(2); });

    this.reset();
    this.on('destroy', function () {
        (this._offs || []).forEach(function (o) { self.app.off(o[0], o[1], self); });
    }, this);
};

// Runs before the runner has reset (and, at load, before the runner and game have set themselves up:
// the camera comes first in the hierarchy), so this only clears state and restores the editor pose.
// The next postUpdate snaps the follow onto the runner and places the camera.
CameraFollow.prototype.reset = function () {
    this.snap = true;
    this.ox = 0;      // sideways follow
    this.oy = 0;      // camera height follow
    this.fy = 0;      // aim point height follow
    this.ground = 0;  // height of the ground the runner is on (or last stood on)
    this.dip = { x: 0, v: 0 }; // landing dip
    this.slide = 0;
    this.duck = 0;        // 0 normal height .. 1 tunnel height
    this.trauma = 0;      // 0..1; shake strength is trauma squared
    this.kickTarget = 0;  // FOV kicks, decaying
    this.kick = 0;
    this.chase = this.cinematic ? 0 : 1; // 0 cinematic shot .. 1 chase
    this.overTime = 0;
    this.overSide = 1;
    this.fellIn = false;
    this.entity.setLocalPosition(this.basePos);
    this.entity.setLocalRotation(this.baseRot);
    this.entity.camera.fov = this.baseFov;
};

CameraFollow.prototype._motion = function () {
    return Math.max(0, this.motion) * (this.reducedMotion ? CameraFollow.REDUCED_MOTION : 1);
};

CameraFollow.prototype._addTrauma = function (amount) {
    this.trauma = Math.min(1, this.trauma + amount);
};

CameraFollow.prototype._kick = function (degrees) {
    this.kickTarget = Math.min(CameraFollow.MAX_KICK, this.kickTarget + degrees * this._motion());
};

// Spring toward a target (the landing dip).
CameraFollow.spring = function (s, target, omega, zeta, dt) {
    s.v += ((target - s.x) * omega * omega - s.v * 2 * zeta * omega) * dt;
    s.x += s.v * dt;
};

// Smooth wobble in roughly -1..1: three sines per seed so axes don't move in step.
CameraFollow.wave = function (t, seed) {
    return Math.sin(t + seed * 1.7) * 0.6 + Math.sin(t * 2.3 + seed * 3.1) * 0.3 + Math.sin(t * 4.7 + seed * 5.3) * 0.1;
};

CameraFollow.smooth = function (t) {
    t = pc.math.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
};

// After everything else has moved this frame.
CameraFollow.prototype.postUpdate = function (dt) {
    if (this.game.state === 'paused') return;
    dt = Math.min(dt, CameraFollow.MAX_DT);
    if (dt > 0) this._place(dt);
};

CameraFollow.prototype._place = function (dt) {
    var r = this.runner;
    var state = this.game.state;
    var playing = state === 'playing';
    var m = this._motion();
    var intensity = this.game.getIntensity();
    var factor = this.game.factor || 1;
    this.time += dt;

    // ---- Follow
    // Ground level: where the runner stands; in the air, a higher surface coming up underneath (landing
    // on a step or sky platform) or the runner dropping below it (off an edge; not down a hole).
    var ground = this.ground;
    if (r.grounded) ground = r.y;
    else if (r.y < ground) ground = r.y;
    else if (r.floor > ground && r.floor <= r.y + 0.01) ground = r.floor;
    this.ground = Math.max(ground, CameraFollow.MIN_FOLLOW_Y);
    var air = Math.max(0, r.y - this.ground);
    var camY = this.ground + air * this.followY;
    var aimY = this.ground + air * 0.5;
    var k = 1 - Math.exp(-this.smoothing * dt);
    if (this.snap) {
        this.snap = false;
        k = 1;
    }
    this.ox += (r.x * this.followX - this.ox) * k;
    this.oy += (camY - this.oy) * k;
    this.fy += (aimY - this.fy) * k;
    CameraFollow.spring(this.dip, 0, 11, 0.6, dt);

    this.slide += ((playing && r.isSliding() ? 1 : 0) - this.slide) * (1 - Math.exp(-10 * dt));

    // Duck under a tunnel roof that lies anywhere between the camera and just ahead of the runner.
    var inTunnel = this.spawner.tunnelOver(-CameraFollow.TUNNEL_LOOKAHEAD, this.basePos.z + 1);
    this.duck += ((inTunnel ? 1 : 0) - this.duck) * (1 - Math.exp(-5 * dt));

    // ---- Chase pose
    var speedIn = playing ? intensity : 0;
    var boost = Math.max(0, factor - 1);
    var baseY = this.basePos.y + (this.tunnelHeight - this.basePos.y) * this.duck;
    var t = this.time;
    var pos = this._pos.set(
        this.basePos.x + this.ox,
        baseY + this.oy * (1 - this.duck) - this.pullBack * 0.35 * speedIn - CameraFollow.SLIDE_DROP * this.slide + this.dip.x,
        this.basePos.z + this.pullBack * 0.6 * speedIn + boost * 2);
    var focus = this._focus.set(
        this.baseFocus.x + this.ox, // same sideways offset as the camera: it keeps its angle across lanes
        this.baseFocus.y + this.fy * (1 - this.duck) - 0.3 * this.slide + this.dip.x * 0.5,
        this.baseFocus.z - this.lookAhead * speedIn);
    var roll = 0;
    var fov = this.baseFov + this.fovBoost * speedIn + (factor - 1) * CameraFollow.SPEED_FOV;

    // ---- Cinematic shots and the blend between them and the chase
    if (this.cinematic) {
        var target = playing || (state === 'over' && this.fellIn) ? 1 : 0;
        var rate = target > this.chase ? 1 / CameraFollow.INTRO_TIME : 1 / CameraFollow.OUTRO_TIME;
        this.chase = target > this.chase ? Math.min(target, this.chase + rate * dt) : Math.max(target, this.chase - rate * dt);
        this.overTime = state === 'over' ? this.overTime + dt : 0;
        var w = CameraFollow.smooth(this.chase);
        if (w < 1) {
            this._cineShot(state);
            pos.lerp(this._cinePos, pos, w);
            focus.lerp(this._cineFocus, focus, w);
            roll *= w;
            fov += CameraFollow.CINE_FOV * (1 - w);
        }
    }

    // ---- Shake: trauma squared, smooth noise on position and rotation
    var shakePitch = 0;
    var shakeYaw = 0;
    if (this.trauma > 0) {
        var s = this.trauma * this.trauma * m;
        pos.x += this.shakeAmount * s * CameraFollow.wave(t * 22, 4);
        pos.y += this.shakeAmount * s * CameraFollow.wave(t * 25, 5);
        shakePitch = CameraFollow.SHAKE_ANGLE * s * CameraFollow.wave(t * 20, 6);
        shakeYaw = CameraFollow.SHAKE_ANGLE * s * CameraFollow.wave(t * 18, 7);
        roll += CameraFollow.SHAKE_ANGLE * s * CameraFollow.wave(t * 21, 8);
        this.trauma = Math.max(0, this.trauma - dt / (this.shakeTime * 2));
    }

    // ---- FOV kicks: quick attack, slower release
    this.kickTarget *= Math.exp(-3 * dt);
    this.kick += (this.kickTarget - this.kick) * (1 - Math.exp(-14 * dt));
    var cam = this.entity.camera;
    fov += this.kick;
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-this.smoothing * dt));

    // ---- Aim: yaw and pitch toward the focus point, then roll
    var dx = focus.x - pos.x;
    var dy = focus.y - pos.y;
    var dz = focus.z - pos.z;
    var yaw = Math.atan2(-dx, -dz) * pc.math.RAD_TO_DEG + shakeYaw;
    var pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * pc.math.RAD_TO_DEG + shakePitch;
    this._q.setFromAxisAngle(pc.Vec3.UP, yaw);
    this._qx.setFromAxisAngle(pc.Vec3.RIGHT, pitch);
    this._qz.setFromAxisAngle(pc.Vec3.BACK, roll);
    this._q.mul(this._qx).mul(this._qz);
    this.entity.setLocalPosition(pos);
    this.entity.setLocalRotation(this._q);
};

// Start screen: a slow sway around the runner from behind and to the side.
// After a crash: circle around to the runner's side and move in. (Not after falling down a hole.)
CameraFollow.prototype._cineShot = function (state) {
    var p = this.player.getLocalPosition();
    var t = this.time;
    var angle;
    var radius;
    var height;
    if (state === 'over') {
        var e = CameraFollow.smooth(this.overTime / 2.5);
        angle = this.overSide * (8 + 42 * e + this.overTime * 3);
        radius = 8 - 2.2 * e;
        height = 2.9 - 0.6 * e;
    } else {
        angle = 32 + 14 * Math.sin(t * 0.35);
        radius = 5.4;
        height = 1.9 + 0.15 * Math.sin(t * 0.5);
    }
    if (this.spawner.tunnelOver(p.z - 8, p.z + 8)) height = Math.min(height, this.tunnelHeight); // stay under a tunnel roof
    var a = angle * pc.math.DEG_TO_RAD;
    var groundY = Math.max(p.y, 0);
    this._cinePos.set(p.x + Math.sin(a) * radius, groundY + height, p.z + Math.cos(a) * radius);
    var aimY = state === 'over' ? p.y + 0.7 : 1.1;
    this._cineFocus.set(p.x, aimY, p.z - (state === 'over' ? 0 : 1.5));
};
