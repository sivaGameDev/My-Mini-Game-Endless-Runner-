var Levels = pc.createScript('levels');

Levels.MAX = 99;
Levels.XP_PER_10M = 1;        // run XP: distance...
Levels.XP_TRICK = 2;          // ...tricks (jumps over barriers, slides, holes, stones, fly-overs)...
Levels.XP_CLOSE_CALL = 5;     // ...and close calls
Levels.XP_MISSION = 50;
Levels.XP_DAILY = 25;
Levels.COINS_PER_LEVEL = 50;  // reaching level n pays n times this

// ---- Pure helpers

// XP to go from `level` to the next one.
Levels.needed = function (level) {
    return 100 + 60 * (level - 1);
};

// Total XP at which `level` starts.
Levels.totalFor = function (level) {
    var xp = 0;
    for (var l = 1; l < level; l++) xp += Levels.needed(l);
    return xp;
};

// Level for a total XP, and progress into it.
Levels.fromXp = function (xp) {
    var level = 1;
    var need = Levels.needed(1);
    while (xp >= need && level < Levels.MAX) {
        xp -= need;
        level++;
        need = Levels.needed(level);
    }
    return { level: level, into: xp, need: need };
};

// The runner colour or trail that only comes from reaching this level, if any.
Levels.unlockAt = function (level) {
    var skin = Progress.SKINS.filter(function (s) { return s.level === level; })[0];
    if (skin) return { kind: 'skin', def: skin };
    var trail = Trail.STYLES.filter(function (s) { return s.level === level; })[0];
    return trail ? { kind: 'trail', def: trail } : null;
};

// Reaching a level pays coins, plus its level-only colour or trail, or else a starting item on every
// third level (shield and booster in turn).
Levels.rewardFor = function (level) {
    var r = { coins: level * Levels.COINS_PER_LEVEL };
    var unlock = Levels.unlockAt(level);
    if (unlock) r.unlock = unlock;
    else if (level % 3 === 0) r.item = (level / 3) % 2 ? 'shield' : 'booster';
    var zone = typeof Zones !== 'undefined' && Zones.EXTRA.filter(function (z) { return z.level === level; })[0];
    if (zone) r.zone = zone; // unlocked by the zones script, listed here so the reward shows it
    return r;
};

Levels.describe = function (r) {
    var parts = ['+' + Progress.fmt(r.coins) + ' coins'];
    if (r.unlock) parts.push(r.unlock.def.name + (r.unlock.kind === 'skin' ? ' runner colour' : ' trail'));
    if (r.item) parts.push(Shop.ITEMS.filter(function (i) { return i.id === r.item; })[0].name);
    if (r.zone) parts.push(r.zone.name + ' zone');
    return parts.join(', ');
};

// What the next level brings, for the progress bar ("next: Plasma trail").
Levels.nextText = function (level) {
    var r = Levels.rewardFor(level + 1);
    if (r.unlock) return r.unlock.def.name + (r.unlock.kind === 'skin' ? ' colour' : ' trail');
    if (r.zone) return r.zone.name + ' zone';
    if (r.item) return Shop.ITEMS.filter(function (i) { return i.id === r.item; })[0].name;
    return '+' + Progress.fmt(r.coins) + ' coins';
};

// ---- Script

// Player level (R8). XP comes from runs (distance, tricks, close calls), daily missions, the daily
// reward and trophies; each new level pays its reward once. Shows a level bar on the start and crash
// screens. XP and the last rewarded level live in the progress profile.
Levels.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.progress = this.entity.script.progress;
    this.run = this._newRun();

    var self = this;
    var on = function (event, fn) {
        self.app.on(event, fn, self);
        self._offs = self._offs || [];
        self._offs.push([event, fn]);
    };
    on('game:start', function () { this.run = this._newRun(); });
    on('runner:trick', function () { if (this.game.state === 'playing') this.run.tricks++; });
    on('runner:closecall', function () { if (this.game.state === 'playing') this.run.closeCalls++; });
    on('progress:mission', function () { this.add(Levels.XP_MISSION); });
    on('progress:reward', function () {
        this.add(Levels.XP_DAILY);
        this.progress.commit();
    });
    on('trophy:unlock', function (id, tier, xp) { this.add(xp); });
    on('progress:runOver', this._onRunOver);

    this._style = document.createElement('style');
    this._style.textContent = Levels.HUD_CSS;
    document.head.appendChild(this._style);
    this.progress.addSection('ready', this._readyLine, this);
    this.progress.addSection('over', this._overLine, this);

    this._catchUp(); // a level reached but not yet rewarded (e.g. the page closed mid-reward)
    this.on('destroy', function () {
        (this._offs || []).forEach(function (o) { self.app.off(o[0], o[1], self); });
        this._style.remove();
    }, this);
};

