var Leaderboard = pc.createScript('leaderboard');

Leaderboard.attributes.add('size', { type: 'number', default: 25, title: 'Places Shown' });
Leaderboard.attributes.add('daily', { type: 'boolean', default: true, title: 'Daily Board', description: "Also keep a board for each day, beside the all-time one" });

Leaderboard.ALL_TIME = 'alltime';
Leaderboard.FRESH_FOR = 30; // seconds a fetched board is reused before fetching again

// Board name for a date, e.g. daily-2026-09-23.
Leaderboard.dailyName = function (date) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'daily-' + date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
};

// Leaderboards through GameFuse (L3 all-time, L4 today). Scores are posted at the end of a run when
// the player is signed in, and the boards need an account to read as well, so signed-out players
// get an invitation to join instead. Everything else in the game works untouched either way.
Leaderboard.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.progress = this.entity.script.progress;
    this.account = this.entity.script.account || null;
    this.levels = this.entity.script.levels || null;
    this.tab = 'daily';
    this.isOpen = false;
    this.boards = {}; // name -> { entries, at, loading, error }
    this.posted = null;

    // With the in-game menus present, they own the board and this script is only the logic.
    var ui = this.app.root.findByName('UI');
    this.inGameUi = !!(ui && ui.script && ui.script.uiScreens);
    this.onUpdate = null; // the in-game board asks to be redrawn through this
    if (!this.inGameUi) this._buildHud();
    this.app.on('game:state', this._renderButton, this);
    this.app.on('account:changed', this._onAccount, this);
    this.app.on('account:in', this._onAccount, this);
    this.app.on('progress:runOver', this._onRunOver, this);
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    this.on('destroy', this._onDestroy, this);
};

Leaderboard.prototype.postInitialize = function () {
    this.progress.addSection('over', this._overLine, this);
    this._renderButton();
};

Leaderboard.prototype._names = function () {
    return { daily: Leaderboard.dailyName(new Date()), alltime: Leaderboard.ALL_TIME };
};

Leaderboard.prototype._live = function () {
    return !!(this.account && this.account.signedIn());
};

// ---- Posting

Leaderboard.prototype._onRunOver = function (run) {
    this.posted = null;
    if (!this._live() || this.game.score <= 0) return;
    var extras = { distance: run.distance, level: this.levels ? this.levels.getLevel().level : 1 };
    var names = this._names();
    var self = this;
    var post = function (name) {
        GameFuseUser.CurrentUser.addLeaderboardEntry(name, self.game.score, extras, function (message, hasError) {
            if (hasError) {
                console.warn('[leaderboard] could not post to ' + name + ': ' + message);
                return;
            }
            console.log('[leaderboard] posted ' + self.game.score + ' to ' + name);
            delete self.boards[name]; // it is out of date now
        });
    };
    post(names.alltime);
    if (this.daily) post(names.daily);
    this.posted = this.game.score;
};

// Crash screen: whether the run made it onto the board.
Leaderboard.prototype._overLine = function () {
    if (!this.account || this.account.state === 'off') return '';
    if (this._live()) {
        return this.posted ? '<div class="nr-lb-line">Posted <b>' + Progress.fmt(this.posted) + '</b> to the leaderboard</div>' : '';
    }
    return '<div class="nr-lb-line">Join to put this score on the leaderboard</div>';
};

// What the in-game board shows: 'daily' or 'alltime'.
Leaderboard.prototype.boardFor = function (tab) {
    return this.boards[this._names()[tab]] || null;
};

Leaderboard.prototype.fetchTab = function (tab, force) {
    this._fetch(this._names()[tab], force);
};

// ---- Fetching

Leaderboard.prototype._fetch = function (name, force) {
    var board = this.boards[name];
    if (!this._live() || (board && board.loading)) return;
    if (!force && board && Date.now() - board.at < Leaderboard.FRESH_FOR * 1000) return;
    this.boards[name] = { entries: board ? board.entries : null, at: Date.now(), loading: true, error: '' };
    var self = this;
    GameFuse.Instance.getLeaderboard(this.size, true, name, function (message, hasError) {
        var entry = self.boards[name];
        entry.loading = false;
        entry.at = Date.now();
        if (hasError) {
            entry.error = message || 'Could not load the board';
            console.warn('[leaderboard] ' + name + ': ' + entry.error);
        } else {
            entry.entries = (GameFuse.Instance.leaderboardEntries || []).slice();
            console.log('[leaderboard] ' + name + ': ' + entry.entries.length + ' places');
        }
        self._render();
        if (self.onUpdate) self.onUpdate();
    });
};

