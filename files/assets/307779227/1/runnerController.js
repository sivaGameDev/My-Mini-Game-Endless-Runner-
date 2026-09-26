var RunnerController = pc.createScript('runnerController');

RunnerController.attributes.add('laneWidth', { type: 'number', default: 2.2, title: 'Lane Width' });
RunnerController.attributes.add('laneChangeRate', { type: 'number', default: 16, title: 'Lane Change Rate', description: 'Higher is snappier' });
RunnerController.attributes.add('jumpVelocity', { type: 'number', default: 8.5, title: 'Jump Velocity', description: 'With gravity 26 this clears about 1.4 units' });
RunnerController.attributes.add('gravity', { type: 'number', default: 26, title: 'Gravity' });
RunnerController.attributes.add('slideTime', { type: 'number', default: 0.6, title: 'Slide Time (s)' });
RunnerController.attributes.add('swipeThreshold', { type: 'number', default: 30, title: 'Swipe Threshold (px)' });

RunnerController.MAX_DT = 1 / 20;
RunnerController.JUMP_BUFFER = 0.12;   // a jump pressed just before landing still fires
RunnerController.START_LOCK = 0.15;    // ignore the key or tap that started the run
RunnerController.CRASH_TIME = 0.45;
RunnerController.STAND_HEIGHT = 1.9;
RunnerController.SLIDE_HEIGHT = 0.9;   // fits under overhead bars, whose underside is at 1.2
RunnerController.SLIDE_PITCH = 65;     // lean back, feet first
RunnerController.BLINK_TIME = 1;       // matches the spawner's grace period after a shielded hit
RunnerController.STEP_GROUND = 0.8;    // highest rise the runner steps onto while running (ramp joins, slow frames)
RunnerController.STEP_AIR = 0.35;      // how far below a ledge the feet can be mid-air and still land on it
RunnerController.STEP_DOWN = 0.35;     // a surface dropping away by this much (a bobbing platform, stepping off onto the road) keeps the runner on it
RunnerController.STUMBLE_WINDOW = 0.4; // clipping something within this long of starting a lane change is a stumble, not a crash

// Three lanes (-1, 0, 1). The player stays at z = 0 and the world scrolls toward +z.
// The spawner reports the floor under the runner each frame (road, holes, ramps, platform tops)
// and any ceiling over it (tunnels).
RunnerController.prototype.initialize = function () {
    var game = this.app.root.findByName('Game');
    this.game = game.script.gameManager;
    this.powerUps = game.script.powerUps || null;
    this.hitbox = { x: 0, y: 0, z: 0, halfWidth: 0.32, halfDepth: 0.25, height: RunnerController.STAND_HEIGHT };
    this.renders = ['Body', 'Head', 'Visor'].map(function (n) { return this.entity.findByName(n); }, this).filter(Boolean);

    this.app.keyboard.on(pc.EVENT_KEYDOWN, this._onKeyDown, this);

    var canvas = this.app.graphicsDevice.canvas;
    canvas.style.touchAction = 'none';
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);

    this.app.on('game:reset', this.reset, this);
    this.app.on('game:start', this._onStart, this);
    this.app.on('game:over', this._onOver, this);
    this.app.on('runner:shielded', this._onShielded, this);
    this.on('destroy', this._onDestroy, this);
};

RunnerController.prototype.reset = function () {
    this.lane = 0;
    this.prevLane = 0;
    this.laneChangeAge = 99; // seconds since the last lane change
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.floor = 0;
    this.ceiling = Infinity;
    this.grounded = true;
    this.sticky = false;     // standing in goo: no jumping
    this.jumpBuffer = 0;
    this.airJumped = false;  // double jump used since leaving the ground
    this.sliding = 0;        // seconds of slide left
    this.slideQueued = false;
    this.slidePose = 0;      // 0 standing .. 1 fully leaned back
    this.blink = 0;
    this.inputLock = 0;
    this.runTime = 0;
    this.crashTime = -1;
    this.pointer = null;
    this.entity.setLocalPosition(0, 0, 0);
    this.entity.setLocalEulerAngles(0, 0, 0);
    this._setVisible(true);
    this._syncHitbox();
};

RunnerController.prototype.getHitbox = function () {
    return this.hitbox;
};

RunnerController.prototype.isSliding = function () {
    return this.sliding > 0;
};

RunnerController.prototype.changeLane = function (dir) {
    if (!this._canAct()) return;
    var next = pc.math.clamp(this.lane + dir, -1, 1);
    if (next === this.lane) return;
    this.prevLane = this.lane;
    this.lane = next;
    this.laneChangeAge = 0;
    this.app.fire('runner:lane', dir);
};

