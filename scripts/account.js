var Account = pc.createScript('account');

Account.attributes.add('gameId', { type: 'string', default: '', title: 'GameFuse Game ID', description: 'From your GameFuse dashboard. Empty means the game stays offline: no accounts, no leaderboard.' });
Account.attributes.add('token', { type: 'string', default: '', title: 'GameFuse API Token', description: 'From your GameFuse dashboard, next to the game ID' });
Account.attributes.add('cloudSave', { type: 'boolean', default: true, title: 'Cloud Save', description: 'Keep the profile on the account as well as in this browser' });

Account.SDK_URL = 'https://cdn.jsdelivr.net/gh/game-fuse/game-fuse-js@main/gameFuseFull.js';
Account.EMAIL_KEY = 'neonRunner.email'; // the address is remembered to save typing; the password never is
Account.ATTRIBUTE = 'profile';          // where the saved profile lives on the account
Account.SAVE_EVERY = 20;                // seconds between cloud saves at most

// Fields carried to the cloud. Numbers keep the higher of the two sides, lists are merged, so
// playing offline on another device can never wipe progress.
Account.NUMBERS = ['wallet', 'runs', 'xp', 'level'];
Account.LISTS = [['skins', 'owned'], ['trails', 'owned']];

// Sign-in and cloud save through GameFuse (gamefuse.co): the "join" half of joining and boards.
// Everything works signed out; an account adds the leaderboard and a copy of the profile that
// follows the player to another browser. The SDK is loaded from GameFuse's CDN when a game ID is set.
Account.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.progress = this.entity.script.progress;
    this.state = 'off';   // off (not set up) | loading | ready | error | in
    this.error = '';
    this.user = null;     // GameFuse user once signed in
    this.mode = 'in';     // which half of the panel is showing: 'in' or 'up'
    this.busy = false;
    this.isOpen = false;
    this.lastSave = 0;

    // With the in-game menus present, they own the join screen and this script is only the logic.
    var ui = this.app.root.findByName('UI');
    this.inGameUi = !!(ui && ui.script && ui.script.uiScreens);
    if (!this.inGameUi) this._buildHud();
    this.app.on('game:state', this._renderButton, this);
    this.app.on('progress:runOver', this._onRunOver, this);
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    this.on('destroy', this._onDestroy, this);

    if (this.gameId && this.token) this._load();
    else console.log('[account] no GameFuse game ID set: playing offline');
};

Account.prototype.postInitialize = function () {
    this._renderButton();
};

Account.prototype.isReady = function () {
    return this.state === 'ready' || this.state === 'in';
};

Account.prototype.signedIn = function () {
    return this.state === 'in';
};

Account.prototype.name = function () {
    return this.user ? this.user.getUsername() : '';
};

// ---- GameFuse

Account.prototype._load = function () {
    var self = this;
    this.state = 'loading';
    var start = function () {
        GameFuse.setUpGame(self.gameId, self.token, function (message, hasError) {
            if (hasError) {
                self._fail('Could not reach GameFuse: ' + message);
                return;
            }
            self.state = 'ready';
            console.log('[account] GameFuse ready');
            self._refresh();
        });
    };
    if (window.GameFuse) {
        start();
        return;
    }
    var script = document.createElement('script');
    script.src = Account.SDK_URL;
    script.async = true;
    script.onload = start;
    script.onerror = function () { self._fail('Could not load the GameFuse library'); };
    document.head.appendChild(script);
};

Account.prototype._fail = function (message) {
    this.state = 'error';
    this.error = message;
    console.warn('[account] ' + message);
    this._refresh();
};

// The player's own details never go to the log: only whether it worked.
Account.prototype.signIn = function (email, password) {
    if (!this.isReady() || this.busy) return;
    var self = this;
    this.busy = true;
    this.error = '';
    this._render();
    GameFuse.signIn(email, password, function (message, hasError) {
        self.busy = false;
        if (hasError) {
            self.error = message || 'Could not sign in';
            console.log('[account] sign-in refused');
            self._render();
            return;
        }
        self._onSignedIn(email);
    });
};