Leaderboard.prototype._onAccount = function () {
    this.boards = {};
    this._renderButton();
    if (this.isOpen) {
        this._render();
        this._fetch(this._names()[this.tab], true);
    }
};

// ---- Page

Leaderboard.prototype.open = function () {
    if (this.inGameUi || this.isOpen || this.progress.pending || this.game.state === 'playing') return;
    this.isOpen = true;
    this.game.hold(true);
    this._render();
    this._panel.classList.add('is-on');
    this._fetch(this._names()[this.tab], false);
};

Leaderboard.prototype.close = function () {
    if (!this.isOpen) return;
    this.isOpen = false;
    this._panel.classList.remove('is-on');
    this.game.hold(false);
};

Leaderboard.prototype._onKeyDown = function (e) {
    if (!this.inGameUi && this.isOpen && e.key === pc.KEY_ESCAPE) this.close();
};

Leaderboard.HUD_CSS = [
    '.nr-lb-btn { display: none; align-items: center; height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255, 210, 87, 0.55); background: rgba(14, 6, 28, 0.75); color: #ffd257; font: 800 14px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; letter-spacing: 0.12em; cursor: pointer; }',
    '.nr-lb-btn.is-on { display: flex; }',
    '.nr-lb-line { margin: 2px 0; font-size: 12px; color: #ffd257; }',
    '.nr-lb-line b { color: #fff; }',
    '.nr-lb { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center; padding: 12px; background: rgba(8, 3, 18, 0.62); font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; color: #cfc6e6; }',
    '.nr-lb.is-on { display: flex; }',
    '.nr-lb-card { display: flex; flex-direction: column; width: 440px; max-width: 100%; max-height: 100%; box-sizing: border-box; background: rgba(14, 6, 28, 0.96); border: 1px solid rgba(255, 210, 87, 0.5); border-radius: 16px; box-shadow: 0 0 32px rgba(255, 190, 40, 0.2); }',
    '.nr-lb-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px 8px 18px; }',
    '.nr-lb-head h2 { margin: 0; flex: 1; font-size: 20px; letter-spacing: 0.2em; color: #ffd257; text-shadow: 0 0 12px rgba(255, 190, 40, 0.6); }',
    '.nr-lb-refresh { height: 30px; padding: 0 12px; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 999px; background: transparent; color: #cfc6e6; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }',
    '.nr-lb-x { width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.08); color: #fff; font: inherit; font-size: 18px; line-height: 1; cursor: pointer; }',
    '.nr-lb-tabs { display: flex; gap: 6px; padding: 0 14px 10px; }',
    '.nr-lb-tabs button { flex: 1; padding: 6px 0; border: 1px solid rgba(255, 210, 87, 0.35); border-radius: 8px; background: transparent; color: #ffd257; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }',
    '.nr-lb-tabs button.is-on { background: rgba(255, 210, 87, 0.18); border-color: #ffd257; color: #fff; }',
    '.nr-lb-body { overflow-y: auto; padding: 4px 14px 14px; border-top: 1px solid rgba(255, 255, 255, 0.08); scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.2) transparent; }',
    '.nr-lb-row { display: flex; align-items: baseline; gap: 10px; padding: 6px 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px; }',
    '.nr-lb-row i { width: 28px; font-style: normal; color: #9d93b8; font-variant-numeric: tabular-nums; }',
    '.nr-lb-row span { flex: 1; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.nr-lb-row small { color: #9d93b8; font-variant-numeric: tabular-nums; }',
    '.nr-lb-row b { min-width: 68px; text-align: right; color: #ffd257; font-variant-numeric: tabular-nums; }',
    '.nr-lb-row.is-me { background: rgba(255, 210, 87, 0.12); border-radius: 6px; }',
    '.nr-lb-row.is-me span { color: #ffd257; font-weight: 700; }',
    '.nr-lb-note { padding: 18px 4px; text-align: center; color: #9d93b8; font-size: 13px; line-height: 1.6; }',
    '.nr-lb-join { margin-top: 10px; padding: 9px 22px; border: 0; border-radius: 999px; background: #7dffb0; color: #10021c; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; }'
].join('\n');