// On the ground (or just before landing) this buffers a jump; in the air it spends the
// Double Jump power-up if active. Goo holds the runner down.
RunnerController.prototype.jump = function () {
    if (!this._canAct()) return;
    if (!this.grounded && !this.airJumped && this.powerUps && this.powerUps.isActive('doubleJump')) {
        this.airJumped = true;
        this.vy = this.jumpVelocity;
        this.slideQueued = false;
        this.app.fire('runner:airjump');
        return;
    }
    this.jumpBuffer = RunnerController.JUMP_BUFFER;
};

// Down: slide on the ground; in the air, drop fast and slide on landing.
RunnerController.prototype.down = function () {
    if (!this._canAct()) return;
    this.jumpBuffer = 0;
    if (this.grounded) {
        if (this.sliding <= 0) this.app.fire('runner:slide');
        this.sliding = this.slideTime;
    } else {
        this.vy = Math.min(this.vy, -this.jumpVelocity * 1.2);
        this.slideQueued = true;
    }
};

// Thrown upward by a jump pad (or by the shield out of a hole).
RunnerController.prototype.launch = function (vy) {
    if (this.crashTime >= 0) return;
    this.vy = vy;
    this.grounded = false;
    this.airJumped = false;
    this.jumpBuffer = 0;
    this.sliding = 0;
    this.slideQueued = false;
};

// A side hit is survivable right after a lane change: bounce back into the lane you came from.
RunnerController.prototype.canStumble = function () {
    return this.laneChangeAge < RunnerController.STUMBLE_WINDOW && this.prevLane !== this.lane && this.crashTime < 0;
};

RunnerController.prototype.stumble = function () {
    var back = this.prevLane;
    this.prevLane = this.lane;
    this.lane = back;
    this.laneChangeAge = 99;
    this.blink = RunnerController.BLINK_TIME;
    this.app.fire('runner:stumble');
};

RunnerController.prototype.setSticky = function (on) {
    this.sticky = on;
};

// The spawner reports the highest surface under the runner after moving the world. Small rises
// are stepped onto and small drops followed; a bigger rise is left alone so the spawner's hit test
// counts it as a crash, and a bigger drop (an edge, a hole) starts a fall.
RunnerController.prototype.setFloor = function (floor) {
    this.floor = floor;
    if (this.crashTime >= 0) return;
    if (floor > this.y) {
        var maxStep = this.grounded ? RunnerController.STEP_GROUND : RunnerController.STEP_AIR;
        if (floor - this.y <= maxStep) this.standOn(floor);
    } else if (this.grounded && floor < this.y - 0.001) {
        if (this.y - floor <= RunnerController.STEP_DOWN) {
            this.standOn(floor);
        } else {
            this.grounded = false;
            this.vy = 0;
        }
    }
};

// A roof over the runner (a tunnel) stops the head: a jump bonks and comes back down.
RunnerController.prototype.setCeiling = function (ceiling) {
    this.ceiling = ceiling;
    if (this.crashTime >= 0 || ceiling === Infinity) return;
    if (this.y + this.hitbox.height <= ceiling) return;
    this.y = Math.max(this.floor, ceiling - this.hitbox.height);
    if (this.vy > 0) {
        this.vy = 0;
        this.app.fire('runner:bonk');
    }
    this._syncHitbox();
    var p = this.entity.getLocalPosition();
    this.entity.setLocalPosition(p.x, this.y, p.z);
};

// Put the runner's feet on a surface at this height.
RunnerController.prototype.standOn = function (height) {
    var impact = -this.vy;
    this.y = height;
    this.floor = Math.max(this.floor, height);
    if (!this.grounded) this._land(impact);
    this._syncHitbox();
    var p = this.entity.getLocalPosition();
    this.entity.setLocalPosition(p.x, height, p.z);
};

RunnerController.prototype.update = function (dt) {
    dt = Math.min(dt, RunnerController.MAX_DT);
    if (dt <= 0) return;

    if (this.crashTime >= 0) {
        this._updateCrash(dt);
        return;
    }
    if (this.game.state !== 'playing') return;
    if (this.inputLock > 0) this.inputLock -= dt;
    this.laneChangeAge += dt;

    var prevX = this.x;
    var targetX = this.lane * this.laneWidth;
    this.x += (targetX - this.x) * (1 - Math.exp(-this.laneChangeRate * dt));
    if (Math.abs(targetX - this.x) < 0.001) this.x = targetX;

    if (this.jumpBuffer > 0) {
        if (this.grounded && !this.sticky) {
            this.vy = this.jumpVelocity;
            this.grounded = false;
            this.jumpBuffer = 0;
            this.sliding = 0; // jumping cancels a slide
            this.slideQueued = false;
            this.app.fire('runner:jump');
        } else {
            this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
        }
    }

    this._integrateAir(dt);
    if (this.sliding > 0) this.sliding = Math.max(0, this.sliding - dt);
    this._syncHitbox();

    if (this.blink > 0) {
        this.blink = Math.max(0, this.blink - dt);
        this._setVisible(this.blink === 0 || Math.floor(this.blink * 14) % 2 === 0);
    }

    // Pose: run bob on the ground, lean into lane changes, tilt with vertical speed in the air,
    // lean back feet-first while sliding.
    this.runTime += dt;
    this.slidePose += ((this.sliding > 0 ? 1 : 0) - this.slidePose) * (1 - Math.exp(-25 * dt));
    var bob = this.grounded ? Math.abs(Math.sin(this.runTime * (8 + this.game.speed * 0.3))) * 0.08 * (1 - this.slidePose) : 0;
    var lean = pc.math.clamp(-(this.x - prevX) / dt * 1.6, -16, 16);
    var pitch = this.grounded ? -6 : pc.math.clamp(-this.vy * 1.2, -12, 12);
    pitch += (RunnerController.SLIDE_PITCH - pitch) * this.slidePose;
    this.entity.setLocalPosition(this.x, this.y + bob, 0);
    this.entity.setLocalEulerAngles(pitch, 0, lean);
};

