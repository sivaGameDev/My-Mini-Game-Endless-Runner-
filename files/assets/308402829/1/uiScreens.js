var UiScreens = pc.createScript('uiScreens');

UiScreens.attributes.add('fontBold', { type: 'asset', assetType: 'font', title: 'Bold Font', description: 'Used for titles and buttons' });
UiScreens.attributes.add('fontBody', { type: 'asset', assetType: 'font', title: 'Body Font', description: 'Used for the smaller text' });

UiScreens.ROWS = 10; // places listed on the leaderboard
UiScreens.CODE_URL = 'https://github.com/sivaGameDev';
UiScreens.CODE_ICON = 'Git Logo.png';   // in the UI folder; without it the button falls back to </>
UiScreens.SITE_URL = 'https://sivagamedev.github.io/My-ProtFoliyo/';

// The game's own menus, built from entities under a 2D screen: the start screen, the join/sign-in
// panel and the leaderboard. They live in the scene, so they scale and sit with the game rather than
// floating over it in a web page. The shop, profile and settings pages are still HTML for now and
// open from here. While a menu is up the game ignores taps, so only its buttons act.
UiScreens.prototype.initialize = function () {
    var game = this.app.root.findByName('Game');
    this.game = game.script.gameManager;
    this.progress = game.script.progress;
    this.levels = game.script.levels || null;
    this.account = game.script.account || null;
    this.board = game.script.leaderboard || null;
    this.shop = game.script.shop || null;
    this.profile = game.script.achievements || null;
    this.settings = game.script.settings || null;
    this.panel = null;
    this.tab = 'in';      // join panel: 'in' or 'up'
    this.boardTab = 'daily';
    this.built = false;
    this.panels = {};     // name -> { entity, refresh, scope }
    this._waiting = [];   // scripts that want to add their own panels once the kit is up

    UiKit.screenEntity = this.entity;
    var self = this;
    UiKit.ready(this.app, { bold: this.fontBold, body: this.fontBody }, function () {
        self._build();
        self.built = true;
        self._waiting.splice(0).forEach(function (fn) { fn(); });
        self._show(null);
        self._refresh();
    });

    this.app.on('game:state', this._refresh, this);
    this.app.on('progress:changed', this._refresh, this);
    this.app.on('ui:refresh', this._refresh, this);
    this.app.on('account:changed', this._refresh, this);
    this.app.on('account:in', this._refresh, this);
    this.app.on('account:out', this._refresh, this);
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    this.on('destroy', this._onDestroy, this);
};

UiScreens.prototype.postInitialize = function () {
    if (this.game.setExternalMenu) this.game.setExternalMenu(true); // the HTML start panel steps aside
};

// ---- Building

UiScreens.prototype._build = function () {
    var self = this;
    this.root = UiKit.group(this.entity, 'Screens', { anchor: [0, 0, 1, 1], margin: [0, 0, 0, 0] });
    this.dim = UiKit.group(this.root, 'Dim', {
        anchor: [0, 0, 1, 1], margin: [0, 0, 0, 0], color: [0.02, 0.01, 0.05], opacity: 0.55, useInput: true
    });
    this._buildStart();
    if (this.account) this._buildJoin();
    if (this.board) this._buildBoard();
    this._buildPause();
    this._buildCodeLink();
};