Leaderboard.prototype._buildHud = function () {
    var self = this;
    this._style = document.createElement('style');
    this._style.textContent = Leaderboard.HUD_CSS;
    document.head.appendChild(this._style);

    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.className = 'nr-lb-btn';
    this._button.textContent = 'LEADERBOARD';
    this._button.addEventListener('click', function () { self.open(); });
    this.game.getButtonBar().appendChild(this._button);

    this._panel = document.createElement('div');
    this._panel.className = 'nr-lb';
    document.body.appendChild(this._panel);
    this._panel.addEventListener('click', function (ev) {
        if (ev.target === self._panel || ev.target.closest('[data-close]')) {
            self.close();
            return;
        }
        var tab = ev.target.closest('[data-tab]');
        if (tab) {
            self.tab = tab.getAttribute('data-tab');
            self._render();
            self._fetch(self._names()[self.tab], false);
            return;
        }
        if (ev.target.closest('[data-refresh]')) {
            self._fetch(self._names()[self.tab], true);
            self._render();
            return;
        }
        if (ev.target.closest('[data-join]') && self.account) {
            self.close();
            self.account.open();
        }
    });
};

Leaderboard.prototype._renderButton = function () {
    if (this.inGameUi) return;
    var show = this.account && this.account.state !== 'off' && (this.game.state === 'ready' || this.game.state === 'over');
    this._button.classList.toggle('is-on', !!show);
};

Leaderboard.prototype._render = function () {
    if (this.inGameUi || !this.isOpen) return;
    var self = this;
    var keep = this._panel.querySelector('.nr-lb-body');
    var scroll = keep && this._shownTab === this.tab ? keep.scrollTop : 0;
    this._shownTab = this.tab;
    var body;
    if (!this._live()) {
        body = '<div class="nr-lb-note">The leaderboard needs an account, so scores have a name against them.<br>' +
            'Everything else in the game works without one.<button class="nr-lb-join" type="button" data-join>Join or sign in</button></div>';
    } else {
        var board = this.boards[this._names()[this.tab]];
        var me = this.account.name();
        if (!board || (!board.entries && board.loading)) {
            body = '<div class="nr-lb-note">Loading…</div>';
        } else if (board.error) {
            body = '<div class="nr-lb-note">' + board.error + '</div>';
        } else if (!board.entries || !board.entries.length) {
            body = '<div class="nr-lb-note">No scores here yet. Be the first.</div>';
        } else {
            body = board.entries.map(function (e, i) {
                var extras = {};
                try {
                    extras = e.getExtraAttributes() || {};
                } catch (err) {
                    extras = {};
                }
                var name = String(e.getUsername() || 'Player');
                var mine = name === me;
                return '<div class="nr-lb-row' + (mine ? ' is-me' : '') + '"><i>' + (i + 1) + '</i>' +
                    '<span>' + name.replace(/</g, '&lt;') + '</span>' +
                    '<small>' + (extras.distance ? Progress.fmt(extras.distance) + ' m' : '') + '</small>' +
                    '<b>' + Progress.fmt(e.getScore()) + '</b></div>';
            }).join('');
        }
    }
    var tabs = [['daily', 'Today'], ['alltime', 'All time']].filter(function (t) {
        return t[0] !== 'daily' || self.daily;
    }).map(function (t) {
        return '<button type="button" data-tab="' + t[0] + '"' + (self.tab === t[0] ? ' class="is-on"' : '') + '>' + t[1] + '</button>';
    }).join('');
    this._panel.innerHTML = '<div class="nr-lb-card"><div class="nr-lb-head"><h2>LEADERBOARD</h2>' +
        (this._live() ? '<button class="nr-lb-refresh" type="button" data-refresh>Refresh</button>' : '') +
        '<button class="nr-lb-x" type="button" data-close aria-label="Close">×</button></div>' +
        '<div class="nr-lb-tabs">' + tabs + '</div><div class="nr-lb-body">' + body + '</div></div>';
    this._panel.querySelector('.nr-lb-body').scrollTop = scroll;
};

Leaderboard.prototype._onDestroy = function () {
    this.app.off('game:state', this._renderButton, this);
    this.app.off('account:changed', this._onAccount, this);
    this.app.off('account:in', this._onAccount, this);
    this.app.off('progress:runOver', this._onRunOver, this);
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    if (this.isOpen) this.game.hold(false);
    if (this.inGameUi) return;
    this._button.remove();
    this._panel.remove();
    this._style.remove();
};