Levels.prototype._newRun = function () {
    return { xp: 0, tricks: 0, closeCalls: 0, levels: [] };
};

Levels.prototype.getLevel = function () {
    return Levels.fromXp(this.progress.data.xp);
};

// Adds XP (saved by whoever triggered it) and pays out any levels reached.
Levels.prototype.add = function (xp) {
    xp = Math.round(xp);
    if (xp <= 0) return;
    this.progress.data.xp += xp;
    this.run.xp += xp;
    this._catchUp();
};

Levels.prototype._onRunOver = function (run) {
    var r = this.run;
    var xp = Math.floor(run.distance / 10) * Levels.XP_PER_10M + r.tricks * Levels.XP_TRICK + r.closeCalls * Levels.XP_CLOSE_CALL;
    this.add(xp);
    var info = this.getLevel();
    console.log('[level] run +' + xp + ' XP (' + run.distance + ' m, ' + r.tricks + ' tricks, ' + r.closeCalls + ' close calls); +' +
        r.xp + ' XP this run in all | level ' + info.level + ', ' + info.into + '/' + info.need);
};

Levels.prototype._catchUp = function () {
    var data = this.progress.data;
    var level = Levels.fromXp(data.xp).level;
    while (data.level < level) {
        data.level++;
        var reward = Levels.rewardFor(data.level);
        this.progress.earn(reward.coins);
        if (reward.item) {
            var items = data.items;
            if (!items[reward.item]) items[reward.item] = { count: 0, use: true };
            items[reward.item].count++;
        }
        if (reward.unlock) {
            var set = reward.unlock.kind === 'skin' ? data.skins : data.trails;
            if (set.owned.indexOf(reward.unlock.def.id) === -1) set.owned.push(reward.unlock.def.id);
        }
        this.run.levels.push(data.level);
        console.log('[level] reached level ' + data.level + ': ' + Levels.describe(reward));
        this.progress.toast('LEVEL ' + data.level + '!  ' + Levels.describe(reward), 'gold');
        this.app.fire('level:up', data.level);
    }
};

// ---- HUD

Levels.HUD_CSS = [
    '.nr-lvl { display: flex; align-items: center; gap: 8px; margin: 6px 0 2px; font-size: 12px; }',
    '.nr-lvl b { color: #c9b6ff; font-size: 13px; white-space: nowrap; }',
    '.nr-lvl-bar { flex: 1; min-width: 40px; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }',
    '.nr-lvl-bar i { display: block; height: 100%; background: linear-gradient(90deg, #8a5cff, #ff3df2); box-shadow: 0 0 8px #b35cff; }',
    '.nr-lvl small { color: #cfc6e6; font-size: 12px; white-space: nowrap; }',
    '.nr-lvl-up { margin: 2px 0; color: #ffd257; font-size: 12px; font-weight: 800; }'
].join('\n');

// The level bar; note(info, percent) gives the text beside it.
Levels.prototype.bar = function (note) {
    var info = this.getLevel();
    var pct = Math.floor(info.into / info.need * 100);
    return '<div class="nr-lvl"><b>Lv ' + info.level + '</b><span class="nr-lvl-bar"><i style="width:' + pct + '%"></i></span><small>' + note(info, pct) + '</small></div>';
};

Levels.prototype._readyLine = function () {
    return this.bar(function (info, pct) { return pct + '% · next: ' + Levels.nextText(info.level); });
};

Levels.prototype._overLine = function () {
    var run = this.run;
    var bar = this.bar(function () { return '+' + Progress.fmt(run.xp) + ' XP'; });
    if (!run.levels.length) return bar;
    var top = run.levels[run.levels.length - 1];
    return bar + '<div class="nr-lvl-up">LEVEL UP! Level ' + top + ': ' + Levels.describe(Levels.rewardFor(top)) + '</div>';
};