Account.prototype.signUp = function (email, password, username) {
    if (!this.isReady() || this.busy) return;
    var self = this;
    this.busy = true;
    this.error = '';
    this._render();
    GameFuse.signUp(email, password, password, username, function (message, hasError) {
        self.busy = false;
        if (hasError) {
            self.error = message || 'Could not create the account';
            console.log('[account] sign-up refused');
            self._render();
            return;
        }
        self._onSignedIn(email);
    });
};

Account.prototype._onSignedIn = function (email) {
    this.state = 'in';
    this.user = GameFuseUser.CurrentUser;
    try {
        window.localStorage.setItem(Account.EMAIL_KEY, email);
    } catch (err) {
        // Storage blocked: the address just isn't remembered.
    }
    console.log('[account] signed in as ' + this.name());
    this.app.fire('account:in', this.name());
    if (this.cloudSave) this._pull();
    this.close();
    this._refresh();
};

Account.prototype.signOut = function () {
    if (!this.signedIn()) return;
    if (this.cloudSave) this._push(true);
    console.log('[account] signed out');
    this.state = 'ready';
    this.user = null;
    if (window.GameFuseUser) GameFuseUser.CurrentUser = null;
    this.app.fire('account:out');
    this.close();
    this._refresh();
};

// ---- Cloud save

// Take the better of the two sides, so an older device can't undo newer progress.
Account.merge = function (local, cloud) {
    if (!cloud || typeof cloud !== 'object') return false;
    var changed = false;
    Account.NUMBERS.forEach(function (key) {
        if (typeof cloud[key] === 'number' && cloud[key] > local[key]) {
            local[key] = cloud[key];
            changed = true;
        }
    });
    if (cloud.records && cloud.records.best > local.records.best) {
        local.records.best = cloud.records.best;
        changed = true;
    }
    Account.LISTS.forEach(function (path) {
        var mine = local[path[0]][path[1]];
        var theirs = (cloud[path[0]] || {})[path[1]] || [];
        theirs.forEach(function (id) {
            if (typeof id === 'string' && mine.indexOf(id) === -1) {
                mine.push(id);
                changed = true;
            }
        });
    });
    ['stats', 'feats', 'achievements'].forEach(function (key) {
        var theirs = cloud[key] || {};
        Object.keys(theirs).forEach(function (k) {
            var v = theirs[k];
            if (typeof v === 'number' && !(local[key][k] >= v)) {
                local[key][k] = v;
                changed = true;
            }
        });
    });
    (cloud.zones || []).forEach(function (id) {
        if (typeof id === 'string' && local.zones.indexOf(id) === -1) {
            local.zones.push(id);
            changed = true;
        }
    });
    return changed;
};

Account.prototype._pull = function () {
    var raw = this.user.getAttributeValue ? this.user.getAttributeValue(Account.ATTRIBUTE) : this.user.attributes[Account.ATTRIBUTE];
    var cloud = null;
    try {
        cloud = raw ? JSON.parse(raw) : null;
    } catch (err) {
        cloud = null;
    }
    if (!cloud) {
        console.log('[account] nothing saved on the account yet; sending this profile up');
        this._push(true);
        return;
    }
    var changed = Account.merge(this.progress.data, cloud);
    console.log('[account] cloud profile ' + (changed ? 'merged in' : 'was behind this one'));
    this.progress.commit();
    this._push(true);
};

Account.prototype._push = function (force) {
    if (!this.signedIn() || !this.cloudSave) return;
    var now = Date.now();
    if (!force && now - this.lastSave < Account.SAVE_EVERY * 1000) return;
    this.lastSave = now;
    var data = this.progress.data;
    var slim = {
        wallet: data.wallet, runs: data.runs, xp: data.xp, level: data.level,
        records: { best: data.records.best }, skins: { owned: data.skins.owned }, trails: { owned: data.trails.owned },
        stats: data.stats, feats: data.feats, achievements: data.achievements, zones: data.zones
    };
    this.user.setAttribute(Account.ATTRIBUTE, JSON.stringify(slim), function (message, hasError) {
        if (hasError) console.warn('[account] cloud save failed: ' + message);
    });
};

Account.prototype._onRunOver = function () {
    this._push(false);
};

// ---- Panel

Account.prototype.open = function () {
    if (this.inGameUi || this.isOpen || this.progress.pending || this.game.state === 'playing') return;
    this.isOpen = true;
    this.error = '';
    this.game.hold(true);
    this._render();
    this._panel.classList.add('is-on');
};

