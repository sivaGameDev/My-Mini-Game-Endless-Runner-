var GameManager = pc.createScript('gameManager');

GameManager.attributes.add('startSpeed', { type: 'number', default: 14, title: 'Start Speed' });
GameManager.attributes.add('maxSpeed', { type: 'number', default: 34, title: 'Max Speed' });
GameManager.attributes.add('acceleration', { type: 'number', default: 0.3, title: 'Acceleration', description: 'Speed gained per second of running' });
GameManager.attributes.add('coinValue', { type: 'number', default: 25, title: 'Coin Value' });
GameManager.attributes.add('restartDelay', { type: 'number', default: 0.6, title: 'Restart Delay', description: 'Seconds after a crash before input can restart the run' });
GameManager.attributes.add('stumbleWindow', { type: 'number', default: 5, title: 'Stumble Window (s)', description: 'A second stumble within this long ends the run' });

// Longest frame the simulation integrates, so a hitch or a background tab can't teleport the world.
GameManager.MAX_DT = 1 / 20;
GameManager.BEST_KEY = 'neonRunner.best';
GameManager.BOOST_FACTOR = 1.35;
GameManager.BOOST_TIME = 1.5;
GameManager.GOO_FACTOR = 0.6;
GameManager.STUMBLE_SLOWDOWN = 0.85;

// States: ready -> playing <-> paused, playing -> over -> (reset) ready -> playing.
// Every other script reads `state` / `getStep()` from here and resets itself on 'game:reset'.
// World speed is the run's base speed times a factor that boost strips raise and goo lowers.
GameManager.prototype.initialize = function () {
    this.powerUps = this.entity.script.powerUps || null;
    this.state = 'ready';
    this.held = false; // another script's window is open over the ready screen: Space / tap don't start
    this.best = this._loadBest();
    this._clearRun();

    this._buildHud();

    this.app.on('runner:crash', this._onCrash, this);
    this.app.on('runner:coin', this._onCoin, this);
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this._onKeyDown, this);

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this.app.graphicsDevice.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVisibility);

    this.on('destroy', this._onDestroy, this);
};

GameManager.prototype.postInitialize = function () {
    // The first ready state goes through the same reset path as every restart.
    this.resetRun();
};

GameManager.prototype._clearRun = function () {
    this.speed = 0;
    this.factor = 1;       // boost / goo multiplier on the base speed, eased
    this.boostTime = 0;
    this.goo = false;
    this.gooNext = false;  // set by the spawner during the frame, applied in update
    this.stumbleTime = 0;  // seconds left in which another stumble ends the run
    this.distance = 0;
    this.points = 0;       // distance and coin points, with the score multiplier applied as they are earned
    this.coins = 0;
    this.score = 0;
    this.overTime = 0;
    this.newBest = false;
};

GameManager.prototype.resetRun = function () {
    this._clearRun();
    this._setState('ready');
    this.app.fire('game:reset');
};

GameManager.prototype.start = function () {
    if (this.state !== 'ready') return;
    this.speed = this.startSpeed;
    this._setState('playing');
    this.app.fire('game:start');
};

GameManager.prototype.pause = function () {
    if (this.state === 'playing') this._setState('paused');
};

GameManager.prototype.resume = function () {
    if (this.state === 'paused') this._setState('playing');
};

GameManager.prototype.restart = function () {
    this.resetRun();
    this.start();
};

// Space / Enter / tap: whatever "continue" means in the current state.
GameManager.prototype.primaryAction = function () {
    if (this.held) return;
    if (this.state === 'ready') this.start();
    else if (this.state === 'paused') this.resume();
    else if (this.state === 'over' && this.overTime >= this.restartDelay) this.restart();
};

// While held, Space / Enter / tap do nothing (start() still works for scripts).
GameManager.prototype.hold = function (on) {
    this.held = on;
};

// An empty block inside the 'ready' or 'over' panel that another script fills (missions, streak).
GameManager.prototype.getSlot = function (panel) {
    return this._hud.slots[panel];
};

