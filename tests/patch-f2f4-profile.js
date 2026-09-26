// One-off patch: profile page with tabs (F4), settings storage (F2), volume control for settings.
const fs = require('fs');
const dir = __dirname + '/../scripts/';
const patch = (file, pairs) => {
    let a = fs.readFileSync(dir + file, 'utf8');
    pairs.forEach(([from, to]) => {
        if (!a.includes(from)) throw new Error(file + ' missing: ' + from.slice(0, 80));
        a = a.replace(from, to);
    });
    fs.writeFileSync(dir + file, a);
};

patch('progress.js', [
[`        zones: [],                                 // unlocked extra colour zones (zones script)`,
 `        settings: {},                              // sound and camera choices (settings script)
        firstDay: -1,                              // day this profile started, for the profile page
        zones: [],                                 // unlocked extra colour zones (zones script)`],
[`        d.streak.count = Math.max(0, Math.floor(num(raw.streak.count, 0)));
        d.streak.last = Math.floor(num(raw.streak.last, -1));`,
 `        d.streak.count = Math.max(0, Math.floor(num(raw.streak.count, 0)));
        d.streak.last = Math.floor(num(raw.streak.last, -1));
        d.streak.best = Math.max(d.streak.count, Math.floor(num(raw.streak.best, 0)));`],
[`        streak: { count: 0, last: -1 },            // last = day the daily reward was last claimed`,
 `        streak: { count: 0, last: -1, best: 0 },   // last = day the daily reward was last claimed`],
[`    d.xp = Math.max(0, Math.floor(num(raw.xp, 0)));`,
 `    d.firstDay = Math.floor(num(raw.firstDay, -1));
    if (raw.settings && typeof raw.settings === 'object') {
        Object.keys(raw.settings).forEach(function (k) {
            var v = raw.settings[k];
            if (/^[a-zA-Z]{1,16}$/.test(k) && (typeof v === 'boolean' || (typeof v === 'number' && isFinite(v)))) d.settings[k] = v;
        });
    }
    d.xp = Math.max(0, Math.floor(num(raw.xp, 0)));`],
[`    this.today = today;

    var missions = this.data.missions;`, `    this.today = today;
    if (this.data.firstDay < 0) this.data.firstDay = today;

    var missions = this.data.missions;`],
[`    this.data.streak.count = p.count;
    this.data.streak.last = this.today;`, `    this.data.streak.count = p.count;
    this.data.streak.best = Math.max(this.data.streak.best || 0, p.count);
    this.data.streak.last = this.today;`]
]);

patch('audioFx.js', [
[`AudioFx.prototype._applyVolume = function () {`, `// Used by the settings screen; music follows straight away if it is playing.
AudioFx.prototype.setVolumes = function (master, sfx, music) {
    this.volume = master;
    this.sfxVolume = sfx;
    this.musicVolume = music;
    this._applyVolume();
    if (this.ctx && this.music.on) this.musicGain.gain.setTargetAtTime(music, this.ctx.currentTime, 0.1);
};

AudioFx.prototype._applyVolume = function () {`]
]);

patch('achievements.js', [
[`    this.run = this._newRun();
    this.timer = 0;
    this.isOpen = false;`, `    this.run = this._newRun();
    this.timer = 0;
    this.isOpen = false;
    this.tab = 'stats';`],
[`        if (ev.target === self._panel || ev.target.closest('[data-close]')) self.close();`,
 `        if (ev.target === self._panel || ev.target.closest('[data-close]')) {
            self.close();
            return;
        }
        var tab = ev.target.closest('[data-tab]');
        if (tab) {
            self.tab = tab.getAttribute('data-tab');
            self._render();
        }`],
[`    this._button.innerHTML = 'TROPHIES <b>' + this.count() + '/' + Achievements.LIST.length + '</b>';`,
 `    this._button.innerHTML = 'PROFILE' + (this.levels ? ' <b>Lv ' + this.levels.getLevel().level + '</b>' : '');`],
[`Achievements.prototype._render = function () {
    var self = this;
    var rows = function (filter) { return Achievements.LIST.filter(filter).map(self._row, self).join(''); };
    var level = this.levels ? this.levels.bar(function (info) {
        return Progress.fmt(info.into) + ' / ' + Progress.fmt(info.need) + ' XP · next: ' + Levels.nextText(info.level);
    }) : '';
    this._panel.innerHTML = '<div class="nr-tro-card">' +
        '<div class="nr-tro-head"><h2>TROPHIES</h2><span class="nr-tro-count">' + this.count() + '/' + Achievements.LIST.length + '</span>' +
        '<button class="nr-tro-x" type="button" data-close aria-label="Close">×</button></div>' +
        '<div class="nr-tro-level">' + level + '</div>' +
        '<div class="nr-tro-body"><div class="nr-tro-h">In one run</div>' + rows(function (d) { return d.run; }) +
        '<div class="nr-tro-h">Over time</div>' + rows(function (d) { return d.stat; }) +
        (this.zones ? '<div class="nr-tro-h">Colour zones</div>' + this.zones.pageRows() : '') + '</div></div>';
};`,
 `// The player's own page: how they are doing, what they have won, and which zones they can reach.
Achievements.prototype._render = function () {
    var self = this;
    var rows = function (filter) { return Achievements.LIST.filter(filter).map(self._row, self).join(''); };
    var level = this.levels ? this.levels.bar(function (info) {
        return Progress.fmt(info.into) + ' / ' + Progress.fmt(info.need) + ' XP · next: ' + Levels.nextText(info.level);
    }) : '';
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
};`],
[`    '.nr-tro-level .nr-lvl { margin: 4px 0 0; }',`,
 `    '.nr-tro-level .nr-lvl { margin: 4px 0 0; }',
    '.nr-tro-tabs { display: flex; gap: 6px; padding: 8px 14px 10px; }',
    '.nr-tro-tabs button { flex: 1; padding: 6px 0; border: 1px solid rgba(201, 182, 255, 0.35); border-radius: 8px; background: transparent; color: #c9b6ff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }',
    '.nr-tro-tabs button.is-on { background: rgba(138, 92, 255, 0.2); border-color: #c9b6ff; color: #fff; }',
    '.nr-stat-row { display: flex; align-items: baseline; gap: 10px; padding: 5px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; }',
    '.nr-stat-row span { flex: 1; color: #9d93b8; }',
    '.nr-stat-row b { color: #fff; font-variant-numeric: tabular-nums; }',
    '.nr-tro-count small { color: #9d93b8; font-size: 11px; font-weight: 600; }',`],
[`    '.nr-tro-level { padding: 0 18px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }',`,
 `    '.nr-tro-level { padding: 0 18px 2px; }',`],
[`    '.nr-tro-body { overflow-y: auto; padding: 4px 14px 14px;`, `    '.nr-tro-body { overflow-y: auto; padding: 4px 14px 14px; border-top: 1px solid rgba(255, 255, 255, 0.08);`]
]);
console.log('patched');
