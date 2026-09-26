var Achievements = pc.createScript('achievements');

Achievements.TIERS = [
    { name: 'Bronze', color: '#e0955a', coins: 100, xp: 50 },
    { name: 'Silver', color: '#d4dcea', coins: 250, xp: 100 },
    { name: 'Gold', color: '#ffd257', coins: 500, xp: 200 }
];

// 'run' trophies are feats within one run (the value is that run's figure); 'stat' trophies count
// over all time. Stats 'runs' and 'streak' come from the profile, the rest from its stats counters.
Achievements.LIST = [
    { id: 'run100', name: 'First Steps', text: 'Run 100 m', tier: 0, run: 'distance', target: 100 },
    { id: 'run500', name: 'Warmed Up', text: 'Run 500 m in one run', tier: 0, run: 'distance', target: 500 },
    { id: 'run1000', name: 'Kilometre', text: 'Run 1,000 m in one run', tier: 1, run: 'distance', target: 1000 },
    { id: 'run2000', name: 'Long Haul', text: 'Run 2,000 m in one run', tier: 1, run: 'distance', target: 2000 },
    { id: 'run3000', name: 'Ultra', text: 'Run 3,000 m in one run', tier: 2, run: 'distance', target: 3000 },
    { id: 'score10k', name: 'High Roller', text: 'Score 10,000 in one run', tier: 2, run: 'score', target: 10000 },
    { id: 'coins100', name: 'Coin Grabber', text: 'Collect 100 coins in one run', tier: 1, run: 'coins', target: 100 },
    { id: 'combo5', name: 'Combo Artist', text: 'Reach a ×5 combo', tier: 1, run: 'combo', target: 5 },
    { id: 'combo10', name: 'Combo King', text: 'Reach a ×10 combo', tier: 2, run: 'combo', target: 10 },
    { id: 'close5', name: 'Daredevil', text: 'Make 5 close calls in one run', tier: 1, run: 'closeCalls', target: 5 },
    { id: 'stones', name: 'Stone Hopper', text: 'Cross a gap on floating stones', tier: 0, run: 'stones', target: 1 },
    { id: 'sky', name: 'Sky Walker', text: 'Land on a sky platform', tier: 0, run: 'sky', target: 1 },
    { id: 'zone3', name: 'Sunset Chaser', text: 'Reach the third colour zone', tier: 1, run: 'zones', target: 2 },
    { id: 'clean', name: 'Untouchable', text: 'Run 1,000 m without a stumble or shield hit', tier: 2, run: 'clean', target: 1000 },
    { id: 'runs25', name: 'Regular', text: 'Play 25 runs', tier: 0, stat: 'runs', target: 25 },
    { id: 'runs100', name: 'Veteran', text: 'Play 100 runs', tier: 1, stat: 'runs', target: 100 },
    { id: 'jumps500', name: 'Pogo', text: 'Jump 500 times', tier: 0, stat: 'jumps', target: 500 },
    { id: 'bars200', name: 'Limbo Legend', text: 'Slide under 200 bars', tier: 1, stat: 'bars', target: 200 },
    { id: 'pads100', name: 'Pad Pro', text: 'Use 100 jump pads', tier: 1, stat: 'pads', target: 100 },
    { id: 'coins5k', name: 'Collector', text: 'Collect 5,000 coins', tier: 1, stat: 'coins', target: 5000 },
    { id: 'km50', name: 'Globetrotter', text: 'Run 50 km in total', tier: 2, stat: 'distance', target: 50000 },
    { id: 'crushers100', name: 'Nerves of Steel', text: 'See 100 crushers slam down', tier: 1, stat: 'crushers', target: 100 },
    { id: 'missions30', name: 'Mission Master', text: 'Complete 30 daily missions', tier: 2, stat: 'missions', target: 30 },
    { id: 'streak7', name: 'Loyal', text: 'Reach a 7-day streak', tier: 1, stat: 'streak', target: 7 },
    { id: 'buys10', name: 'Big Spender', text: 'Buy 10 things in the shop', tier: 0, stat: 'buys', target: 10 },
    { id: 'bests10', name: 'Record Breaker', text: 'Beat your best distance 10 times', tier: 1, stat: 'bests', target: 10 }
];
Achievements.CHECK_EVERY = 0.25; // seconds between checks while running
Achievements.SKY_HEIGHT = 4;     // standing this high means a sky platform