UiScreens.prototype._buildStart = function () {
    var self = this;
    var card = UiKit.card(this.root, 'StartPanel', 560, 520);
    this.startPanel = card;
    var top = function (y, opts) {
        opts.anchor = [0.5, 1, 0.5, 1];
        opts.pivot = [0.5, 1];
        opts.position = [0, -y];
        return opts;
    };
    UiKit.text(card, 'Title', top(26, { text: 'NEON RUNNER', size: 46, color: UiKit.COLORS.magenta }));
    this.startStatus = UiKit.text(card, 'Status', top(88, { text: '', size: 18, color: UiKit.COLORS.dim, bold: false }));
    UiKit.button(card, 'Play', top(122, {
        text: 'PLAY', width: 320, height: 64, size: 24, solid: true, accent: UiKit.COLORS.cyan,
        onClick: function () { self._play(); }
    }));
    this.joinButton = UiKit.button(card, 'Join', top(202, {
        text: 'JOIN', width: 250, height: 46, accent: UiKit.COLORS.green,
        onClick: function () { self._open('join'); }
    }));
    this.boardButton = UiKit.button(card, 'Board', top(256, {
        text: 'LEADERBOARD', width: 250, height: 46, accent: UiKit.COLORS.gold,
        onClick: function () { self._openBoard(); }
    }));
    // Everything below the join and board buttons slides up when those are hidden.
    this.startRows = [];
    var row = function (entity, y) {
        self.startRows.push([entity, y]);
        return entity;
    };
    var small = [
        ['Shop', 'SHOP', function () { self._open('shop'); }],
        ['Profile', 'PROFILE', function () { self._open('profile'); }],
        ['Settings', 'SETTINGS', function () { self._open('settings'); }]
    ];
    small.forEach(function (b, i) {
        row(UiKit.button(card, b[0], {
            anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [(i - 1) * 176, -312],
            text: b[1], width: 170, height: 42, size: 15, accent: UiKit.COLORS.dim,
            onClick: b[2]
        }), 312);
    });
    this.missionTitle = row(UiKit.text(card, 'MissionsTitle', top(368, { text: "TODAY'S MISSIONS", size: 14, color: UiKit.COLORS.cyan })), 368);
    this.missionLines = [];
    for (var i = 0; i < 3; i++) {
        this.missionLines.push(row(UiKit.text(card, 'Mission' + i, top(392 + i * 26, { text: '', size: 16, color: UiKit.COLORS.dim, bold: false })), 392 + i * 26));
    }
    row(UiKit.text(card, 'Hint', top(484, {
        text: 'Arrows move  -  Up jumps  -  Down slides  -  P pause  -  M sound', size: 14, width: 520, color: UiKit.COLORS.faint, bold: false
    })), 484);
};

// The pause control: top of the screen during a run, and the way back out of a pause.
UiScreens.prototype._buildPause = function () {
    var self = this;
    this.pauseButton = UiKit.button(this.root, 'PauseButton', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -14],
        text: 'II', width: 58, height: 44, size: 16, accent: UiKit.COLORS.magenta,
        onClick: function () { self._togglePause(); }
    });
    this.pauseButton.enabled = false;
};

// A way to the source from inside the game. It sits out of the way during a run.
UiScreens.prototype._buildCodeLink = function () {
    var self = this;
    var logo = this.app.assets.find(UiScreens.CODE_ICON, 'texture');
    this.codeButton = UiKit.button(this.root, 'CodeLink', {
        anchor: [0, 1, 0, 1], pivot: [0, 1], position: [14, -14],
        width: 44, height: 44, accent: logo ? [1, 1, 1] : UiKit.COLORS.dim, solid: !!logo,
        texture: logo ? logo.id : null, iconSize: 32,
        text: '</>', size: 16,
        onClick: function () { self._openLink(UiScreens.CODE_URL); }
    });
    if (!logo) console.warn('[ui] ' + UiScreens.CODE_ICON + ' not found: showing the text mark');
    this.codeButton.enabled = false;

    this.siteButton = UiKit.button(this.root, 'SiteLink', {
        anchor: [0, 1, 0, 1], pivot: [0, 1], position: [66, -14],
        text: 'PORTFOLIO', width: 132, height: 44, size: 13, accent: UiKit.COLORS.cyan,
        onClick: function () { self._openLink(UiScreens.SITE_URL); }
    });
    this.siteButton.enabled = false;
};

// Opening in a new tab keeps the run alive behind it. The click itself is the gesture a browser
// wants, so this is not treated as a pop-up.
UiScreens.prototype._openLink = function (url) {
    var now = Date.now();
    if (now - (this._linkAt || 0) < 600) return;   // one tap, one tab
    this._linkAt = now;
    try {
        window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
        window.location.href = url;
    }
};

UiScreens.prototype._togglePause = function () {
    // One tap can arrive twice - as a touch and again as a mouse event on a phone. Without this the
    // pause flips twice in the same instant and lands back where it started.
    var now = Date.now();
    if (now - (this._pausedAt || 0) < 250) return;
    this._pausedAt = now;
    if (this.game.state === 'playing') this.game.pause();
    else if (this.game.state === 'paused') this.game.resume();
};

