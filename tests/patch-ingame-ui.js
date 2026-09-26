// One-off patch: hand the start screen, join panel and leaderboard to the in-game UI.
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

patch('uiScreens.js', [
[`        line.element.text = (m.done ? '✓ ' : '') + def.text + (m.done ? '' : '  ' + Progress.fmt(m.progress) + '/' + Progress.fmt(def.target));
        line.element.color = new pc.Color.apply ? line.element.color : line.element.color;
        var c = m.done`, `        line.element.text = (m.done ? '✓ ' : '') + def.text + (m.done ? '' : '  ' + Progress.fmt(m.progress) + '/' + Progress.fmt(def.target));
        var c = m.done`]
]);

patch('gameManager.js', [
[`// Where other scripts put their buttons: the home screen's menu row, or the corner after a crash`,
 `// The in-game menus take over the start screen: the HTML one stands down.
GameManager.prototype.setExternalMenu = function (on) {
    this.externalMenu = on;
    this._hud.root.classList.toggle('is-external', on);
    this._renderHud();
};

// Where other scripts put their buttons: the home screen's menu row, or the corner after a crash`],
[`    '.nr-hud.is-home .nr-top { display: none; }',`,
 `    '.nr-hud.is-home .nr-top { display: none; }',
    '.nr-hud.is-external .nr-panel[data-panel="ready"] { display: none; }',`],
[`    var home = this.state === 'ready';
    h.root.classList.toggle('is-home', home); // the score and coins belong to a run`,
 `    var home = this.state === 'ready' && !this.externalMenu;
    h.root.classList.toggle('is-home', this.state === 'ready'); // the score and coins belong to a run`]
]);

patch('account.js', [
[`    this._buildHud();
    this.app.on('game:state', this._renderButton, this);`, `    // With the in-game menus present, they own the join screen and this script is only the logic.
    var ui = this.app.root.findByName('UI');
    this.inGameUi = !!(ui && ui.script && ui.script.uiScreens);
    if (!this.inGameUi) this._buildHud();
    this.app.on('game:state', this._renderButton, this);`],
[`Account.prototype.open = function () {
    if (this.isOpen || this.progress.pending || this.game.state === 'playing') return;`,
 `Account.prototype.open = function () {
    if (this.inGameUi || this.isOpen || this.progress.pending || this.game.state === 'playing') return;`],
[`Account.prototype.close = function () {
    if (!this.isOpen) return;`, `Account.prototype.close = function () {
    if (!this.isOpen) return;`],
[`Account.prototype._renderButton = function () {
    var show =`, `Account.prototype._renderButton = function () {
    if (this.inGameUi) return;
    var show =`],
[`Account.prototype._render = function () {
    if (!this.isOpen) return;`, `Account.prototype._render = function () {
    if (this.inGameUi || !this.isOpen) return;`],
[`Account.prototype._onDestroy = function () {
    this.app.off('game:state', this._renderButton, this);
    this.app.off('progress:runOver', this._onRunOver, this);
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    if (this.isOpen) this.game.hold(false);
    this._button.remove();
    this._panel.remove();
    this._style.remove();
};`, `Account.prototype._onDestroy = function () {
    this.app.off('game:state', this._renderButton, this);
    this.app.off('progress:runOver', this._onRunOver, this);
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    if (this.isOpen) this.game.hold(false);
    if (this.inGameUi) return;
    this._button.remove();
    this._panel.remove();
    this._style.remove();
};`],
[`Account.prototype._onKeyDown = function (e) {
    if (this.isOpen && e.key === pc.KEY_ESCAPE) this.close();
};`, `Account.prototype._onKeyDown = function (e) {
    if (!this.inGameUi && this.isOpen && e.key === pc.KEY_ESCAPE) this.close();
};`]
]);

patch('leaderboard.js', [
[`    this._buildHud();
    this.app.on('game:state', this._renderButton, this);`, `    // With the in-game menus present, they own the board and this script is only the logic.
    var ui = this.app.root.findByName('UI');
    this.inGameUi = !!(ui && ui.script && ui.script.uiScreens);
    this.onUpdate = null; // the in-game board asks to be redrawn through this
    if (!this.inGameUi) this._buildHud();
    this.app.on('game:state', this._renderButton, this);`],
[`// ---- Fetching`, `// What the in-game board shows: 'daily' or 'alltime'.
Leaderboard.prototype.boardFor = function (tab) {
    return this.boards[this._names()[tab]] || null;
};

Leaderboard.prototype.fetchTab = function (tab, force) {
    this._fetch(this._names()[tab], force);
};

// ---- Fetching`],
[`        self._render();
    });
};`, `        self._render();
        if (self.onUpdate) self.onUpdate();
    });
};`],
[`Leaderboard.prototype.open = function () {
    if (this.isOpen || this.progress.pending || this.game.state === 'playing') return;`,
 `Leaderboard.prototype.open = function () {
    if (this.inGameUi || this.isOpen || this.progress.pending || this.game.state === 'playing') return;`],
[`Leaderboard.prototype._renderButton = function () {
    var show =`, `Leaderboard.prototype._renderButton = function () {
    if (this.inGameUi) return;
    var show =`],
[`Leaderboard.prototype._render = function () {
    if (!this.isOpen) return;`, `Leaderboard.prototype._render = function () {
    if (this.inGameUi || !this.isOpen) return;`],
[`Leaderboard.prototype._onKeyDown = function (e) {
    if (this.isOpen && e.key === pc.KEY_ESCAPE) this.close();
};`, `Leaderboard.prototype._onKeyDown = function (e) {
    if (!this.inGameUi && this.isOpen && e.key === pc.KEY_ESCAPE) this.close();
};`],
[`    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    if (this.isOpen) this.game.hold(false);
    this._button.remove();
    this._panel.remove();
    this._style.remove();
};`, `    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    if (this.isOpen) this.game.hold(false);
    if (this.inGameUi) return;
    this._button.remove();
    this._panel.remove();
    this._style.remove();
};`]
]);
console.log('patched');
