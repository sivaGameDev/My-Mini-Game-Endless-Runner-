var Combo = pc.createScript('combo');

Combo.attributes.add('window', { type: 'number', default: 3, title: 'Combo Window (s)', description: 'Time to land the next trick before the combo resets' });
Combo.attributes.add('trickPoints', { type: 'number', default: 10, title: 'Trick Points', description: 'Times the current combo' });
Combo.attributes.add('closeCallPoints', { type: 'number', default: 30, title: 'Close Call Points', description: 'Times the current combo' });

Combo.MAX = 10;
Combo.MAX_DT = 1 / 20;
Combo.LABELS = { jump: 'Jump', slide: 'Slide', fly: 'Fly over', hole: 'Hole', stones: 'Stone run', closecall: 'Close call!' };
Combo.WEIGHT = { stones: 5 }; // big tricks are worth more than one

// Tricks and close calls (reported by the spawner) build a combo; each one scores its points
// times the combo. The combo resets after a quiet spell, a stumble or a crash.
// Owns its HUD: the combo counter and the "+points" pop-ups.
Combo.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.stats = { tricks: 0, closeCalls: 0, best: 0, points: 0 };
    this._buildHud();
    this.reset();

    this.app.on('game:reset', this.reset, this);
    this.app.on('runner:trick', this._onTrick, this);
    this.app.on('runner:closecall', this._onCloseCall, this);
    this.app.on('runner:stumble', this._break, this);
    this.app.on('game:over', this._break, this);
    this.on('destroy', this._onDestroy, this);
};

Combo.prototype.reset = function () {
    this.count = 0;
    this.timer = 0;
    this._render();
};

Combo.prototype.update = function (dt) {
    if (this.game.state !== 'playing' || this.count === 0) return;
    this.timer -= Math.min(dt, Combo.MAX_DT);
    if (this.timer <= 0) this._break();
};

Combo.prototype._onTrick = function (kind) {
    this._score(kind, this.trickPoints * (Combo.WEIGHT[kind] || 1));
    this.stats.tricks++;
};

Combo.prototype._onCloseCall = function () {
    this._score('closecall', this.closeCallPoints);
    this.stats.closeCalls++;
};

Combo.prototype._score = function (kind, base) {
    if (this.game.state !== 'playing') return;
    this.count = Math.min(Combo.MAX, this.count + 1);
    this.timer = this.window;
    var points = base * this.count;
    this.game.addPoints(points);
    this.stats.points += points;
    this.stats.best = Math.max(this.stats.best, this.count);
    this.app.fire('combo:trick', this.count, kind);
    this._popup(Combo.LABELS[kind] + '  +' + points, kind === 'closecall');
    this._render();
};

Combo.prototype._break = function () {
    if (this.count === 0) return;
    if (this.count >= 3) console.log('[combo] ended at x' + this.count);
    this.count = 0;
    this.timer = 0;
    this._render();
};

// ---- HUD

Combo.HUD_CSS = [
    '.nr-combo { position: fixed; top: 100px; left: 50%; z-index: 10; transform: translateX(-50%); display: none; pointer-events: none; font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; font-size: 20px; font-weight: 800; letter-spacing: 0.14em; color: #ffd257; text-shadow: 0 0 12px rgba(255, 190, 40, 0.8); }',
    '.nr-combo.is-on { display: block; }',
    '.nr-combo i { font-style: normal; font-size: 30px; margin-left: 6px; }',
    '.nr-pop { position: fixed; top: 136px; left: 50%; z-index: 10; pointer-events: none; white-space: nowrap; font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; font-size: 15px; font-weight: 700; letter-spacing: 0.08em; color: #fff; text-shadow: 0 0 8px rgba(53, 244, 255, 0.9); animation: nr-pop 0.9s ease-out forwards; }',
    '.nr-pop.is-close { color: #ff9ad6; text-shadow: 0 0 10px rgba(255, 77, 191, 0.9); font-size: 17px; }',
    '@keyframes nr-pop { 0% { opacity: 0; transform: translate(-50%, 8px) scale(0.9); } 15% { opacity: 1; transform: translate(-50%, 0) scale(1); } 100% { opacity: 0; transform: translate(-50%, -34px); } }'
].join('\n');

Combo.prototype._buildHud = function () {
    this._style = document.createElement('style');
    this._style.textContent = Combo.HUD_CSS;
    document.head.appendChild(this._style);
    this._counter = document.createElement('div');
    this._counter.className = 'nr-combo';
    document.body.appendChild(this._counter);
    this._pops = [];
};

Combo.prototype._render = function () {
    this._counter.classList.toggle('is-on', this.count >= 2);
    if (this.count >= 2) this._counter.innerHTML = 'COMBO<i>×' + this.count + '</i>';
};

Combo.prototype._popup = function (text, close) {
    var el = document.createElement('div');
    el.className = 'nr-pop' + (close ? ' is-close' : '');
    el.textContent = text;
    document.body.appendChild(el);
    this._pops.push(el);
    var self = this;
    setTimeout(function () {
        el.remove();
        var i = self._pops.indexOf(el);
        if (i !== -1) self._pops.splice(i, 1);
    }, 900);
};

Combo.prototype._onDestroy = function () {
    this.app.off('game:reset', this.reset, this);
    this.app.off('runner:trick', this._onTrick, this);
    this.app.off('runner:closecall', this._onCloseCall, this);
    this.app.off('runner:stumble', this._break, this);
    this.app.off('game:over', this._break, this);
    this._pops.forEach(function (el) { el.remove(); });
    this._counter.remove();
    this._style.remove();
};