// Offline (no GameFuse game set up) there is no join or board button, so the panel closes the gap.
UiScreens.prototype._layoutStart = function (online) {
    if (this.startOnline === online) return;
    this.startOnline = online;
    var drop = online ? 0 : 110;
    this.startRows.forEach(function (entry) {
        entry[0].setLocalPosition(entry[0].getLocalPosition().x, -(entry[1] - drop), 0);
    });
    this.startPanel.element.height = 520 - drop;
};

UiScreens.prototype._buildJoin = function () {
    var self = this;
    var card = UiKit.card(this.root, 'JoinPanel', 460, 440);
    this.joinPanel = card;
    UiKit.text(card, 'Title', { anchor: [0, 1, 0, 1], pivot: [0, 1], position: [24, -22], text: 'JOIN', size: 26, color: UiKit.COLORS.green });
    UiKit.button(card, 'Close', {
        anchor: [1, 1, 1, 1], pivot: [1, 1], position: [-14, -14], text: 'X', width: 38, height: 38, size: 18,
        accent: UiKit.COLORS.dim, onClick: function () { self._back(); }
    });
    this.tabIn = UiKit.button(card, 'TabIn', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [-105, -74], text: 'Sign in', width: 200, height: 40, size: 15,
        accent: UiKit.COLORS.green, onClick: function () { self._joinTab('in'); }
    });
    this.tabUp = UiKit.button(card, 'TabUp', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [105, -74], text: 'Create account', width: 200, height: 40, size: 15,
        accent: UiKit.COLORS.green, onClick: function () { self._joinTab('up'); }
    });
    var field = function (name, y, opts) {
        opts.anchor = [0.5, 1, 0.5, 1];
        opts.pivot = [0.5, 1];
        opts.position = [0, -y];
        opts.width = 400;
        opts.onEnter = function () { self._submitJoin(); };
        return UiKit.field(card, name, opts);
    };
    this.nameField = field('Name', 134, { label: 'Name on the leaderboard', maxLength: 20, autocomplete: 'nickname' });
    this.emailField = field('Email', 198, { label: 'Email', email: true, autocomplete: 'email' });
    this.passField = field('Password', 262, { label: 'Password', password: true, autocomplete: 'current-password' });
    this.joinGo = UiKit.button(card, 'Go', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -326],
        text: 'Sign in', width: 400, height: 50, size: 18, solid: true, accent: UiKit.COLORS.green,
        onClick: function () { self._submitJoin(); }
    });
    this.joinMessage = UiKit.text(card, 'Message', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -388], width: 400,
        text: '', size: 14, color: UiKit.COLORS.faint, bold: false
    });
    this.signOutButton = UiKit.button(card, 'SignOut', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -180], text: 'Sign out', width: 200, height: 44,
        accent: UiKit.COLORS.dim, onClick: function () { if (self.account) self.account.signOut(); }
    });
    this.whoText = UiKit.text(card, 'Who', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -120], width: 400,
        text: '', size: 18, color: UiKit.COLORS.text
    });
};

