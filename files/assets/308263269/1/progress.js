var Progress = pc.createScript('progress');

Progress.attributes.add('storageKey', { type: 'string', default: 'neonRunner.progress', title: 'Storage Key' });

Progress.STREAK_REWARDS = [50, 75, 100, 150, 200, 300, 750]; // coins for days 1-7; day 7 gives the next runner colour instead while any are left
Progress.MISSION_REWARDS = [100, 200, 400];                  // easy, medium, hard
Progress.ALL_MISSIONS_BONUS = 250;
Progress.KEEP_DAYS = 7;          // days of distance records kept
Progress.TOAST_TIME = 2.6;       // seconds a toast stays up
Progress.CLAIM_CLOSE = 0.8;      // seconds the reward window stays up after claiming
Progress.COMPACT_HELP_RUNS = 2;  // after this many runs the start screen shows missions and the short controls line

// Runner colours: streak colours come only from day 7 of the daily reward, level colours only from
// reaching that level (levels script); the rest are in the shop.
Progress.SKINS = [
    { id: 'classic', name: 'Classic' },
    { id: 'gold', name: 'Gold', streak: true, diffuse: [1, 0.72, 0.18], emissive: [0.5, 0.3, 0.02] },
    { id: 'magenta', name: 'Magenta', streak: true, diffuse: [1, 0.25, 0.8], emissive: [0.45, 0.05, 0.35] },
    { id: 'ice', name: 'Ice', streak: true, diffuse: [0.85, 0.95, 1], emissive: [0.25, 0.4, 0.5] },
    { id: 'lime', name: 'Lime', price: 600, diffuse: [0.55, 1, 0.2], emissive: [0.15, 0.4, 0.02] },
    { id: 'crimson', name: 'Crimson', price: 900, diffuse: [1, 0.15, 0.2], emissive: [0.4, 0.02, 0.05] },
    { id: 'violet', name: 'Violet', price: 1200, diffuse: [0.6, 0.35, 1], emissive: [0.22, 0.08, 0.5] },
    { id: 'midnight', name: 'Midnight', price: 2000, diffuse: [0.06, 0.07, 0.14], emissive: [0.05, 0.55, 0.75] },
    { id: 'chrome', name: 'Chrome', level: 10, diffuse: [0.75, 0.78, 0.82], emissive: [0.15, 0.16, 0.2] },
    { id: 'aurora', name: 'Aurora', level: 20, diffuse: [0.3, 1, 0.75], emissive: [0.1, 0.45, 0.35] }
];

// Daily missions: one easy, one medium and one hard each day, picked from the day's number so they
// stay the same all day. 'events' count game events (across the day, or within one run if perRun);
// 'stat' is the best value reached in a single run. Two missions from the same group never share a day.
Progress.MISSIONS = [
    { id: 'coins150', tier: 0, group: 'coins', text: 'Collect 150 coins', events: ['coin'], target: 150 },
    { id: 'jumps30', tier: 0, group: 'jumps', text: 'Jump 30 times', events: ['jump'], target: 30 },
    { id: 'bars8', tier: 0, group: 'bars', text: 'Slide under 8 bars', events: ['trick:slide'], target: 8 },
    { id: 'pads3', tier: 0, group: 'pads', text: 'Use 3 jump pads', events: ['pad'], target: 3 },
    { id: 'power3', tier: 0, group: 'power', text: 'Pick up 3 power-ups', events: ['powerup'], target: 3 },
    { id: 'run800', tier: 1, group: 'distance', text: 'Run 800 m in one run', stat: 'distance', target: 800 },
    { id: 'close5', tier: 1, group: 'close', text: 'Make 5 close calls', events: ['closecall'], target: 5 },
    { id: 'holes3', tier: 1, group: 'holes', text: 'Clear 3 holes or stone gaps', events: ['trick:hole', 'trick:stones'], target: 3 },
    { id: 'boost4', tier: 1, group: 'boost', text: 'Hit 4 speed strips', events: ['boost'], target: 4 },
    { id: 'combo4', tier: 1, group: 'combo', text: 'Reach a ×4 combo', stat: 'combo', target: 4 },
    { id: 'score3k', tier: 1, group: 'score', text: 'Score 3,000 in one run', stat: 'score', target: 3000 },
    { id: 'run1500', tier: 2, group: 'distance', text: 'Run 1,500 m in one run', stat: 'distance', target: 1500 },
    { id: 'combo6', tier: 2, group: 'combo', text: 'Reach a ×6 combo', stat: 'combo', target: 6 },
    { id: 'stones3', tier: 2, group: 'holes', text: 'Cross 3 stone gaps in one run', events: ['trick:stones'], perRun: true, target: 3 },
    { id: 'score6k', tier: 2, group: 'score', text: 'Score 6,000 in one run', stat: 'score', target: 6000 },
    { id: 'coins120', tier: 2, group: 'coins', text: 'Collect 120 coins in one run', events: ['coin'], perRun: true, target: 120 },
    { id: 'close4', tier: 2, group: 'close', text: 'Make 4 close calls in one run', events: ['closecall'], perRun: true, target: 4 }
];
Progress.byId = {};
Progress.MISSIONS.forEach(function (m) { Progress.byId[m.id] = m; });