// How far along a trophy is: the best single run for 'run' trophies (including the one in
// progress), or the lifetime count.
Achievements.value = function (def, data, run) {
    if (def.run) {
        var best = data.feats[def.id] || 0;
        if (def.run === 'distance') best = Math.max(best, data.records.best);
        return Math.max(best, run ? run[def.run] || 0 : 0);
    }
    if (def.stat === 'runs') return data.runs;
    if (def.stat === 'streak') return data.streak.count;
    return data.stats[def.stat] || 0;
};

// ---- Script

// Trophies (R9): 26 badges in three tiers, each paying coins and XP once. Tracks this run's feats and
// the lifetime counters (kept in the progress profile), announces unlocks, lists new ones on the
// crash screen, and has a Trophies page (with the player's level) opened from the bottom-left dock.
Achievements.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.progress = this.entity.script.progress;
    this.levels = this.entity.script.levels;
    this.zones = this.entity.script.zones || null;
    this.runner = this.app.root.findByTag('player')[0].script.runnerController;
    this.run = this._newRun();
    this.timer = 0;
    this.isOpen = false;
    this.tab = 'stats';

    var self = this;
    var on = function (event, fn) {
        self.app.on(event, fn, self);
        self._offs = self._offs || [];
        self._offs.push([event, fn]);
    };
    var playing = function (fn) {
        return function () { if (this.game.state === 'playing') fn.apply(this, arguments); };
    };
    on('game:start', function () {
        this.close();
        this.run = this._newRun();
    });
    on('runner:coin', playing(function () { this.run.coins++; this._stat('coins'); }));
    on('runner:jump', playing(function () { this._stat('jumps'); }));
    on('runner:pad', playing(function () { this._stat('pads'); }));
    on('crusher:land', playing(function () { this._stat('crushers'); }));
    on('runner:closecall', playing(function () { this.run.closeCalls++; }));
    on('runner:trick', playing(function (kind) {
        if (kind === 'slide') this._stat('bars');
        if (kind === 'stones') this.run.stones++;
    }));
    on('combo:trick', function (count) { this.run.combo = Math.max(this.run.combo, count); });
    on('zone:change', playing(function () { this.run.zones++; }));
    on('runner:stumble', function () { this.run.hit = true; });
    on('runner:shielded', function () { this.run.hit = true; });
    on('progress:mission', function () { this._stat('missions'); });
    on('progress:reward', function () { this._checkAll(); });
    on('shop:buy', function () { this._stat('buys'); this._checkAll(); });
    on('progress:runOver', this._onRunOver);

    var ui = this.app.root.findByName('UI');
    this.screens = (ui && ui.script && ui.script.uiScreens) || null;

    this._buildHud();
    this.progress.addSection('over', this._overLine, this);
    this.app.on('game:state', this._renderButton, this);
    this.app.on('progress:changed', this._renderButton, this);
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this._onKeyDown, this);

    this._renderButton();
    this.on('destroy', this._onDestroy, this);
};

// After the first reset has set up today's profile: anything already earned (records and counts from
// before trophies existed) unlocks now.
Achievements.prototype.postInitialize = function () {
    this._checkAll();
    this._renderButton();
};

Achievements.prototype._newRun = function () {
    return { distance: 0, score: 0, coins: 0, combo: 0, closeCalls: 0, stones: 0, sky: 0, zones: 0, clean: 0, hit: false, unlocked: [] };
};

Achievements.prototype._stat = function (key, amount) {
    var stats = this.progress.data.stats;
    stats[key] = (stats[key] || 0) + (amount === undefined ? 1 : amount);
};

Achievements.prototype.update = function (dt) {
    if (this.game.state !== 'playing') return;
    var run = this.run;
    run.distance = Math.floor(this.game.distance);
    run.score = this.game.score;
    if (!run.hit) run.clean = run.distance;
    if (this.runner.grounded && this.runner.y >= Achievements.SKY_HEIGHT) run.sky = 1;
    this.timer += dt;
    if (this.timer >= Achievements.CHECK_EVERY) {
        this.timer = 0;
        this._checkAll();
    }
};

Achievements.prototype._onRunOver = function (prun) {
    var data = this.progress.data;
    var run = this.run;
    run.distance = prun.distance;
    this._stat('distance', prun.distance);
    if (prun.newBest && prun.bestBefore > 0) this._stat('bests');
    Achievements.LIST.forEach(function (def) {
        if (def.run) data.feats[def.id] = Math.max(data.feats[def.id] || 0, run[def.run] || 0);
    });
    this._checkAll();
};

