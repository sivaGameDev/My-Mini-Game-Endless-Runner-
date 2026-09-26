var PowerUps = pc.createScript('powerUps');

PowerUps.attributes.add('magnetTime', { type: 'number', default: 10, title: 'Magnet (s)' });
PowerUps.attributes.add('multiplierTime', { type: 'number', default: 10, title: 'Score x2 (s)' });
PowerUps.attributes.add('doubleJumpTime', { type: 'number', default: 10, title: 'Double Jump (s)' });
PowerUps.attributes.add('shieldTime', { type: 'number', default: 15, title: 'Shield (s)', description: 'Or until it absorbs one hit' });

PowerUps.MAX_DT = 1 / 20;
PowerUps.TYPES = {
    magnet: { label: 'Magnet', color: '#b35cff', time: 'magnetTime' },
    shield: { label: 'Shield', color: '#e6fbff', time: 'shieldTime' },
    multiplier: { label: 'Score ×2', color: '#ff4dbf', time: 'multiplierTime' },
    doubleJump: { label: 'Double Jump', color: '#4dc0ff', time: 'doubleJumpTime' }
};

// Timed power-ups. The spawner grants them on pickup and consumes the shield on a hit; the
// runner and game manager ask isActive() / multiplier(). Timers only run while playing.
// Owns its HUD: a timer chip per active power-up and a name flash on pickup.
PowerUps.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.bubble = this.app.root.findByTag('player')[0].findByName('ShieldBubble');
    this.remaining = {};
    this.totals = {}; // each active power-up's full duration, for its timer bar
    this._buildHud();

    this.app.on('game:reset', this.reset, this);
    this.app.on('runner:shielded', this._onShielded, this);
    this.on('destroy', this._onDestroy, this);
};

PowerUps.prototype.reset = function () {
    this.remaining = {};
    this.totals = {};
    this._render();
};

// Lasts the type's usual time unless a duration is given (the shop's Score Booster). Picking one up
// while it's active tops it up but never cuts it short.
PowerUps.prototype.grant = function (type, seconds) {
    var def = PowerUps.TYPES[type];
    var time = Math.max(seconds || this[def.time], this.remaining[type] || 0);
    this.remaining[type] = time;
    this.totals[type] = time;
    console.log('[powerup] ' + type + ' on (' + time + ' s)');
    this._toast(def);
    this._render();
};

PowerUps.prototype.isActive = function (type) {
    return this.remaining[type] > 0;
};

// Ends a power-up early; returns whether it was active.
PowerUps.prototype.consume = function (type) {
    if (!this.isActive(type)) return false;
    delete this.remaining[type];
    this._render();
    return true;
};

PowerUps.prototype.multiplier = function () {
    return this.isActive('multiplier') ? 2 : 1;
};

PowerUps.prototype.update = function (dt) {
    if (this.game.state !== 'playing') return;
    dt = Math.min(dt, PowerUps.MAX_DT);
    var changed = false;
    for (var type in this.remaining) {
        this.remaining[type] -= dt;
        if (this.remaining[type] <= 0) {
            delete this.remaining[type];
            console.log('[powerup] ' + type + ' off');
            changed = true;
        }
    }
    if (changed) this._render();
    this._renderTimers();
};

PowerUps.prototype._onShielded = function (kind) {
    console.log('[powerup] shield absorbed a hit (' + kind + ')');
};

// ---- HUD

PowerUps.HUD_CSS = [
    '.nr-pu-list { position: fixed; top: 104px; left: 16px; z-index: 10; display: flex; flex-direction: column; gap: 6px; pointer-events: none; font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; }',
    '.nr-pu { width: 150px; box-sizing: border-box; padding: 5px 10px 7px; background: rgba(14, 6, 28, 0.62); border: 1px solid var(--c); border-radius: 8px; color: #fff; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }',
    '.nr-pu i { display: block; height: 3px; margin-top: 4px; border-radius: 2px; background: var(--c); box-shadow: 0 0 6px var(--c); }',
    '.nr-pu-toast { position: fixed; top: 22%; left: 50%; z-index: 10; transform: translateX(-50%); opacity: 0; pointer-events: none; white-space: nowrap; font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; font-size: clamp(22px, 5vw, 34px); font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--c); text-shadow: 0 0 16px var(--c); }',
    '.nr-pu-toast.is-on { animation: nr-pu-toast 1.1s ease-out; }',
    '@keyframes nr-pu-toast { 0% { opacity: 0; transform: translate(-50%, 10px) scale(0.9); } 15% { opacity: 1; transform: translate(-50%, 0) scale(1.05); } 70% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -8px); } }'
].join('\n');

PowerUps.prototype._buildHud = function () {
    this._style = document.createElement('style');
    this._style.textContent = PowerUps.HUD_CSS;
    document.head.appendChild(this._style);

    this._list = document.createElement('div');
    this._list.className = 'nr-pu-list';
    document.body.appendChild(this._list);

    this._toastEl = document.createElement('div');
    this._toastEl.className = 'nr-pu-toast';
    document.body.appendChild(this._toastEl);

    this._chips = {}; // type -> { root, bar }
};

// Rebuild the chip list when the set of active power-ups changes; also shows the shield bubble.
PowerUps.prototype._render = function () {
    var self = this;
    this._list.textContent = '';
    this._chips = {};
    Object.keys(this.remaining).forEach(function (type) {
        var def = PowerUps.TYPES[type];
        var root = document.createElement('div');
        root.className = 'nr-pu';
        root.style.setProperty('--c', def.color);
        root.textContent = def.label;
        var bar = document.createElement('i');
        root.appendChild(bar);
        self._list.appendChild(root);
        self._chips[type] = { bar: bar, total: self.totals[type] || self[def.time] };
    });
    this._renderTimers();
    if (this.bubble) this.bubble.enabled = this.isActive('shield');
};

PowerUps.prototype._renderTimers = function () {
    for (var type in this._chips) {
        var chip = this._chips[type];
        chip.bar.style.width = Math.max(0, Math.min(1, this.remaining[type] / chip.total)) * 100 + '%';
    }
};

PowerUps.prototype._toast = function (def) {
    var el = this._toastEl;
    el.textContent = def.label + '!';
    el.style.setProperty('--c', def.color);
    el.classList.remove('is-on');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('is-on');
};

PowerUps.prototype._onDestroy = function () {
    this.app.off('game:reset', this.reset, this);
    this.app.off('runner:shielded', this._onShielded, this);
    this._list.remove();
    this._toastEl.remove();
    this._style.remove();
};