// ---- Pure helpers (no game state), kept static so they can be tested on their own

// Local calendar day as a whole number: consecutive days differ by exactly 1.
Progress.dayIndex = function (date) {
    return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
};

Progress.msToMidnight = function (date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1) - date;
};

// Small seeded generator (mulberry32).
Progress.random = function (seed) {
    var s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

Progress.pickMissions = function (day) {
    var rand = Progress.random(day * 7919 + 13);
    var used = {};
    var list = [];
    for (var tier = 0; tier < 3; tier++) {
        var options = Progress.MISSIONS.filter(function (m) { return m.tier === tier && !used[m.group]; });
        var m = options[Math.floor(rand() * options.length)];
        used[m.group] = true;
        list.push({ id: m.id, progress: 0, done: false });
    }
    return list;
};

Progress.cycleDay = function (count) {
    return count > 0 ? ((count - 1) % 7) + 1 : 0;
};

// What claiming today's reward does: nothing if it's already claimed (or the clock went back),
// otherwise the streak carries on from yesterday or starts again at day 1.
Progress.streakStatus = function (streak, today) {
    if (streak.last >= today) return { pending: false, count: streak.count, day: Progress.cycleDay(streak.count) };
    var carries = streak.last === today - 1;
    var count = carries ? streak.count + 1 : 1;
    return { pending: true, count: count, day: Progress.cycleDay(count), broken: !carries && streak.count > 0 };
};

// The next streak colour not owned yet.
Progress.nextSkin = function (owned) {
    for (var i = 0; i < Progress.SKINS.length; i++) {
        var s = Progress.SKINS[i];
        if (s.streak && owned.indexOf(s.id) === -1) return s;
    }
    return null;
};

// A day of the streak cycle pays coins; day 7 unlocks the next runner colour while any are left.
Progress.rewardFor = function (day, owned) {
    var skin = day === 7 ? Progress.nextSkin(owned) : null;
    return skin ? { skin: skin } : { coins: Progress.STREAK_REWARDS[day - 1] };
};

Progress.defaults = function () {
    return {
        wallet: 0,
        runs: 0,
        streak: { count: 0, last: -1, best: 0 },   // last = day the daily reward was last claimed
        missions: { day: -1, list: [], bonus: false },
        records: { best: 0, days: {} },           // best distance ever, and each recent day's best
        skins: { owned: ['classic'], equipped: 'classic' },
        trails: { owned: ['none'], equipped: 'none' },
        upgrades: {},                              // shop upgrade id -> level
        items: {},                                 // shop item id -> { count, use }
        xp: 0,                                     // all XP ever earned (levels script)
        level: 1,                                  // highest level whose reward has been given
        stats: {},                                 // lifetime counters (achievements script)
        feats: {},                                 // best single-run value per trophy
        achievements: {},                          // trophy id -> day it was unlocked
        settings: {},                              // sound and camera choices (settings script)
        firstDay: -1,                              // day this profile started, for the profile page
        zones: [],                                 // unlocked extra colour zones (zones script)
        challenges: {}                             // challenge code -> best distance on it (challenge script)
    };
};

// Saved data is only trusted field by field; anything missing or malformed falls back to defaults.
Progress.sanitize = function (raw) {
    var d = Progress.defaults();
    if (!raw || typeof raw !== 'object') return d;
    var num = function (v, fallback) { return typeof v === 'number' && isFinite(v) ? v : fallback; };
    d.wallet = Math.max(0, Math.floor(num(raw.wallet, 0)));
    d.runs = Math.max(0, Math.floor(num(raw.runs, 0)));
    if (raw.streak) {
        d.streak.count = Math.max(0, Math.floor(num(raw.streak.count, 0)));
        d.streak.last = Math.floor(num(raw.streak.last, -1));
        d.streak.best = Math.max(d.streak.count, Math.floor(num(raw.streak.best, 0)));
    }
    if (raw.missions && Array.isArray(raw.missions.list)) {
        var list = raw.missions.list.filter(function (m) { return m && Progress.byId[m.id]; }).map(function (m) {
            return { id: m.id, progress: Math.max(0, num(m.progress, 0)), done: !!m.done };
        });
        if (list.length === 3) {
            d.missions.day = Math.floor(num(raw.missions.day, -1));
            d.missions.list = list;
            d.missions.bonus = !!raw.missions.bonus;
        }
    }
    if (raw.records) {
        d.records.best = Math.max(0, Math.floor(num(raw.records.best, 0)));
        var days = raw.records.days || {};
        Object.keys(days).forEach(function (k) {
            var v = num(days[k], 0);
            if (v > 0 && /^\d+$/.test(k)) d.records.days[k] = Math.floor(v);
        });
    }
    if (raw.skins && Array.isArray(raw.skins.owned)) {
        var ids = Progress.SKINS.map(function (s) { return s.id; });
        d.skins.owned = ['classic'].concat(raw.skins.owned.filter(function (id, i, all) {
            return id !== 'classic' && ids.indexOf(id) !== -1 && all.indexOf(id) === i;
        }));
        d.skins.equipped = d.skins.owned.indexOf(raw.skins.equipped) !== -1 ? raw.skins.equipped : 'classic';
    }
    // Trails, upgrades and items belong to the shop and trail scripts, which ignore unknown ids;
    // here they are only checked for shape.
    var id = function (v) { return typeof v === 'string' && /^[a-zA-Z]{1,24}$/.test(v); };
    if (raw.trails && Array.isArray(raw.trails.owned)) {
        d.trails.owned = ['none'].concat(raw.trails.owned.filter(function (t, i, all) {
            return id(t) && t !== 'none' && all.indexOf(t) === i;
        }));
        d.trails.equipped = d.trails.owned.indexOf(raw.trails.equipped) !== -1 ? raw.trails.equipped : 'none';
    }
    if (raw.upgrades && typeof raw.upgrades === 'object') {
        Object.keys(raw.upgrades).forEach(function (k) {
            var level = Math.floor(num(raw.upgrades[k], 0));
            if (id(k) && level > 0) d.upgrades[k] = Math.min(level, 10);
        });
    }
    d.firstDay = Math.floor(num(raw.firstDay, -1));
    if (raw.settings && typeof raw.settings === 'object') {
        Object.keys(raw.settings).forEach(function (k) {
            var v = raw.settings[k];
            if (/^[a-zA-Z]{1,16}$/.test(k) && (typeof v === 'boolean' || (typeof v === 'number' && isFinite(v)))) d.settings[k] = v;
        });
    }
    d.xp = Math.max(0, Math.floor(num(raw.xp, 0)));
    d.level = Math.max(1, Math.min(99, Math.floor(num(raw.level, 1))));
    var counters = function (src, dst) {
        if (!src || typeof src !== 'object') return;
        Object.keys(src).forEach(function (k) {
            var v = num(src[k], -1);
            if (/^[a-zA-Z0-9]{1,24}$/.test(k) && v >= 0) dst[k] = v;
        });
    };
    counters(raw.stats, d.stats);
    counters(raw.feats, d.feats);
    counters(raw.achievements, d.achievements);
    if (Array.isArray(raw.zones)) {
        d.zones = raw.zones.filter(function (z, i, all) { return id(z) && all.indexOf(z) === i; });
    }
    if (raw.challenges && typeof raw.challenges === 'object') {
        Object.keys(raw.challenges).slice(-20).forEach(function (k) {
            var v = num(raw.challenges[k], -1);
            if (/^[0-9a-z]{1,7}(-[0-9a-z]{1,7}){3}$/.test(k) && v >= 0) d.challenges[k] = Math.floor(v);
        });
    }
    if (raw.items && typeof raw.items === 'object') {
        Object.keys(raw.items).forEach(function (k) {
            var item = raw.items[k];
            if (!id(k) || !item || typeof item !== 'object') return;
            d.items[k] = { count: Math.max(0, Math.min(999, Math.floor(num(item.count, 0)))), use: item.use !== false };
        });
    }
    return d;
};

Progress.fmt = function (n) {
    return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

Progress.fmtTime = function (ms) {
    var mins = Math.max(1, Math.ceil(ms / 60000));
    var h = Math.floor(mins / 60);
    return h > 0 ? h + ' h ' + (mins % 60) + ' m' : mins + ' m';
};

// ---- Script

// The player's profile, kept in the browser (like the best score and the mute setting):
// - Coin bank: coins from every run, plus rewards.
// - Daily reward (R1): a 7-day streak track shown on the first visit each day; missing a day starts
//   it again. Day 7 unlocks a runner colour.
// - Daily missions (R2): three a day, rewarded as soon as they're done, with a bonus for all three.
// - Records: best distance and each recent day's best, for the road gates (markers script).
// - What the shop sold: colours, trails, upgrade levels and items (shop and trail scripts use them).
// - Crash and start screens (R12): what to go for next, mission progress, streak and bank.
// The test bot plays with a fresh profile that is never saved, so it can't touch the player's.
Progress.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    var pilot = this.entity.script.testPilot;
    this.sandbox = !!(pilot && pilot.enabled);
    this.data = this.sandbox ? Progress.defaults() : this._load();
    this.today = -1;
    this.pending = null; // today's streak reward while it waits to be claimed
    this.run = this._newRun();
    this._timers = [];
    this._sections = { ready: [], over: [] };

    var mat = this.app.assets.find('MatPlayer', 'material');
    this.playerMat = mat && mat.resource;
    if (this.playerMat) {
        this.playerOriginal = { diffuse: this.playerMat.diffuse.clone(), emissive: this.playerMat.emissive.clone() };
    }

    this._buildHud();
    this._applySkin();
    if (this.sandbox) console.log('[progress] test bot: using a fresh profile that is not saved');

    var self = this;
    var on = function (event, fn) {
        self.app.on(event, fn, self);
        self._offs = self._offs || [];
        self._offs.push([event, fn]);
    };
    on('game:reset', this._onReset);
    on('game:start', this._onStart);
    on('game:over', this._onOver);
    on('runner:coin', function () { this._count('coin'); });
    on('runner:jump', function () { this._count('jump'); });
    on('runner:trick', function (kind) { this._count('trick:' + kind); });
    on('runner:closecall', function () { this._count('closecall'); });
    on('runner:pad', function () { this._count('pad'); });
    on('runner:powerup', function () { this._count('powerup'); });
    on('runner:boost', function () { this._count('boost'); });
    on('combo:trick', function (count) { this._stat('combo', count); });
    on('record:passed', function (kind) {
        if (kind === 'best') this._toast('NEW BEST DISTANCE!', 'gold');
        else if (kind === 'friend') this._toast("You passed your friend's distance!", 'gold');
        else this._toast("Beat yesterday's best!", 'mission');
    });

    this.app.keyboard.on(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    this._onVisibility = function () { if (document.hidden) self._save(); };
    document.addEventListener('visibilitychange', this._onVisibility);
    this.on('destroy', this._onDestroy, this);
};

Progress.prototype._newRun = function () {
    return { counts: {}, completed: [], earned: 0, coins: 0, distance: 0, bestBefore: this.data.records.best, newBest: false };
};

Progress.prototype._load = function () {
    try {
        return Progress.sanitize(JSON.parse(window.localStorage.getItem(this.storageKey)));
    } catch (err) {
        return Progress.defaults();
    }
};

Progress.prototype._save = function () {
    this.app.fire('progress:changed');
    if (this.sandbox) return;
    try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch (err) {
        // Storage blocked: progress lasts for this session only.
    }
};

// After another script changes the profile: save, put on the equipped colour, redraw the open panel.
Progress.prototype.commit = function () {
    this._save();
    this._applySkin();
    if (this.game.state === 'ready') this._renderReady();
    else if (this.game.state === 'over') this._renderOver();
};

// Adds coins to the bank that also show as earned on this run's crash screen.
Progress.prototype.earn = function (amount) {
    this.data.wallet += amount;
    this.run.earned += amount;
};

// Other scripts add lines to the start ('ready') or crash ('over') screen: fn(run) returns HTML or ''.
// Start-screen lines show from the third run on, with the missions, unless 'always' (a challenge).
Progress.prototype.addSection = function (panel, fn, scope, always) {
    this._sections[panel].push([fn, scope, !!always]);
};

Progress.prototype._sectionHtml = function (panel, onlyAlways) {
    var run = this.run;
    return this._sections[panel].map(function (s) {
        return onlyAlways && !s[2] ? '' : s[0].call(s[1], run) || '';
    }).join('');
};

// Toasts from other scripts; skipped over the crash screen, which lists what happened at the end
// of the run (level-ups, trophies) and would be covered by them, unless forced (a reply to a tap).
Progress.prototype.toast = function (text, kind, force) {
    if (this.game.state === 'over' && !force) return;
    this._toast(text, kind);
};

// Distances for the record gates: the best ever and yesterday's best.
Progress.prototype.getTargets = function () {
    var rec = this.data.records;
    return { best: rec.best, yesterday: rec.days[this.today - 1] || 0 };
};

// ---- Day change: missions and the daily reward

Progress.prototype._onReset = function () {
    this.run = this._newRun();
    this._newDay();
    this._renderReady();
};

Progress.prototype._newDay = function () {
    var today = Progress.dayIndex(new Date());
    if (today === this.today) return;
    this.today = today;
    if (this.data.firstDay < 0) this.data.firstDay = today;

    var missions = this.data.missions;
    if (missions.day !== today) {
        missions.day = today;
        missions.list = Progress.pickMissions(today);
        missions.bonus = false;
    }
    var days = this.data.records.days;
    Object.keys(days).forEach(function (k) {
        if (+k < today - Progress.KEEP_DAYS) delete days[k];
    });
    this._save();

    console.log('[progress] missions today: ' + missions.list.map(function (m) {
        return Progress.byId[m.id].text + ' ' + m.progress + '/' + Progress.byId[m.id].target;
    }).join(' | ') + ' | bank ' + this.data.wallet);

    var status = Progress.streakStatus(this.data.streak, today);
    if (status.pending) this._offerReward(status);
};

Progress.prototype._offerReward = function (status) {
    this.pending = status;
    this._renderModal(status, this.data.skins.owned);
    this._modal.classList.add('is-on');
    this.game.hold(true);
};

// Claimed from the window (a tap, Space or Enter), or automatically if a run starts first.
Progress.prototype._claim = function (auto) {
    var p = this.pending;
    if (!p) return;
    this.pending = null;
    var ownedBefore = this.data.skins.owned.slice();
    var reward = Progress.rewardFor(p.day, ownedBefore);
    this.data.streak.count = p.count;
    this.data.streak.best = Math.max(this.data.streak.best || 0, p.count);
    this.data.streak.last = this.today;
    var text;
    if (reward.skin) {
        this.data.skins.owned.push(reward.skin.id);
        this.data.skins.equipped = reward.skin.id;
        this._applySkin();
        text = 'new runner colour: ' + reward.skin.name + '!';
    } else {
        this.data.wallet += reward.coins;
        text = '+' + Progress.fmt(reward.coins) + ' coins';
    }
    this._save();
    console.log('[progress] daily reward claimed: day ' + p.day + ' (streak ' + p.count + '), ' + text + (auto ? ' (run started first)' : '') + ' | bank ' + this.data.wallet);
    this.app.fire('progress:reward', p.day);

    var self = this;
    if (auto) {
        this._closeModal();
        this._toast('Day ' + p.day + ' reward: ' + text, 'gold');
    } else {
        this._renderModal(p, ownedBefore, text);
        this._later(Progress.CLAIM_CLOSE, function () { self._closeModal(); });
    }
    this._renderReady();
};

Progress.prototype._closeModal = function () {
    this._modal.classList.remove('is-on');
    this.game.hold(false);
};

Progress.prototype._onKeyDown = function (e) {
    if (this.pending && (e.key === pc.KEY_SPACE || e.key === pc.KEY_ENTER)) {
        e.event.preventDefault();
        this._claim(false);
    }
};

// ---- A run

Progress.prototype._onStart = function () {
    if (this.pending) this._claim(true);
    this.run = this._newRun();
};

Progress.prototype.update = function () {
    if (this.game.state !== 'playing') return;
    this._stat('distance', this.game.distance);
    this._stat('score', this.game.score);
};

Progress.prototype._count = function (event) {
    if (this.game.state !== 'playing') return;
    var list = this.data.missions.list;
    for (var i = 0; i < list.length; i++) {
        var m = list[i];
        var def = Progress.byId[m.id];
        if (m.done || !def.events || def.events.indexOf(event) === -1) continue;
        if (def.perRun) {
            this.run.counts[m.id] = (this.run.counts[m.id] || 0) + 1;
            m.progress = Math.max(m.progress, this.run.counts[m.id]);
        } else {
            m.progress++;
        }
        this._check(m, def);
    }
};

Progress.prototype._stat = function (stat, value) {
    if (this.game.state !== 'playing') return;
    var list = this.data.missions.list;
    var v = Math.floor(value);
    for (var i = 0; i < list.length; i++) {
        var m = list[i];
        var def = Progress.byId[m.id];
        if (m.done || def.stat !== stat || v <= m.progress) continue;
        m.progress = v;
        this._check(m, def);
    }
};

Progress.prototype._check = function (m, def) {
    if (m.done || m.progress < def.target) return;
    m.done = true;
    m.progress = def.target;
    var reward = Progress.MISSION_REWARDS[def.tier];
    this.data.wallet += reward;
    this.run.earned += reward;
    this.run.completed.push(m.id);
    console.log('[progress] mission complete: ' + def.text + ' +' + reward);
    this.app.fire('progress:mission', m.id);
    this._toast('Mission complete: ' + def.text + '  +' + reward, 'mission');

    var missions = this.data.missions;
    if (!missions.bonus && missions.list.every(function (x) { return x.done; })) {
        missions.bonus = true;
        this.data.wallet += Progress.ALL_MISSIONS_BONUS;
        this.run.earned += Progress.ALL_MISSIONS_BONUS;
        console.log('[progress] all daily missions done +' + Progress.ALL_MISSIONS_BONUS);
        this._toast('All daily missions done!  +' + Progress.ALL_MISSIONS_BONUS, 'gold');
    }
    this._save();
};

Progress.prototype._onOver = function () {
    var run = this.run;
    var rec = this.data.records;
    run.distance = Math.floor(this.game.distance);
    run.coins = this.game.coins;
    run.bestBefore = rec.best;
    run.newBest = run.distance > rec.best;
    rec.best = Math.max(rec.best, run.distance);
    rec.days[this.today] = Math.max(rec.days[this.today] || 0, run.distance);
    this.data.wallet += run.coins;
    this.data.runs++;
    // Other scripts settle up (XP, trophies) before the save and the crash screen.
    this.app.fire('progress:runOver', run);
    this._save();
    var done = this.data.missions.list.filter(function (m) { return m.done; }).length;
    console.log('[progress] run over: ' + run.distance + ' m' + (run.newBest ? ' (new best distance)' : ' (best ' + rec.best + ')') +
        ', +' + run.coins + ' coins, +' + run.earned + ' from missions, trophies and levels, bank ' + this.data.wallet + ', missions ' + done + '/3');
    this._renderOver();
};

// ---- Runner colour

Progress.prototype._applySkin = function () {
    if (!this.playerMat) return;
    var id = this.data.skins.equipped;
    var skin = Progress.SKINS.filter(function (s) { return s.id === id; })[0];
    var m = this.playerMat;
    if (!skin || !skin.diffuse) {
        m.diffuse.copy(this.playerOriginal.diffuse);
        m.emissive.copy(this.playerOriginal.emissive);
    } else {
        m.diffuse.set(skin.diffuse[0], skin.diffuse[1], skin.diffuse[2]);
        m.emissive.set(skin.emissive[0], skin.emissive[1], skin.emissive[2]);
    }
    m.update();
};

// ---- HUD

Progress.HUD_CSS = [
    '.nr-meta { width: min(330px, calc(100vw - 88px)); margin: 14px auto 12px; text-align: left; font-size: 13px; color: #cfc6e6; }',
    '.nr-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }',
    '.nr-chip { padding: 2px 9px; border-radius: 999px; border: 1px solid rgba(53, 244, 255, 0.4); color: #9fe9ff; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }',
    '.nr-chip.is-gold { border-color: rgba(255, 210, 87, 0.5); color: #ffd257; }',
    '.nr-next { margin-bottom: 6px; padding: 6px 10px; border-radius: 8px; background: rgba(255, 210, 87, 0.12); border: 1px solid rgba(255, 210, 87, 0.45); color: #fff; font-weight: 600; }',
    '.nr-next small { margin-right: 8px; color: #ffd257; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; }',
    '.nr-runline { margin-bottom: 4px; font-variant-numeric: tabular-nums; }',
    '.nr-runline b { color: #fff; }',
    '.nr-runline .is-best { color: #ffd257; font-weight: 700; }',
    '.nr-mhead { margin: 10px 0 2px; color: #9fe9ff; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }',
    '.nr-mhead span { margin-left: 6px; color: #9d93b8; font-weight: 600; letter-spacing: 0.04em; text-transform: none; }',
    '.nr-m { display: grid; grid-template-columns: 1fr auto 44px; column-gap: 8px; align-items: baseline; padding: 4px 0 5px; }',
    '.nr-m .nr-mval { font-variant-numeric: tabular-nums; color: #fff; font-size: 12px; }',
    '.nr-m .nr-mrew { text-align: right; color: #ffd257; font-size: 12px; font-weight: 700; }',
    '.nr-mbar { grid-column: 1 / -1; height: 3px; margin-top: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }',
    '.nr-mbar i { display: block; height: 100%; background: #35f4ff; box-shadow: 0 0 6px #35f4ff; }',
    '.nr-m.is-done .nr-mtext { color: #9d93b8; text-decoration: line-through; }',
    '.nr-m.is-done .nr-mval { color: #7dffb0; }',
    '.nr-m.is-done .nr-mbar i { background: #7dffb0; box-shadow: none; }',
    '.nr-m.is-new .nr-mtext { color: #7dffb0; text-decoration: none; font-weight: 700; }',
    '.nr-streak { margin-top: 8px; font-size: 12px; color: #cfc6e6; }',
    '.nr-streak b { color: #ffd257; }',
    '@media (max-height: 520px) { .nr-meta { margin: 6px auto 6px; } .nr-next { margin-bottom: 4px; padding: 4px 10px; } .nr-mhead { margin-top: 4px; } .nr-m { padding: 1px 0; } .nr-mbar { display: none; } .nr-streak { margin-top: 3px; } }',
    // Daily reward window
    '.nr-daily { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center; padding: 16px; background: rgba(8, 3, 18, 0.6); font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; color: #fff; user-select: none; -webkit-user-select: none; cursor: pointer; }',
    '.nr-daily.is-on { display: flex; }',
    '.nr-daily-card { max-width: 100%; box-sizing: border-box; padding: 20px 22px; text-align: center; background: rgba(14, 6, 28, 0.94); border: 1px solid rgba(255, 210, 87, 0.6); border-radius: 16px; box-shadow: 0 0 36px rgba(255, 190, 40, 0.25); }',
    '.nr-daily-card small { color: #ffd257; font-size: 11px; font-weight: 800; letter-spacing: 0.22em; }',
    '.nr-daily-card h2 { margin: 4px 0 2px; font-size: 26px; letter-spacing: 0.06em; color: #fff; }',
    '.nr-daily-sub { margin: 0 0 12px; font-size: 13px; color: #cfc6e6; }',
    '.nr-days { display: flex; gap: 4px; justify-content: center; }',
    '.nr-day { width: 42px; padding: 5px 0 6px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.04); }',
    '.nr-day span { display: block; font-size: 10px; color: #9d93b8; letter-spacing: 0.04em; }',
    '.nr-day b { display: block; margin-top: 2px; font-size: 12px; color: #ffd257; }',
    '.nr-day.is-past { opacity: 0.45; }',
    '.nr-day.is-past b::after { content: " ✓"; color: #7dffb0; }',
    '.nr-day.is-today { border-color: #ffd257; background: rgba(255, 210, 87, 0.16); box-shadow: 0 0 12px rgba(255, 210, 87, 0.45); }',
    '.nr-day.is-skin b { color: #ff9df6; font-size: 10px; }',
    '.nr-claim { margin-top: 14px; padding: 9px 26px; border: 0; border-radius: 999px; background: #ffd257; color: #1a0620; font: inherit; font-size: 15px; font-weight: 800; letter-spacing: 0.04em; cursor: pointer; box-shadow: 0 0 18px rgba(255, 210, 87, 0.6); }',
    '.nr-daily.is-claimed .nr-claim { background: #7dffb0; box-shadow: 0 0 18px rgba(125, 255, 176, 0.6); }',
    '.nr-daily-note { margin: 10px 0 0; font-size: 11px; color: #9d93b8; }',
    // Toasts
    '.nr-toasts { position: fixed; left: 50%; bottom: 76px; z-index: 11; transform: translateX(-50%); display: flex; flex-direction: column-reverse; align-items: center; gap: 6px; pointer-events: none; font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; }',
    '.nr-toast { max-width: calc(100vw - 32px); padding: 7px 14px; border-radius: 999px; background: rgba(14, 6, 28, 0.85); border: 1px solid rgba(53, 244, 255, 0.6); color: #fff; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: nr-toast 2.6s ease-out forwards; }',
    '.nr-toast.is-gold { border-color: #ffd257; color: #ffd257; box-shadow: 0 0 16px rgba(255, 190, 40, 0.4); }',
    '@keyframes nr-toast { 0% { opacity: 0; transform: translateY(10px); } 8% { opacity: 1; transform: translateY(0); } 85% { opacity: 1; } 100% { opacity: 0; } }'
].join('\n');

Progress.prototype._buildHud = function () {
    this._style = document.createElement('style');
    this._style.textContent = Progress.HUD_CSS;
    document.head.appendChild(this._style);

    this._modal = document.createElement('div');
    this._modal.className = 'nr-daily';
    document.body.appendChild(this._modal);
    var self = this;
    this._modal.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        self._claim(false);
    });

    this._toasts = document.createElement('div');
    this._toasts.className = 'nr-toasts';
    document.body.appendChild(this._toasts);
};