Account.prototype.close = function () {
    if (!this.isOpen) return;
    this.isOpen = false;
    this._panel.classList.remove('is-on');
    this.game.hold(false);
};

Account.prototype._onKeyDown = function (e) {
    if (!this.inGameUi && this.isOpen && e.key === pc.KEY_ESCAPE) this.close();
};

Account.prototype._refresh = function () {
    this._renderButton();
    if (this.isOpen) this._render();
    this.app.fire('account:changed');
};

Account.HUD_CSS = [
    '.nr-acc-btn { display: none; align-items: center; gap: 8px; height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(125, 255, 176, 0.55); background: rgba(14, 6, 28, 0.75); color: #7dffb0; font: 800 14px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; letter-spacing: 0.12em; cursor: pointer; }',
    '.nr-acc-btn.is-on { display: flex; }',
    '.nr-acc-btn b { color: #fff; letter-spacing: 0.02em; }',
    '.nr-acc { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center; padding: 12px; background: rgba(8, 3, 18, 0.62); font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; color: #cfc6e6; }',
    '.nr-acc.is-on { display: flex; }',
    '.nr-acc-card { width: 380px; max-width: 100%; max-height: 100%; overflow-y: auto; box-sizing: border-box; padding: 16px 20px 20px; background: rgba(14, 6, 28, 0.96); border: 1px solid rgba(125, 255, 176, 0.5); border-radius: 16px; box-shadow: 0 0 30px rgba(125, 255, 176, 0.18); }',
    '.nr-acc-head { display: flex; align-items: center; margin-bottom: 8px; }',
    '.nr-acc-head h2 { margin: 0; flex: 1; font-size: 19px; letter-spacing: 0.18em; color: #7dffb0; }',
    '.nr-acc-x { width: 30px; height: 30px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.08); color: #fff; font: inherit; font-size: 17px; cursor: pointer; }',
    '.nr-acc-tabs { display: flex; gap: 6px; margin-bottom: 10px; }',
    '.nr-acc-tabs button { flex: 1; padding: 6px 0; border: 1px solid rgba(125, 255, 176, 0.3); border-radius: 8px; background: transparent; color: #7dffb0; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }',
    '.nr-acc-tabs button.is-on { background: rgba(125, 255, 176, 0.16); border-color: #7dffb0; color: #fff; }',
    '.nr-acc label { display: block; margin: 8px 0 3px; font-size: 12px; color: #9d93b8; }',
    '.nr-acc input { width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #fff; font: inherit; font-size: 14px; }',
    '.nr-acc-go { width: 100%; margin-top: 14px; padding: 10px; border: 0; border-radius: 999px; background: #7dffb0; color: #10021c; font: inherit; font-size: 15px; font-weight: 800; letter-spacing: 0.06em; cursor: pointer; }',
    '.nr-acc-go[disabled] { background: rgba(255, 255, 255, 0.15); color: #8a7fa6; cursor: default; }',
    '.nr-acc-note { margin: 12px 0 0; font-size: 11px; line-height: 1.6; color: #8a7fa6; }',
    '.nr-acc-err { margin: 10px 0 0; padding: 7px 10px; border-radius: 8px; background: rgba(255, 77, 106, 0.16); border: 1px solid rgba(255, 77, 106, 0.5); color: #ff9ab0; font-size: 12px; }',
    '.nr-acc-who { margin: 0 0 6px; font-size: 14px; color: #fff; }',
    '.nr-acc-who b { color: #7dffb0; }',
    '.nr-acc-out { margin-top: 12px; padding: 8px 16px; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 999px; background: transparent; color: #cfc6e6; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }'
].join('\n');