Achievements.prototype._checkAll = function () {
    var data = this.progress.data;
    for (var i = 0; i < Achievements.LIST.length; i++) {
        var def = Achievements.LIST[i];
        if (data.achievements[def.id] === undefined && Achievements.value(def, data, this.run) >= def.target) this._unlock(def);
    }
};

Achievements.prototype._unlock = function (def) {
    var data = this.progress.data;
    var tier = Achievements.TIERS[def.tier];
    data.achievements[def.id] = Math.max(0, this.progress.today);
    this.progress.earn(tier.coins);
    this.run.unlocked.push(def.id);
    console.log('[trophy] ' + def.name + ' (' + tier.name + '): ' + def.text + ' | +' + tier.coins + ' coins, +' + tier.xp + ' XP');
    this.progress.toast('Trophy: ' + def.name + '  +' + tier.coins, 'gold');
    this.app.fire('trophy:unlock', def.id, def.tier, tier.xp);
    this.progress.commit();
};

Achievements.prototype.count = function () {
    var got = this.progress.data.achievements;
    return Achievements.LIST.filter(function (def) { return got[def.id] !== undefined; }).length;
};

// ---- Trophies page

Achievements.prototype.open = function () {
    if (this.screens) {
        this.screens.open('profile');
        return;
    }
    if (this.isOpen || this.progress.pending || this.game.state === 'playing') return;
    this.isOpen = true;
    this.game.hold(true);
    this._render();
    this._panel.classList.add('is-on');
};

Achievements.prototype.close = function () {
    if (this.screens) {
        if (this.screens.isOpen('profile')) this.screens._back();
        return;
    }
    if (!this.isOpen) return;
    this.isOpen = false;
    this._panel.classList.remove('is-on');
    this.game.hold(false);
};

Achievements.prototype._onKeyDown = function (e) {
    if (this.screens) return;
    if (this.isOpen && e.key === pc.KEY_ESCAPE) this.close();
};

Achievements.HUD_CSS = [
    '.nr-tro-btn { display: none; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid rgba(201, 182, 255, 0.6); background: rgba(14, 6, 28, 0.75); color: #fff; font: 800 14px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; letter-spacing: 0.12em; cursor: pointer; }',
    '.nr-tro-btn.is-on { display: flex; }',
    '.nr-tro-btn b { color: #c9b6ff; letter-spacing: 0.02em; }',
    '.nr-tro-line { margin: 2px 0; color: #ffd257; font-size: 12px; }',
    '.nr-tro-line b { color: #fff; }',
    '.nr-tro { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center; padding: 12px; background: rgba(8, 3, 18, 0.62); font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; color: #cfc6e6; user-select: none; -webkit-user-select: none; }',
    '.nr-tro.is-on { display: flex; }',
    '.nr-tro-card { display: flex; flex-direction: column; width: 460px; max-width: 100%; max-height: 100%; box-sizing: border-box; background: rgba(14, 6, 28, 0.96); border: 1px solid rgba(201, 182, 255, 0.55); border-radius: 16px; box-shadow: 0 0 32px rgba(138, 92, 255, 0.25); }',
    '.nr-tro-head { display: flex; align-items: center; gap: 12px; padding: 12px 14px 4px 18px; }',
    '.nr-tro-head h2 { margin: 0; font-size: 20px; letter-spacing: 0.2em; color: #c9b6ff; text-shadow: 0 0 12px rgba(138, 92, 255, 0.7); }',
    '.nr-tro-count { margin-left: auto; color: #fff; font-size: 16px; font-weight: 800; }',
    '.nr-tro-x { width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.08); color: #fff; font: inherit; font-size: 18px; line-height: 1; cursor: pointer; }',
    '.nr-tro-level { padding: 0 18px 2px; }',
    '.nr-tro-level .nr-lvl { margin: 4px 0 0; }',
    '.nr-tro-tabs { display: flex; gap: 6px; padding: 8px 14px 10px; }',
    '.nr-tro-tabs button { flex: 1; padding: 6px 0; border: 1px solid rgba(201, 182, 255, 0.35); border-radius: 8px; background: transparent; color: #c9b6ff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }',
    '.nr-tro-tabs button.is-on { background: rgba(138, 92, 255, 0.2); border-color: #c9b6ff; color: #fff; }',
    '.nr-stat-row { display: flex; align-items: baseline; gap: 10px; padding: 5px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; }',
    '.nr-stat-row span { flex: 1; color: #9d93b8; }',
    '.nr-stat-row b { color: #fff; font-variant-numeric: tabular-nums; }',
    '.nr-tro-count small { color: #9d93b8; font-size: 11px; font-weight: 600; }',
    '.nr-tro-body { overflow-y: auto; padding: 4px 14px 14px; border-top: 1px solid rgba(255, 255, 255, 0.08); scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.2) transparent; }',
    '.nr-tro-h { margin: 12px 0 4px; color: #9fe9ff; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }',
    '.nr-tro-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }',
    '.nr-tro-row > i { flex: none; width: 22px; height: 22px; border-radius: 50%; background: rgba(255, 255, 255, 0.08); border: 2px solid var(--c); box-sizing: border-box; opacity: 0.45; }',
    '.nr-tro-row.is-done > i { background: var(--c); box-shadow: 0 0 10px var(--c); opacity: 1; }',
    '.nr-tro-main { flex: 1; min-width: 0; }',
    '.nr-tro-main b { color: #fff; font-size: 13px; }',
    '.nr-tro-main small { display: block; margin-top: 1px; font-size: 12px; color: #9d93b8; }',
    '.nr-tro-bar { display: block; height: 3px; margin-top: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.1); overflow: hidden; }',
    '.nr-tro-bar i { display: block; height: 100%; background: #35f4ff; }',
    '.nr-tro-row.is-done .nr-tro-bar { display: none; }',
    '.nr-tro-val { font-size: 12px; color: #fff; font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.nr-tro-row.is-done .nr-tro-val { color: #7dffb0; }',
    '.nr-tro-rew { width: 44px; text-align: right; font-size: 12px; font-weight: 700; color: #ffd257; }'
].join('\n');