Progress.prototype._toast = function (text, kind) {
    var el = document.createElement('div');
    el.className = 'nr-toast' + (kind === 'gold' ? ' is-gold' : '');
    el.textContent = text;
    this._toasts.appendChild(el);
    this._later(Progress.TOAST_TIME, function () { el.remove(); });
};

Progress.prototype._later = function (seconds, fn) {
    var timers = this._timers;
    var id = setTimeout(function () {
        timers.splice(timers.indexOf(id), 1);
        fn();
    }, seconds * 1000);
    timers.push(id);
};

// The week's seven tiles and the claim button; after claiming, the button shows what was won.
Progress.prototype._renderModal = function (status, owned, claimedText) {
    var claimed = !!claimedText;
    var cycleStart = status.count - status.day; // streak count before day 1 of this week
    var tiles = '';
    for (var d = 1; d <= 7; d++) {
        var r = Progress.rewardFor(d, d === 7 ? owned : []);
        var cls = 'nr-day' + (d < status.day || (claimed && d === status.day) ? ' is-past' : '') +
            (d === status.day ? ' is-today' : '') + (r.skin ? ' is-skin' : '');
        tiles += '<div class="' + cls + '"><span>Day ' + (cycleStart + d) + '</span><b>' + (r.skin ? r.skin.name : Progress.fmt(r.coins)) + '</b></div>';
    }
    var today = Progress.rewardFor(status.day, owned);
    var sub = status.broken ? 'You missed a day, so the streak starts again.' :
        status.count === 1 ? 'Come back every day to build a streak.' : 'Your streak is on ' + status.count + ' days.';
    this._modal.classList.toggle('is-claimed', claimed);
    this._modal.innerHTML = '<div class="nr-daily-card"><small>DAILY REWARD</small>' +
        '<h2>Day ' + status.count + '</h2><p class="nr-daily-sub">' + sub + '</p>' +
        '<div class="nr-days">' + tiles + '</div>' +
        '<button class="nr-claim" type="button">' + (claimed ? 'Claimed: ' + claimedText :
            'Claim ' + (today.skin ? today.skin.name + ' runner' : '+' + Progress.fmt(today.coins) + ' coins')) + '</button>' +
        '<p class="nr-daily-note">Day 7 of every week unlocks a new runner colour.</p></div>';
};