// The in-game menus take over the start screen: the HTML one stands down.
GameManager.prototype.setExternalMenu = function (on) {
    this.externalMenu = on;
    this._hud.root.classList.toggle('is-external', on);
    this._renderHud();
};

// An in-game page is up: the HTML crash card, dock and score step out of its way.
GameManager.prototype.setHudAside = function (on) {
    this._hud.root.classList.toggle('is-aside', on);
};

// Where other scripts put their buttons: the home screen's menu row, or the corner after a crash
// (this moves them for you). Each button shows itself in the states it belongs to.
GameManager.prototype.getButtonBar = function () {
    return this._hud.bar;
};

// Returning players get a one-line controls reminder instead of the full list.
GameManager.prototype.setCompactHelp = function (on) {
    this._hud.panels.ready.classList.toggle('is-compact', on);
};

// How fast the world is moving right now.
GameManager.prototype.getSpeed = function () {
    return this.speed * this.factor;
};

// Distance the world scrolls this frame; zero unless playing.
GameManager.prototype.getStep = function (dt) {
    return this.state === 'playing' ? this.getSpeed() * Math.min(dt, GameManager.MAX_DT) : 0;
};

// 0 at the start of a run, 1 at max speed.
GameManager.prototype.getIntensity = function () {
    return pc.math.clamp((this.speed - this.startSpeed) / Math.max(0.001, this.maxSpeed - this.startSpeed), 0, 1);
};

GameManager.prototype.boost = function () {
    this.boostTime = GameManager.BOOST_TIME;
};

// Called by the spawner every frame the runner stands in goo.
GameManager.prototype.setGoo = function (on) {
    if (on) this.gooNext = true;
};

// A side clip: the first costs some speed and starts the warning window; returns false if the
// window was already running, and the caller ends the run instead.
GameManager.prototype.stumble = function () {
    if (this.state !== 'playing' || this.stumbleTime > 0) return false;
    this.stumbleTime = this.stumbleWindow;
    this.speed = Math.max(this.startSpeed, this.speed * GameManager.STUMBLE_SLOWDOWN);
    this._renderWarning();
    return true;
};

// Bonus points (tricks, combos), with the score multiplier applied.
GameManager.prototype.addPoints = function (n) {
    if (this.state !== 'playing') return;
    this.points += n * this._multiplier();
    this._updateScore();
};

GameManager.prototype.update = function (dt) {
    dt = Math.min(dt, GameManager.MAX_DT);

    if (this.state === 'over') this.overTime += dt;
    if (this.state !== 'playing') return;

    if (this.boostTime > 0) this.boostTime = Math.max(0, this.boostTime - dt);
    if (this.stumbleTime > 0) {
        this.stumbleTime = Math.max(0, this.stumbleTime - dt);
        if (this.stumbleTime === 0) this._renderWarning();
    }
    this.goo = this.gooNext;
    this.gooNext = false;
    var target = (this.boostTime > 0 ? GameManager.BOOST_FACTOR : 1) * (this.goo ? GameManager.GOO_FACTOR : 1);
    this.factor += (target - this.factor) * (1 - Math.exp(-8 * dt));

    this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration * dt);
    var moved = this.getSpeed() * dt;
    this.distance += moved;
    this.points += moved * this._multiplier();
    this._updateScore();
};

GameManager.prototype._multiplier = function () {
    return this.powerUps ? this.powerUps.multiplier() : 1;
};

GameManager.prototype._updateScore = function () {
    this.score = Math.floor(this.points);
    this._renderStats();
};

GameManager.prototype._setState = function (state) {
    var prev = this.state;
    this.state = state;
    console.log('[game] ' + prev + ' -> ' + state + ' (score ' + this.score + ', coins ' + this.coins + ')');
    this.app.fire('game:state', state, prev);
    this._renderHud();
};