UiScreens.prototype._buildBoard = function () {
    var self = this;
    var card = UiKit.card(this.root, 'BoardPanel', 620, 500);
    this.boardPanel = card;
    UiKit.text(card, 'Title', { anchor: [0, 1, 0, 1], pivot: [0, 1], position: [24, -22], text: 'LEADERBOARD', size: 26, color: UiKit.COLORS.gold });
    UiKit.button(card, 'Close', {
        anchor: [1, 1, 1, 1], pivot: [1, 1], position: [-14, -14], text: 'X', width: 38, height: 38, size: 18,
        accent: UiKit.COLORS.dim, onClick: function () { self._back(); }
    });
    this.boardTabToday = UiKit.button(card, 'TabToday', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [-150, -74], text: 'Today', width: 180, height: 38, size: 15,
        accent: UiKit.COLORS.gold, onClick: function () { self._boardTab('daily'); }
    });
    this.boardTabAll = UiKit.button(card, 'TabAll', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [40, -74], text: 'All time', width: 180, height: 38, size: 15,
        accent: UiKit.COLORS.gold, onClick: function () { self._boardTab('alltime'); }
    });
    UiKit.button(card, 'Refresh', {
        anchor: [1, 1, 1, 1], pivot: [1, 1], position: [-20, -66], text: 'Refresh', width: 110, height: 38, size: 14,
        accent: UiKit.COLORS.dim, onClick: function () { self._openBoard(true); }
    });
    this.boardRows = [];
    for (var i = 0; i < UiScreens.ROWS; i++) {
        var y = 126 + i * 32;
        var row = UiKit.group(card, 'Row' + i, { anchor: [0, 1, 1, 1], pivot: [0.5, 1], margin: [20, 0, 20, 0], height: 28, position: [0, -y] });
        row.cells = {
            rank: UiKit.text(row, 'Rank', { anchor: [0, 0, 0, 1], pivot: [0, 0.5], position: [4, 0], text: '', size: 16, color: UiKit.COLORS.faint, bold: false }),
            who: UiKit.text(row, 'Name', { anchor: [0, 0, 0, 1], pivot: [0, 0.5], position: [44, 0], text: '', size: 16, color: UiKit.COLORS.text, bold: false }),
            dist: UiKit.text(row, 'Dist', { anchor: [1, 0, 1, 1], pivot: [1, 0.5], position: [-120, 0], text: '', size: 15, color: UiKit.COLORS.faint, bold: false }),
            score: UiKit.text(row, 'Score', { anchor: [1, 0, 1, 1], pivot: [1, 0.5], position: [-4, 0], text: '', size: 16, color: UiKit.COLORS.gold })
        };
        this.boardRows.push(row);
    }
    this.boardNote = UiKit.text(card, 'Note', {
        anchor: [0.5, 0.5, 0.5, 0.5], pivot: [0.5, 0.5], position: [0, -30], width: 460,
        text: '', size: 16, color: UiKit.COLORS.dim, bold: false
    });
    this.boardJoin = UiKit.button(card, 'JoinFromBoard', {
        anchor: [0.5, 0, 0.5, 0], pivot: [0.5, 0], position: [0, 28], text: 'Join or sign in', width: 240, height: 46,
        solid: true, accent: UiKit.COLORS.green, onClick: function () { self._open('join'); }
    });
};

// ---- Behaviour

UiScreens.prototype._play = function () {
    this._show(null);
    this.game.hold(false);
    this.game.start();
};

// How other scripts open a panel by name ('shop', 'profile', 'settings', 'join', 'board').
UiScreens.prototype.open = function (name) {
    if (!this.built || (name && name !== 'start' && !this.panels[name] && ['join', 'board'].indexOf(name) === -1)) return;
    if (name === 'board') this._openBoard();
    else this._open(name);
};

UiScreens.prototype.isOpen = function (name) {
    return this.panel === name;
};

UiScreens.prototype._openBoard = function (force) {
    this._show('board');
    if (this.board && this.board.fetchTab) this.board.fetchTab(this.boardTab, !!force);
    this._refresh();
};

// Shows a panel and fills it in. _show on its own only swaps which panel is visible.
UiScreens.prototype._open = function (panel) {
    this._show(panel);
    this._refresh();
};

UiScreens.prototype._boardTab = function (tab) {
    this.boardTab = tab;
    this._openBoard(false);
};

UiScreens.prototype._joinTab = function (tab) {
    this.tab = tab;
    if (this.account) this.account.error = '';
    this._refresh();
};

UiScreens.prototype._submitJoin = function () {
    if (!this.account || this.panel !== 'join') return;
    var email = this.emailField.field.get().trim();
    var password = this.passField.field.get();
    if (this.tab === 'up') this.account.signUp(email, password, this.nameField.field.get().trim());
    else this.account.signIn(email, password);
    this.passField.field.clear();
    this._refresh();
};

// Another script (the shop, profile and settings pages) hands its panel over to be shown here, so
// one place owns which panel is up, the dim behind it and the hold on the game.
UiScreens.prototype.registerPanel = function (name, entity, refresh, scope) {
    this.panels[name] = { entity: entity, refresh: refresh, scope: scope };
    entity.enabled = this.panel === name;
};

// Runs `fn` once the panels exist (the kit waits for its fonts first).
UiScreens.prototype.onBuilt = function (fn, scope) {
    if (this.built) fn.call(scope);
    else this._waiting.push(function () { fn.call(scope); });
};