Progress.prototype._missionRows = function () {
    var fresh = this.run.completed;
    return this.data.missions.list.map(function (m) {
        var def = Progress.byId[m.id];
        var pct = Math.min(100, Math.round(m.progress / def.target * 100));
        var cls = 'nr-m' + (m.done ? ' is-done' : '') + (fresh.indexOf(m.id) !== -1 ? ' is-new' : '');
        return '<div class="' + cls + '"><span class="nr-mtext">' + def.text + '</span>' +
            '<span class="nr-mval">' + (m.done ? '✓' : Progress.fmt(m.progress) + '/' + Progress.fmt(def.target)) + '</span>' +
            '<span class="nr-mrew">+' + Progress.MISSION_REWARDS[def.tier] + '</span>' +
            '<span class="nr-mbar"><i style="width:' + pct + '%"></i></span></div>';
    }).join('');
};

Progress.prototype._missionHead = function (label) {
    var list = this.data.missions.list;
    var done = list.filter(function (m) { return m.done; }).length;
    var note = done === list.length ? 'new ones in ' + Progress.fmtTime(Progress.msToMidnight(new Date())) :
        '+' + Progress.ALL_MISSIONS_BONUS + ' for all three';
    return '<div class="nr-mhead">' + label + ' ' + done + '/3<span>' + note + '</span></div>';
};