Achievements.prototype._buildHud = function () {
    var self = this;
    this._style = document.createElement('style');
    this._style.textContent = Achievements.HUD_CSS;
    document.head.appendChild(this._style);

    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.className = 'nr-tro-btn';
    this._button.setAttribute('aria-label', 'Trophies');
    this._button.addEventListener('click', function () { self.open(); });
    this.game.getButtonBar().appendChild(this._button);

    if (this.screens) return;   // the in-game page is up instead

    this._panel = document.createElement('div');
    this._panel.className = 'nr-tro';
    this._panel.addEventListener('click', function (ev) {
        if (ev.target === self._panel || ev.target.closest('[data-close]')) {
            self.close();
            return;
        }
        var tab = ev.target.closest('[data-tab]');
        if (tab) {
            self.tab = tab.getAttribute('data-tab');
            self._render();
        }
    });
    document.body.appendChild(this._panel);
};

Achievements.prototype._renderButton = function () {
    var state = this.game.state;
    this._button.classList.toggle('is-on', state === 'ready' || state === 'over');
    this._button.innerHTML = 'PROFILE' + (this.levels ? ' <b>Lv ' + this.levels.getLevel().level + '</b>' : '');
};

Achievements.prototype._row = function (def) {
    var data = this.progress.data;
    var done = data.achievements[def.id] !== undefined;
    var tier = Achievements.TIERS[def.tier];
    var value = Math.min(Achievements.value(def, data, null), def.target);
    var pct = Math.floor(value / def.target * 100);
    var val = done ? '✓' : def.target === 1 ? '' : Progress.fmt(value) + '/' + Progress.fmt(def.target);
    return '<div class="nr-tro-row' + (done ? ' is-done' : '') + '" style="--c: ' + tier.color + '" title="' + tier.name + '"><i></i>' +
        '<div class="nr-tro-main"><b>' + def.name + '</b><small>' + def.text + '</small><span class="nr-tro-bar"><i style="width:' + pct + '%"></i></span></div>' +
        '<span class="nr-tro-val">' + val + '</span><span class="nr-tro-rew">+' + tier.coins + '</span></div>';
};