GameManager.prototype._onCrash = function (obstacle, kind) {
    if (this.state !== 'playing') return;
    console.log('[game] crashed into ' + (kind || 'obstacle') + ' at ' + Math.floor(this.distance) + ' m');
    this.speed = 0;
    this.factor = 1;
    this.stumbleTime = 0;
    this.overTime = 0;
    if (this.score > this.best) {
        this.best = this.score;
        this.newBest = true;
        this._saveBest(this.best);
    }
    this._setState('over');
    this.app.fire('game:over', this.score);
};

GameManager.prototype._onCoin = function () {
    if (this.state !== 'playing') return;
    this.coins++;
    this.points += this.coinValue * this._multiplier();
    this._updateScore();
    this._pulse(this._hud.coins);
};

// ---- Input

GameManager.prototype._onKeyDown = function (e) {
    if (e.key === pc.KEY_P || e.key === pc.KEY_ESCAPE) {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
        return;
    }
    if ((e.key === pc.KEY_SPACE || e.key === pc.KEY_ENTER) && this.state !== 'playing') {
        e.event.preventDefault();
        this.primaryAction();
    }
};

GameManager.prototype._onPointerDown = function () {
    if (this.state !== 'playing') this.primaryAction();
};

GameManager.prototype._onBlur = function () {
    this.pause();
};

GameManager.prototype._onVisibility = function () {
    if (document.hidden) this.pause();
};

// ---- Best score (per browser; the game works without storage)

GameManager.prototype._loadBest = function () {
    try {
        return parseInt(window.localStorage.getItem(GameManager.BEST_KEY), 10) || 0;
    } catch (err) {
        return 0;
    }
};

GameManager.prototype._saveBest = function (value) {
    try {
        window.localStorage.setItem(GameManager.BEST_KEY, String(value));
    } catch (err) {
        // Storage blocked: best score lasts for this session only.
    }
};

// ---- HUD: a DOM overlay that only reflects the state above