Progress.prototype._streakLine = function () {
    var s = this.data.streak;
    if (s.count <= 0) return '';
    var next = Progress.rewardFor(Progress.cycleDay(s.count + 1), this.data.skins.owned);
    var what = next.skin ? 'the ' + next.skin.name + ' runner colour' : '+' + Progress.fmt(next.coins) + ' coins';
    return '<div class="nr-streak">Day ' + s.count + ' streak · come back tomorrow for <b>' + what + '</b></div>';
};

// The single most reachable goal: closest to the best distance, or the most-finished mission.
Progress.prototype._nextGoal = function () {
    var run = this.run;
    var best = { closeness: -1, text: '' };
    var consider = function (closeness, text) {
        if (closeness > best.closeness) best = { closeness: closeness, text: text };
    };
    if (!run.newBest && run.bestBefore > 0) {
        consider(run.distance / run.bestBefore, Progress.fmt(run.bestBefore - run.distance + 1) + ' m more to beat your best');
    }
    this.data.missions.list.forEach(function (m) {
        if (m.done) return;
        var def = Progress.byId[m.id];
        consider(m.progress / def.target, def.text + ' (' + Progress.fmt(m.progress) + '/' + Progress.fmt(def.target) + ') for +' + Progress.MISSION_REWARDS[def.tier]);
    });
    if (best.closeness < 0) return run.newBest ? '' : 'Beat your best: ' + Progress.fmt(run.bestBefore) + ' m';
    return best.text;
};