// Shows one panel (or none) and stops the game reacting to taps while a menu is up.
UiScreens.prototype._show = function (panel) {
    if (!this.built) return;   // the panels are not there yet; the first refresh sets the state
    this.panel = panel;
    this.dim.enabled = !!panel;
    this.startPanel.enabled = panel === 'start';
    if (this.joinPanel) this.joinPanel.enabled = panel === 'join';
    if (this.boardPanel) this.boardPanel.enabled = panel === 'board';
    Object.keys(this.panels).forEach(function (name) {
        this.panels[name].entity.enabled = panel === name;
    }, this);
    this.game.hold(!!panel);
    // After a crash the HTML card and dock are on screen: they step aside while a panel is up.
    if (this.game.setHudAside) this.game.setHudAside(!!panel);
    if (panel === 'join' && this.account && !this.account.signedIn()) {
        var self = this;
        setTimeout(function () { self.emailField.field.focus(); }, 30);
    }
};

UiScreens.prototype._onKeyDown = function (e) {
    if (!this.built) return;
    if (this.panel === 'start' && (e.key === pc.KEY_SPACE || e.key === pc.KEY_ENTER)) {
        e.event.preventDefault();
        this._play();
    } else if (this.panel && this.panel !== 'start' && e.key === pc.KEY_ESCAPE) {
        this._back();
    }
};

// Closing a panel goes back to the home screen, or clears the way for the crash card after a run.
UiScreens.prototype._back = function () {
    this._open(this.game.state === 'ready' ? 'start' : null);
};

// ---- Filling in the text

UiScreens.prototype._refresh = function () {
    if (!this.built) return;
    var state = this.game.state;
    if (this.pauseButton) {
        this.pauseButton.enabled = state === 'playing' || state === 'paused';
        this.pauseButton.setText(state === 'paused' ? 'GO' : 'II');
    }
    if (this.codeButton) this.codeButton.enabled = state === 'ready';
    if (this.siteButton) this.siteButton.enabled = state === 'ready';
    // The home screen belongs to 'ready'; a run clears whatever is up. After a crash the pages can
    // still be opened from the dock, so only the start panel is sent away.
    if (state === 'ready' && !this.panel) this._show('start');
    else if (state === 'playing' && this.panel) this._show(null);
    else if (state !== 'ready' && this.panel === 'start') this._show(null);
    if (!this.panel) return;

    if (this.panel === 'start') this._refreshStart();
    if (this.panel === 'join' && this.joinPanel) this._refreshJoin();
    if (this.panel === 'board' && this.boardPanel) this._refreshBoard();
    var page = this.panels[this.panel];
    if (page && page.refresh) page.refresh.call(page.scope);
};

UiScreens.prototype._refreshStart = function () {
    var data = this.progress.data;
    var bits = [];
    if (this.levels) bits.push('Lv ' + this.levels.getLevel().level);
    bits.push(Progress.fmt(data.wallet) + ' coins');
    if (data.streak.count > 0) bits.push('Day ' + data.streak.count + ' streak');
    if (data.records.best > 0) bits.push('Best ' + Progress.fmt(data.records.best) + ' m');
    this.startStatus.setText(bits.join('   -   '));

    var missions = this.progress.data.missions.list;
    this.missionLines.forEach(function (line, i) {
        var m = missions[i];
        if (!m) {
            line.setText('');
            return;
        }
        var def = Progress.byId[m.id];
        line.setText(def.text + (m.done ? '  DONE' : '  ' + Progress.fmt(m.progress) + '/' + Progress.fmt(def.target)));
        var c = m.done ? UiKit.COLORS.green : UiKit.COLORS.dim;
        line.setColor(c);
    });
    var online = !!(this.account && this.account.state !== 'off');
    this.joinButton.enabled = online;
    this.boardButton.enabled = online;
    this._layoutStart(online);
    if (online) this.joinButton.setText(this.account.signedIn() ? this.account.name() : 'JOIN');
};