GameManager.HUD_CSS = [
    '.nr-hud { position: fixed; inset: 0; pointer-events: none; z-index: 10; color: #fff; font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; user-select: none; -webkit-user-select: none; }',
    '.nr-top { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px; }',
    '.nr-stat { min-width: 92px; padding: 6px 14px 8px; background: rgba(14, 6, 28, 0.62); border: 1px solid rgba(53, 244, 255, 0.35); border-radius: 10px; }',
    '.nr-stat.nr-right { text-align: right; border-color: rgba(255, 210, 87, 0.4); }',
    '.nr-label { display: block; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #9fe9ff; }',
    '.nr-right .nr-label { color: #ffe39a; }',
    '.nr-mult { display: none; margin-left: 6px; padding: 0 5px; border-radius: 4px; background: #ff4dbf; color: #1a0620; font-size: 10px; font-weight: 800; letter-spacing: 0.05em; }',
    '.nr-mult.is-on { display: inline-block; }',
    '.nr-value { display: block; font-size: 28px; line-height: 1.1; font-weight: 700; font-variant-numeric: tabular-nums; text-shadow: 0 0 10px rgba(53, 244, 255, 0.7); }',
    '.nr-right .nr-value { color: #ffd257; text-shadow: 0 0 10px rgba(255, 190, 40, 0.7); transform-origin: right center; }',
    '.nr-sub { display: block; margin-top: 2px; font-size: 12px; color: #cfc6e6; font-variant-numeric: tabular-nums; }',
    '.nr-pause { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); width: 44px; height: 44px; display: none; border-radius: 50%; border: 1px solid rgba(255, 61, 242, 0.6); background: rgba(14, 6, 28, 0.62); color: #ff3df2; font-family: inherit; font-size: 15px; font-weight: 700; letter-spacing: 2px; cursor: pointer; pointer-events: auto; }',
    '.nr-pause.is-on { display: block; }',
    '.nr-warn { position: absolute; top: 68px; left: 50%; transform: translateX(-50%); display: none; padding: 3px 12px; border-radius: 999px; background: rgba(40, 4, 12, 0.75); border: 1px solid #ff4d6a; color: #ff6b84; font-size: 13px; font-weight: 800; letter-spacing: 0.16em; text-shadow: 0 0 8px rgba(255, 77, 106, 0.8); animation: nr-blink 0.6s ease-in-out infinite; }',
    '.nr-warn.is-on { display: block; }',
    '.nr-panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: max-content; max-width: calc(100vw - 32px); box-sizing: border-box; display: none; padding: 26px 32px; text-align: center; background: rgba(14, 6, 28, 0.8); border: 1px solid rgba(255, 61, 242, 0.55); border-radius: 16px; box-shadow: 0 0 32px rgba(255, 61, 242, 0.25); cursor: pointer; pointer-events: auto; }',
    '.nr-panel.is-on { display: block; }',
    '.nr-panel h1 { margin: 0 0 12px; font-size: clamp(28px, 6vw, 44px); letter-spacing: 0.12em; color: #ff3df2; text-shadow: 0 0 18px rgba(255, 61, 242, 0.8); }',
    '.nr-cta { margin: 0; font-size: 16px; font-weight: 600; color: #35f4ff; animation: nr-blink 1.4s ease-in-out infinite; }',
    '.nr-final { margin: 0 0 6px; font-size: 18px; color: #cfc6e6; }',
    '.nr-final b { margin-left: 8px; font-size: 30px; color: #fff; }',
    '.nr-newbest { display: none; margin: 0 0 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ffd257; }',
    '.nr-panel.is-best .nr-newbest { display: block; }',
    '.nr-help { list-style: none; margin: 16px 0 0; padding: 0; font-size: 13px; line-height: 1.8; color: #cfc6e6; }',
    '.nr-help b { color: #fff; }',
    '.nr-help-short { display: none; margin: 12px 0 0; font-size: 12px; color: #9d93b8; }',
    '.nr-help-short b { color: #cfc6e6; }',
    '.nr-panel.is-compact .nr-help { display: none; }',
    '.nr-panel.is-compact .nr-help-short { display: block; }',
    '.nr-slot:empty { display: none; }',
    '.nr-dock { position: absolute; left: 16px; bottom: 16px; display: none; flex-direction: column; align-items: flex-start; gap: 8px; }',
    '.nr-dock.is-on { display: flex; }',
    '.nr-dock > *, .nr-barwrap > * { pointer-events: auto; }',
    '.nr-bar.is-menu { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }',
    '.nr-bar.is-dock { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }',
    '.nr-barwrap:empty { display: none; }',
    '.nr-barwrap { margin: 12px 0 2px; }',
    '.nr-play { display: block; margin: 14px auto 6px; padding: 12px 54px; border: 0; border-radius: 999px; background: linear-gradient(90deg, #ff3df2, #35f4ff); color: #10021c; font: inherit; font-size: 20px; font-weight: 800; letter-spacing: 0.22em; cursor: pointer; box-shadow: 0 0 26px rgba(255, 61, 242, 0.55); }',
    '.nr-play:hover { filter: brightness(1.1); }',
    '.nr-menu { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 14px 0 4px; }',
    '.nr-btn { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(53, 244, 255, 0.5); background: rgba(14, 6, 28, 0.75); color: #fff; font: 800 14px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; letter-spacing: 0.12em; cursor: pointer; pointer-events: auto; }',
    '.nr-btn.is-go { border-color: #35f4ff; background: rgba(53, 244, 255, 0.18); }',
    '.nr-btn.is-home { display: none; border-color: rgba(255, 255, 255, 0.4); }',
    '.nr-btn.is-home.is-on { display: flex; }',
    '.nr-cta-small { font-size: 13px; opacity: 0.75; }',
    '.nr-hud.is-home .nr-top { display: none; }',
    '.nr-hud.is-external .nr-panel[data-panel="ready"] { display: none; }',
    '.nr-hud.is-external .nr-pause { display: none; }',
    '.nr-hud.is-aside .nr-panel, .nr-hud.is-aside .nr-dock, .nr-hud.is-aside .nr-top { display: none; }',
    '@media (max-height: 520px) { .nr-play { margin: 8px auto 2px; padding: 9px 44px; font-size: 18px; } .nr-menu, .nr-barwrap { margin: 8px 0 2px; } .nr-btn { height: 34px; padding: 0 14px; font-size: 13px; } .nr-panel { padding: 10px 20px 12px; } .nr-panel h1 { margin-bottom: 2px; font-size: 24px; } .nr-help { margin-top: 10px; font-size: 12px; line-height: 1.5; } .nr-final { margin-bottom: 0; font-size: 15px; } .nr-final b { font-size: 24px; } .nr-newbest { margin-bottom: 4px; } }',
    '.nr-pulse { animation: nr-pulse 0.25s ease-out; }',
    '@keyframes nr-blink { 50% { opacity: 0.45; } }',
    '@keyframes nr-pulse { 0% { transform: scale(1.35); } 100% { transform: scale(1); } }'
].join('\n');