// The player's own page: how they are doing, what they have won, and which zones they can reach.
Achievements.prototype._render = function () {
    if (this.screens) {
        this.app.fire('ui:refresh');   // the in-game page redraws itself
        return;
    }
    var self = this;
    var rows = function (filter) { return Achievements.LIST.filter(filter).map(self._row, self).join(''); };
    var level = this.levels ? this.levels.bar(function (info) {
        return Progress.fmt(info.into) + ' / ' + Progress.fmt(info.need) + ' XP · next: ' + Levels.nextText(info.level);
    }) : '';
    var keep = this._panel.querySelector('.nr-tro-body');
    var scroll = keep && this._shownTab === this.tab ? keep.scrollTop : 0; // a new tab starts at the top
    this._shownTab = this.tab;
    var body;
    if (this.tab === 'trophies') {
        body = '<div class="nr-tro-h">In one run</div>' + rows(function (d) { return d.run; }) +
            '<div class="nr-tro-h">Over time</div>' + rows(function (d) { return d.stat; });
    } else if (this.tab === 'zones') {
        body = this.zones ? this.zones.pageRows() : '';
    } else {
        body = this._statsRows();
    }
    var tabs = [['stats', 'Stats'], ['trophies', 'Trophies ' + this.count() + '/' + Achievements.LIST.length], ['zones', 'Zones']].map(function (t) {
        return '<button type="button" data-tab="' + t[0] + '"' + (self.tab === t[0] ? ' class="is-on"' : '') + '>' + t[1] + '</button>';
    }).join('');
    this._panel.innerHTML = '<div class="nr-tro-card">' +
        '<div class="nr-tro-head"><h2>PROFILE</h2><span class="nr-tro-count">' + Progress.fmt(this.progress.data.wallet) + ' <small>coins</small></span>' +
        '<button class="nr-tro-x" type="button" data-close aria-label="Close">×</button></div>' +
        '<div class="nr-tro-level">' + level + '</div>' +
        '<div class="nr-tro-tabs">' + tabs + '</div>' +
        '<div class="nr-tro-body">' + body + '</div></div>';
    this._panel.querySelector('.nr-tro-body').scrollTop = scroll;
};

// Stats tab: the numbers a player builds up over time.
Achievements.prototype._statsRows = function () {
    var data = this.progress.data;
    var stats = data.stats;
    var skin = Progress.SKINS.filter(function (s) { return s.id === data.skins.equipped; })[0];
    var trail = Trail.STYLES.filter(function (s) { return s.id === data.trails.equipped; })[0];
    var since = '';
    if (data.firstDay >= 0) {
        try {
            since = new Date(data.firstDay * 86400000).toLocaleDateString();
        } catch (err) {
            since = '';
        }
    }
    var group = function (title, pairs) {
        return '<div class="nr-tro-h">' + title + '</div>' + pairs.filter(Boolean).map(function (p) {
            return '<div class="nr-stat-row"><span>' + p[0] + '</span><b>' + p[1] + '</b></div>';
        }).join('');
    };
    return group('Records', [
        ['Best distance', Progress.fmt(data.records.best) + ' m'],
        ['Best score', Progress.fmt(this.game.best)],
        ['Runs played', Progress.fmt(data.runs)],
        ['Day streak', data.streak.count + (data.streak.best > data.streak.count ? ' (best ' + data.streak.best + ')' : '')]
    ]) + group('Totals', [
        ['Distance run', Progress.fmt(Math.round((stats.distance || 0) / 100) / 10) + ' km'],
        ['Coins collected', Progress.fmt(stats.coins || 0)],
        ['Coins in the bank', Progress.fmt(data.wallet)],
        ['Jumps', Progress.fmt(stats.jumps || 0)],
        ['Bars slid under', Progress.fmt(stats.bars || 0)],
        ['Jump pads used', Progress.fmt(stats.pads || 0)],
        ['Crushers seen', Progress.fmt(stats.crushers || 0)],
        ['Missions done', Progress.fmt(stats.missions || 0)],
        ['Shop purchases', Progress.fmt(stats.buys || 0)]
    ]) + group('Now wearing', [
        ['Runner colour', skin ? skin.name : 'Classic'],
        ['Trail', trail ? trail.name : 'None'],
        ['Trophies', this.count() + ' of ' + Achievements.LIST.length],
        ['Colour zones', (Zones.PALETTES.length + data.zones.length) + ' of ' + (Zones.PALETTES.length + Zones.EXTRA.length)],
        since ? ['Playing since', since] : null
    ]);
};

// Crash screen: trophies unlocked on this run.
Achievements.prototype._overLine = function () {
    var names = this.run.unlocked.map(function (id) {
        return '<b>' + Achievements.LIST.filter(function (d) { return d.id === id; })[0].name + '</b>';
    });
    return names.length ? '<div class="nr-tro-line">New trophy: ' + names.join(', ') + '</div>' : '';
};

Achievements.prototype._onDestroy = function () {
    var self = this;
    (this._offs || []).forEach(function (o) { self.app.off(o[0], o[1], self); });
    this.app.off('game:state', this._renderButton, this);
    this.app.off('progress:changed', this._renderButton, this);
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    if (this.isOpen) this.game.hold(false);
    this._button.remove();
    this._panel.remove();
    this._style.remove();
};
