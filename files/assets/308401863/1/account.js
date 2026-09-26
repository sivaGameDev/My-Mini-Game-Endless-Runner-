var Account = pc.createScript('account');

// User account system compatible with uiScreens.js
// Uses localStorage for persistence - no backend required.
Account.prototype.initialize = function () {
    this.game = this.app.root.findByName('Game').script.gameManager;
    this.state = 'off';   // 'off' | 'in' | 'up' | 'busy'
    this.user = null;      // { id, username, email }
    this.error = '';
    this.busy = false;

    this._loadSession();
    this._listen();

    console.log('[account] initialized, state:', this.state, this.user ? '(' + this.user.username + ')' : '');
};

// ---- Persistence

Account.prototype._loadSession = function () {
    try {
        var saved = JSON.parse(window.localStorage.getItem('neonRunner.accountState'));
        if (saved && saved.user) {
            this.user = saved.user;
            this.state = 'in';
        }
    } catch (e) {}
};

Account.prototype._saveSession = function () {
    try {
        window.localStorage.setItem('neonRunner.accountState', JSON.stringify({ user: this.user }));
    } catch (e) {}
};

Account.prototype._clearSession = function () {
    this.user = null;
    this.state = 'off';
    try { window.localStorage.removeItem('neonRunner.accountState'); } catch (e) {}
};

// ---- API required by uiScreens.js

Account.prototype.signedIn = function () { return this.state === 'in' && !!this.user; };
Account.prototype.name = function () { return this.user ? this.user.username : ''; };
Account.prototype.signUp = function (email, password, username) {
    if (this.state !== 'off') return;
    this.state = 'up';
    this.error = '';
    this.busy = true;
    var self = this;
    setTimeout(function () {
        try {
            var users = JSON.parse(window.localStorage.getItem('neonRunner.users') || '{}');
            for (var id in users) {
                if (users[id].email === email) { self.error = 'Email already used'; self.state = 'up'; self.busy = false; self._fire(); return; }
                if (users[id].username === username) { self.error = 'Name taken'; self.state = 'up'; self.busy = false; self._fire(); return; }
            }
            var uid = 'u' + Date.now() + Math.random().toString(36).substr(2, 6);
            users[uid] = { id: uid, username: username, email: email, password: self._hash(password), created: Date.now() };
            window.localStorage.setItem('neonRunner.users', JSON.stringify(users));
            self.user = { id: uid, username: username, email: email };
            self.state = 'in';
            self.busy = false;
            self._saveSession();
            self._fire('in');
            console.log('[account] signed up:', username);
        } catch (e) { self.error = 'Could not create account'; self.state = 'up'; self.busy = false; self._fire(); }
    }, 250);
};

Account.prototype.signIn = function (email, password) {
    if (this.state !== 'off') return;
    this.state = 'in';
    this.error = '';
    this.busy = true;
    var self = this;
    setTimeout(function () {
        try {
            var users = JSON.parse(window.localStorage.getItem('neonRunner.users') || '{}');
            var h = self._hash(password);
            for (var id in users) {
                var u = users[id];
                if (u.email === email && u.password === h) {
                    self.user = { id: u.id, username: u.username, email: u.email };
                    self.state = 'in';
                    self.busy = false;
                    self._saveSession();
                    self._fire('in');
                    console.log('[account] signed in:', u.username);
                    return;
                }
            }
            self.error = 'Wrong email or password';
            self.state = 'off';
            self.busy = false;
            self._fire();
        } catch (e) { self.error = 'Could not sign in'; self.state = 'off'; self.busy = false; self._fire(); }
    }, 250);
};

Account.prototype.signOut = function () {
    console.log('[account] signed out');
    this._clearSession();
    this._fire('out');
};

// ---- Events

Account.prototype._listen = function () {
    this.app.on('account:login', function (u) { this.user = u; this.state = 'in'; }, this);
    this.app.on('account:logout', function () { this.user = null; this.state = 'off'; }, this);
};

Account.prototype._fire = function (which) {
    which = which || (this.error ? 'out' : 'in');
    this.app.fire('account:' + which, this.user);
    this.app.fire('ui:refresh');
};

// ---- Helper

Account.prototype._hash = function (s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
};