GameManager.HUD_HTML = [
    '<div class="nr-top">',
    '<div class="nr-stat"><span class="nr-label">Score<span class="nr-mult" data-mult>×2</span></span><span class="nr-value" data-score>0</span><span class="nr-sub">Best <span data-best>0</span></span></div>',
    '<div class="nr-stat nr-right"><span class="nr-label">Coins</span><span class="nr-value" data-coins>0</span></div>',
    '</div>',
    '<button class="nr-pause" type="button" data-pause aria-label="Pause">II</button>',
    '<div class="nr-warn" data-warn>CAREFUL!</div>',
    '<div class="nr-dock" data-dock><button class="nr-btn is-home" type="button" data-home>HOME</button></div>',
    '<div class="nr-panel" data-panel="ready"><h1>NEON RUNNER</h1>',
    '<button class="nr-play" type="button" data-play>PLAY</button>',
    '<p class="nr-cta nr-cta-small">or press Space</p>',
    '<div class="nr-barwrap" data-barwrap></div>',
    '<div class="nr-slot" data-slot="ready"></div>',
    '<ul class="nr-help">',
    '<li><b>← →</b> or <b>A D</b> or swipe: change lane</li>',
    '<li><b>↑</b> or <b>W</b> or <b>Space</b> or swipe up: jump</li>',
    '<li><b>↓</b> or <b>S</b> or swipe down: slide under bars (drops you fast mid-air)</li>',
    '<li><b>Ramps</b> lead up onto rooftops; jump onto steps, over holes and across floating stones</li>',
    '<li><b>Green pads</b> launch you; <b>cyan strips</b> boost you; <b>green goo</b> slows you and stops jumps</li>',
    '<li>Clip something from the side and you stumble; do it twice in a row and you crash</li>',
    '<li><b>P</b> or <b>Esc</b>: pause · <b>M</b>: sound on/off</li>',
    '</ul>',
    '<p class="nr-help-short"><b>← →</b> lanes · <b>↑</b> jump · <b>↓</b> slide · <b>P</b> pause · <b>M</b> sound</p></div>',
    '<div class="nr-panel" data-panel="paused"><h1>PAUSED</h1>',
    '<div class="nr-menu">',
    '<button class="nr-btn is-go" type="button" data-resume>Resume</button>',
    '<button class="nr-btn" type="button" data-restart>Restart</button>',
    '<button class="nr-btn" type="button" data-home>Home</button>',
    '</div><p class="nr-cta nr-cta-small">or press P to resume</p></div>',
    '<div class="nr-panel" data-panel="over"><h1>CRASHED</h1><p class="nr-final">Score<b data-final>0</b></p><p class="nr-newbest">New best!</p><div class="nr-slot" data-slot="over"></div><p class="nr-cta">Press Space or tap to run again</p></div>'
].join('');

