var Leaderboard = pc.createScript('leaderboard');

// Leaderboard compatible with uiScreens.js
// Uses localStorage for persistence.
Leaderboard.prototype.initialize = function () {
    this.game    = this.app.root.findByName('Game').script.gameManager;
    this.account = this.app.root.findByName('Game').script.account;
    this.scores  = [];
    this.personalBest = 0;
    this.boards = {};   // 'daily' | 'alltime' -> { entries: [], loading: bool, error: '', onUpdate: fn }

    this._loadScores();
    this._listen();

    console.log('[leaderboard] initialized, ' + this.scores.length + ' scores');
};

// ---- Data

Leaderboard.prototype._loadScores = function () {
    try {
        var raw = JSON.parse(window.localStorage.getItem('neonRunner.leaderboard') || '[]');
        this.scores = raw.sort(function (a, b) { return b.score - a.score; });
        this.personalBest = parseInt(window.localStorage.getItem('neonRunner.personalBest') || '0', 10);
    } catch (e) { this.scores = []; }
};

Leaderboard.prototype._saveScores = function () {
    try {
        window.localStorage.setItem('neonRunner.leaderboard', JSON.stringify(this.scores.slice(0, 200)));
        window.localStorage.setItem('neonRunner.personalBest', String(this.personalBest));
    } catch (e) {}
};

// ---- API required by uiScreens.js

Leaderboard.prototype.fetchTab = function (tab, force) {
    var self = this;
    var board = this.boards[tab] || { entries: [], loading: true, error: '', onUpdate: null };
    this.boards[tab] = board;
    board.loading = true;
    board.error = '';

    setTimeout(function () {
        var entries = self._getEntries(tab);
        board.entries = entries;
        board.loading = false;
        if (board.onUpdate) board.onUpdate();
        self.app.fire('ui:refresh');
    }, 100);
};

Leaderboard.prototype.boardFor = function (tab) {
    return this.boards[tab] || { entries: [], loading: false, error: '', onUpdate: null };
};

// Entry wrapper for uiScreens API
function LeaderboardEntry(data) {
    this._data = data;
}
LeaderboardEntry.prototype.getUsername = function () { return this._data.username; };
LeaderboardEntry.prototype.getScore = function () { return this._data.score; };
LeaderboardEntry.prototype.getExtraAttributes = function () { return { distance: this._data.score }; };

Leaderboard.prototype._getEntries = function (tab) {
    var today = new Date().toLocaleDateString();
    var filtered = tab === 'daily' ? this.scores.filter(function (s) { return s.date === today; }) : this.scores;
    return filtered.slice(0, 20).map(function (s) { return new LeaderboardEntry(s); });
};

Leaderboard.prototype.submitScore = function (score) {
    var username = this.account && this.account.signedIn() ? this.account.name() : 'Guest';
    var userId = this.account && this.account.signedIn() ? this.account.name() : null;
    var entry = { username: username, userId: userId, score: Math.floor(score), ts: Date.now(), date: new Date().toLocaleDateString() };
    this.scores.push(entry);
    this.scores.sort(function (a, b) { return b.score - a.score; });
    if (entry.score > this.personalBest) this.personalBest = entry.score;
    this._saveScores();
    console.log('[leaderboard] score:', entry.score, 'by', entry.username);
    // Refresh boards
    ['daily', 'alltime'].forEach(function (tab) {
        if (this.boards[tab]) this.fetchTab(tab, true);
    }, this);
    this.app.fire('ui:refresh');
};

// ---- Events

Leaderboard.prototype._listen = function () {
    this.app.on('progress:runOver', function (run) {
        if (run && run.distance > 0) this.submitScore(run.distance);
    }, this);
};

Leaderboard.prototype._onDestroy = function () {};