UiScreens.prototype._layoutJoin = function (mode) {
    if (this.joinMode === mode) return;
    this.joinMode = mode;
    var at = function (entity, y) { entity.setLocalPosition(entity.getLocalPosition().x, -y, 0); };
    if (mode === 'me') {
        at(this.whoText, 120);
        at(this.signOutButton, 168);
        at(this.joinMessage, 240);
        this.joinPanel.element.height = 320;
        return;
    }
    var creating = mode === 'up';
    at(this.emailField, creating ? 198 : 134);
    at(this.passField, creating ? 262 : 198);
    at(this.joinGo, creating ? 326 : 262);
    at(this.joinMessage, creating ? 388 : 324);
    this.joinPanel.element.height = creating ? 456 : 392;
};

UiScreens.prototype._refreshJoin = function () {
    var account = this.account;
    var signedIn = account && account.signedIn();
    var creating = this.tab === 'up';
    this.tabIn.enabled = !signedIn;
    this.tabUp.enabled = !signedIn;
    this.nameField.enabled = !signedIn && creating;
    this.emailField.enabled = !signedIn;
    this.passField.enabled = !signedIn;
    this.joinGo.enabled = !signedIn;
    this.signOutButton.enabled = !!signedIn;
    this.whoText.enabled = !!signedIn;
    this._layoutJoin(signedIn ? 'me' : creating ? 'up' : 'in');
    this.tabIn.setAccent(creating ? UiKit.COLORS.faint : UiKit.COLORS.green);
    this.tabUp.setAccent(creating ? UiKit.COLORS.green : UiKit.COLORS.faint);
    this.joinGo.setText(account && account.busy ? 'Please wait...' : creating ? 'Create account' : 'Sign in');
    if (signedIn) {
        this.whoText.setText('Signed in as ' + account.name());
        this.joinMessage.setText('Your progress is kept on this account and your scores go on the leaderboard.');
        this.joinMessage.setColor(UiKit.COLORS.faint);
        return;
    }
    var error = account ? account.error : 'Online play is not set up';
    var c = error ? UiKit.COLORS.red : UiKit.COLORS.faint;
    this.joinMessage.setColor(c);
    this.joinMessage.setText(error ||
        'Accounts are handled by GameFuse. Playing without one works the same, minus the leaderboard.');
};

UiScreens.prototype._refreshBoard = function () {
    var self = this;
    var live = this.account && this.account.signedIn();
    this.boardTabToday.setAccent(this.boardTab === 'daily' ? UiKit.COLORS.gold : UiKit.COLORS.faint);
    this.boardTabAll.setAccent(this.boardTab === 'alltime' ? UiKit.COLORS.gold : UiKit.COLORS.faint);
    var board = live && this.board ? this.board.boardFor(this.boardTab) : null;
    var entries = board && board.entries ? board.entries : [];
    var note = '';
    if (!live) note = 'The leaderboard needs an account, so scores have a name against them.';
    else if (board && board.loading && !entries.length) note = 'Loading...';
    else if (board && board.error) note = board.error;
    else if (!entries.length) note = 'No scores here yet. Be the first.';
    this.boardNote.setText(note);
    this.boardNote.enabled = !!note;
    this.boardJoin.enabled = !live;

    var me = live ? this.account.name() : '';
    this.boardRows.forEach(function (row, i) {
        var entry = entries[i];
        row.enabled = !!entry;
        if (!entry) return;
        var extras = {};
        try {
            extras = entry.getExtraAttributes() || {};
        } catch (err) {
            extras = {};
        }
        var name = String(entry.getUsername() || 'Player');
        var mine = name === me;
        row.cells.rank.setText('' + (i + 1));
        row.cells.who.setText(name);
        row.cells.dist.setText(extras.distance ? Progress.fmt(extras.distance) + ' m' : '');
        row.cells.score.setText(Progress.fmt(entry.getScore()));
        var c = mine ? UiKit.COLORS.gold : UiKit.COLORS.text;
        row.cells.who.setColor(c);
    });
    if (this.board) this.board.onUpdate = function () { self._refreshBoard(); };
};

UiScreens.prototype._onDestroy = function () {
    this.app.off('game:state', this._refresh, this);
    this.app.off('progress:changed', this._refresh, this);
    this.app.off('ui:refresh', this._refresh, this);
    this.app.off('account:changed', this._refresh, this);
    this.app.off('account:in', this._refresh, this);
    this.app.off('account:out', this._refresh, this);
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    if (this.game.setExternalMenu) this.game.setExternalMenu(false);
    this.game.hold(false);
    UiKit.destroy(this.root);
};