GameManager.prototype._buildHud = function () {
    var style = document.createElement('style');
    style.textContent = GameManager.HUD_CSS;
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.className = 'nr-hud';
    root.innerHTML = GameManager.HUD_HTML;
    document.body.appendChild(root);

    var q = function (sel) { return root.querySelector(sel); };
    this._hud = {
        style: style,
        root: root,
        score: q('[data-score]'),
        mult: q('[data-mult]'),
        best: q('[data-best]'),
        coins: q('[data-coins]'),
        final: q('[data-final]'),
        pause: q('[data-pause]'),
        warn: q('[data-warn]'),
        dock: q('[data-dock]'),
        panels: {
            ready: q('[data-panel="ready"]'),
            paused: q('[data-panel="paused"]'),
            over: q('[data-panel="over"]')
        },
        play: q('[data-play]'),
        barwrap: q('[data-barwrap]'),
        bar: document.createElement('div'),
        home: q('.nr-dock [data-home]'),
        slots: {
            ready: q('[data-slot="ready"]'),
            over: q('[data-slot="over"]')
        },
        shown: { score: -1, coins: -1, best: -1, mult: -1 }
    };

    var self = this;
    this._hud.bar.className = 'nr-bar';
    Object.keys(this._hud.panels).forEach(function (key) {
        self._hud.panels[key].addEventListener('pointerdown', function (ev) {
            ev.stopPropagation();
            self.primaryAction();
        });
    });
    // Buttons inside a panel act on their own; the panel's own tap must not also fire.
    root.addEventListener('pointerdown', function (ev) {
        if (ev.target.closest('button')) ev.stopPropagation();
    }, true);
    root.addEventListener('click', function (ev) {
        var button = ev.target.closest('[data-play],[data-resume],[data-restart],[data-home]');
        if (!button) return;
        if (button.hasAttribute('data-play')) self.start();
        else if (button.hasAttribute('data-resume')) self.resume();
        else if (button.hasAttribute('data-restart')) self.restart();
        else self.resetRun(); // home
    });
    this._hud.pause.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        self.pause();
    });
};

GameManager.prototype._renderHud = function () {
    var h = this._hud;
    for (var key in h.panels) h.panels[key].classList.toggle('is-on', key === this.state);
    h.pause.classList.toggle('is-on', this.state === 'playing');
    // The buttons other scripts add sit in the home screen's menu, or in the corner after a crash.
    var home = this.state === 'ready' && !this.externalMenu;
    h.root.classList.toggle('is-home', this.state === 'ready'); // the score and coins belong to a run
    var parent = home ? h.barwrap : h.dock;
    if (h.bar.parentNode !== parent) parent.appendChild(h.bar);
    h.bar.classList.toggle('is-menu', home);
    h.bar.classList.toggle('is-dock', !home);
    h.dock.classList.toggle('is-on', this.state === 'over');
    h.home.classList.toggle('is-on', this.state === 'over');
    h.final.textContent = this.score;
    h.panels.over.classList.toggle('is-best', this.newBest);
    this._renderWarning();
    this._renderStats();
};

GameManager.prototype._renderWarning = function () {
    this._hud.warn.classList.toggle('is-on', this.state === 'playing' && this.stumbleTime > 0);
};

// Only touch the DOM when a value actually changes.
GameManager.prototype._renderStats = function () {
    var h = this._hud;
    var s = h.shown;
    var mult = this._multiplier();
    if (s.score !== this.score) { s.score = this.score; h.score.textContent = this.score; }
    if (s.coins !== this.coins) { s.coins = this.coins; h.coins.textContent = this.coins; }
    if (s.best !== this.best) { s.best = this.best; h.best.textContent = this.best; }
    if (s.mult !== mult) { s.mult = mult; h.mult.classList.toggle('is-on', mult > 1); }
};

GameManager.prototype._pulse = function (el) {
    el.classList.remove('nr-pulse');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('nr-pulse');
};

GameManager.prototype._onDestroy = function () {
    this.app.off('runner:crash', this._onCrash, this);
    this.app.off('runner:coin', this._onCoin, this);
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    this.app.graphicsDevice.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this._hud.root.remove();
    this._hud.style.remove();
};