RunnerController.prototype._integrateAir = function (dt) {
    if (this.grounded) return;
    this.vy -= this.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= this.floor) {
        var impact = -this.vy;
        this.y = this.floor;
        this._land(impact);
    }
};

RunnerController.prototype._land = function (impact) {
    this.grounded = true;
    this.vy = 0;
    this.airJumped = false;
    if (this.crashTime < 0) this.app.fire('runner:land', impact || 0);
    if (this.slideQueued && this.crashTime < 0) {
        this.slideQueued = false;
        this.sliding = this.slideTime;
    }
};

// Knocked back: hop, slide back and tip over (or keep falling, down a hole).
RunnerController.prototype._updateCrash = function (dt) {
    this.crashTime += dt;
    var t = Math.min(this.crashTime / RunnerController.CRASH_TIME, 1);
    var ease = 1 - Math.pow(1 - t, 3);
    this._integrateAir(dt);
    this.entity.setLocalPosition(this.x, this.y, 1.4 * ease);
    this.entity.setLocalEulerAngles(80 * ease, 0, 0);
};

RunnerController.prototype._syncHitbox = function () {
    this.hitbox.x = this.x;
    this.hitbox.y = this.y;
    this.hitbox.height = this.sliding > 0 ? RunnerController.SLIDE_HEIGHT : RunnerController.STAND_HEIGHT;
};

RunnerController.prototype._setVisible = function (on) {
    for (var i = 0; i < this.renders.length; i++) this.renders[i].render.enabled = on;
};

RunnerController.prototype._canAct = function () {
    return this.game.state === 'playing' && this.inputLock <= 0 && this.crashTime < 0;
};

RunnerController.prototype._onStart = function () {
    this.inputLock = RunnerController.START_LOCK;
};

RunnerController.prototype._onOver = function () {
    this.crashTime = 0;
    this.sliding = 0;
    this.slideQueued = false;
    this.blink = 0;
    this._setVisible(true);
    this.vy = Math.max(this.vy, 4);
    this.grounded = false;
};

RunnerController.prototype._onShielded = function () {
    this.blink = RunnerController.BLINK_TIME;
};

// ---- Input

RunnerController.prototype._onKeyDown = function (e) {
    if (e.event.repeat) return;
    var k = e.key;
    if (k === pc.KEY_LEFT || k === pc.KEY_A) this.changeLane(-1);
    else if (k === pc.KEY_RIGHT || k === pc.KEY_D) this.changeLane(1);
    else if (k === pc.KEY_UP || k === pc.KEY_W || k === pc.KEY_SPACE) this.jump();
    else if (k === pc.KEY_DOWN || k === pc.KEY_S) this.down();
    else return;
    e.event.preventDefault();
};

// Swipes (touch or mouse drag): one action per press, decided once the pointer passes the threshold.
RunnerController.prototype._onPointerDown = function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false };
};

RunnerController.prototype._onPointerMove = function (e) {
    var p = this.pointer;
    if (!p || p.used || e.pointerId !== p.id) return;
    var dx = e.clientX - p.x;
    var dy = e.clientY - p.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < this.swipeThreshold) return;
    p.used = true;
    if (Math.abs(dx) > Math.abs(dy)) this.changeLane(dx > 0 ? 1 : -1);
    else if (dy < 0) this.jump();
    else this.down();
};

RunnerController.prototype._onPointerUp = function (e) {
    if (this.pointer && e.pointerId === this.pointer.id) this.pointer = null;
};

RunnerController.prototype._onDestroy = function () {
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    var canvas = this.app.graphicsDevice.canvas;
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    canvas.removeEventListener('pointermove', this._onPointerMove);
    canvas.removeEventListener('pointerup', this._onPointerUp);
    canvas.removeEventListener('pointercancel', this._onPointerUp);
    this.app.off('game:reset', this.reset, this);
    this.app.off('game:start', this._onStart, this);
    this.app.off('game:over', this._onOver, this);
    this.app.off('runner:shielded', this._onShielded, this);
};