Account.prototype._buildHud = function () {
    var self = this;
    this._style = document.createElement('style');
    this._style.textContent = Account.HUD_CSS;
    document.head.appendChild(this._style);

    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.className = 'nr-acc-btn';
    this._button.addEventListener('click', function () { self.open(); });
    this.game.getButtonBar().appendChild(this._button);

    this._panel = document.createElement('div');
    this._panel.className = 'nr-acc';
    document.body.appendChild(this._panel);
    this._panel.addEventListener('click', function (ev) {
        if (ev.target === self._panel || ev.target.closest('[data-close]')) {
            self.close();
            return;
        }
        var tab = ev.target.closest('[data-mode]');
        if (tab) {
            self.mode = tab.getAttribute('data-mode');
            self.error = '';
            self._render();
            return;
        }
        if (ev.target.closest('[data-out]')) {
            self.signOut();
            return;
        }
        if (ev.target.closest('[data-go]')) self._submit();
    });
    this._panel.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') self._submit();
    });
};

Account.prototype._submit = function () {
    var email = this._panel.querySelector('[name=email]');
    var password = this._panel.querySelector('[name=password]');
    var username = this._panel.querySelector('[name=username]');
    if (!email || !password) return;
    if (this.mode === 'up') this.signUp(email.value.trim(), password.value, username ? username.value.trim() : '');
    else this.signIn(email.value.trim(), password.value);
};

Account.prototype._renderButton = function () {
    if (this.inGameUi) return;
    var show = this.state !== 'off' && (this.game.state === 'ready' || this.game.state === 'over');
    this._button.classList.toggle('is-on', show);
    this._button.innerHTML = this.signedIn() ? 'ACCOUNT <b>' + this.name() + '</b>' :
        this.state === 'loading' ? 'CONNECTING…' : 'JOIN';
};

Account.prototype._render = function () {
    if (this.inGameUi || !this.isOpen) return;
    var body;
    if (this.signedIn()) {
        body = '<p class="nr-acc-who">Signed in as <b>' + this.name() + '</b></p>' +
            '<p class="nr-acc-note">Your coins, level, trophies and records are kept on this account, so you can carry on in another browser. Your scores appear on the leaderboard.</p>' +
            '<button class="nr-acc-out" type="button" data-out>Sign out</button>';
    } else if (this.state === 'error') {
        body = '<p class="nr-acc-err">' + this.error + '</p><p class="nr-acc-note">The game plays normally offline; only the leaderboard and cloud save need a connection.</p>';
    } else {
        var email = '';
        try {
            email = window.localStorage.getItem(Account.EMAIL_KEY) || '';
        } catch (err) {
            email = '';
        }
        var up = this.mode === 'up';
        body = '<div class="nr-acc-tabs">' +
            '<button type="button" data-mode="in"' + (up ? '' : ' class="is-on"') + '>Sign in</button>' +
            '<button type="button" data-mode="up"' + (up ? ' class="is-on"' : '') + '>Create account</button></div>' +
            (up ? '<label for="nr-user">Name on the leaderboard</label><input id="nr-user" name="username" type="text" maxlength="20" autocomplete="nickname">' : '') +
            '<label for="nr-email">Email</label><input id="nr-email" name="email" type="email" autocomplete="email" value="' + email.replace(/"/g, '&quot;') + '">' +
            '<label for="nr-pass">Password</label><input id="nr-pass" name="password" type="password" autocomplete="' + (up ? 'new-password' : 'current-password') + '">' +
            (this.error ? '<p class="nr-acc-err">' + this.error + '</p>' : '') +
            '<button class="nr-acc-go" type="button" data-go' + (this.busy ? ' disabled' : '') + '>' +
            (this.busy ? 'Please wait…' : up ? 'Create account' : 'Sign in') + '</button>' +
            '<p class="nr-acc-note">Accounts are handled by GameFuse, an outside service; your email and password go to them, not to this game. Playing without an account works exactly the same, minus the leaderboard.</p>';
    }
    this._panel.innerHTML = '<div class="nr-acc-card"><div class="nr-acc-head"><h2>' + (this.signedIn() ? 'ACCOUNT' : 'JOIN') + '</h2>' +
        '<button class="nr-acc-x" type="button" data-close aria-label="Close">×</button></div>' + body + '</div>';
    var first = this._panel.querySelector('input');
    if (first && !this.busy) first.focus();
};

Account.prototype._onDestroy = function () {
    this.app.off('game:state', this._renderButton, this);
    this.app.off('progress:runOver', this._onRunOver, this);
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    if (this.isOpen) this.game.hold(false);
    if (this.inGameUi) return;
    this._button.remove();
    this._panel.remove();
    this._style.remove();
};