Progress.prototype._renderOver = function () {
    var slot = this.game.getSlot('over');
    var run = this.run;
    var next = this._nextGoal();
    var dist = '<b>' + Progress.fmt(run.distance) + ' m</b>' + (run.newBest && run.bestBefore > 0 ? ' <span class="is-best">new best distance!</span>' : '');
    slot.innerHTML = '<div class="nr-meta">' +
        (next ? '<div class="nr-next"><small>NEXT</small>' + next + '</div>' : '') +
        '<div class="nr-runline">' + dist + ' · +' + Progress.fmt(run.coins + run.earned) + ' coins · bank <b>' + Progress.fmt(this.data.wallet) + '</b></div>' +
        this._sectionHtml('over') + this._missionHead('Daily missions') + this._missionRows() + this._streakLine() + '</div>';
};

Progress.prototype._renderReady = function () {
    var slot = this.game.getSlot('ready');
    var compact = this.data.runs >= Progress.COMPACT_HELP_RUNS;
    this.game.setCompactHelp(compact);
    if (!compact) {
        var always = this._sectionHtml('ready', true);
        slot.innerHTML = always ? '<div class="nr-meta">' + always + '</div>' : '';
        return;
    }
    slot.innerHTML = '<div class="nr-meta"><div class="nr-chips">' +
        (this.data.streak.count > 0 ? '<span class="nr-chip">Day ' + this.data.streak.count + ' streak</span>' : '') +
        '<span class="nr-chip is-gold">Bank ' + Progress.fmt(this.data.wallet) + '</span>' +
        (this.data.records.best > 0 ? '<span class="nr-chip">Best ' + Progress.fmt(this.data.records.best) + ' m</span>' : '') +
        '</div>' + this._sectionHtml('ready') + this._missionHead("Today's missions") + this._missionRows() + '</div>';
};

Progress.prototype._onDestroy = function () {
    var self = this;
    (this._offs || []).forEach(function (o) { self.app.off(o[0], o[1], self); });
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this._timers.forEach(clearTimeout);
    this._save();
    if (this.pending) this.game.hold(false);
    if (this.playerMat) {
        this.playerMat.diffuse.copy(this.playerOriginal.diffuse);
        this.playerMat.emissive.copy(this.playerOriginal.emissive);
        this.playerMat.update();
    }
    this._modal.remove();
    this._toasts.remove();
    this._style.remove();
    this.game.getSlot('ready').innerHTML = '';
    this.game.getSlot('over').innerHTML = '';
    this.game.setCompactHelp(false);
};
