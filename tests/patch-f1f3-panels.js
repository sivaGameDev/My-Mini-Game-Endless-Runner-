// One-off patch: home screen with a PLAY button and menu row (F1), pause menu (F3).
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

patch('gameManager.js', [
// ---- Markup
[`    '<div class="nr-panel" data-panel="ready"><h1>NEON RUNNER</h1><p class="nr-cta">Press Space or tap to run</p>',
    '<div class="nr-slot" data-slot="ready"></div>',`,
 `    '<div class="nr-panel" data-panel="ready"><h1>NEON RUNNER</h1>',
    '<button class="nr-play" type="button" data-play>PLAY</button>',
    '<p class="nr-cta nr-cta-small">or press Space</p>',
    '<div class="nr-barwrap" data-barwrap></div>',
    '<div class="nr-slot" data-slot="ready"></div>',`],
[`    '<div class="nr-panel" data-panel="paused"><h1>PAUSED</h1><p class="nr-cta">Press P or tap to resume</p></div>',`,
 `    '<div class="nr-panel" data-panel="paused"><h1>PAUSED</h1>',
    '<div class="nr-menu">',
    '<button class="nr-btn is-go" type="button" data-resume>Resume</button>',
    '<button class="nr-btn" type="button" data-restart>Restart</button>',
    '<button class="nr-btn" type="button" data-home>Home</button>',
    '</div><p class="nr-cta nr-cta-small">or press P to resume</p></div>',`],
[`    '<div class="nr-dock" data-dock></div>',`, `    '<div class="nr-dock" data-dock><button class="nr-btn is-home" type="button" data-home>HOME</button></div>',`],

// ---- Styling
[`    '.nr-dock { position: absolute; left: 16px; bottom: 16px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }',
    '.nr-dock > * { pointer-events: auto; }',`,
 `    '.nr-dock { position: absolute; left: 16px; bottom: 16px; display: none; flex-direction: column; align-items: flex-start; gap: 8px; }',
    '.nr-dock.is-on { display: flex; }',
    '.nr-dock > *, .nr-barwrap > * { pointer-events: auto; }',
    '.nr-bar.is-menu { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }',
    '.nr-bar.is-dock { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }',
    '.nr-barwrap:empty { display: none; }',
    '.nr-barwrap { margin: 12px 0 2px; }',
    '.nr-play { display: block; margin: 14px auto 6px; padding: 12px 54px; border: 0; border-radius: 999px; background: linear-gradient(90deg, #ff3df2, #35f4ff); color: #10021c; font: inherit; font-size: 20px; font-weight: 800; letter-spacing: 0.22em; cursor: pointer; box-shadow: 0 0 26px rgba(255, 61, 242, 0.55); }',
    '.nr-play:hover { filter: brightness(1.1); }',
    '.nr-menu { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 14px 0 4px; }',
    '.nr-btn { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(53, 244, 255, 0.5); background: rgba(14, 6, 28, 0.75); color: #fff; font: 800 14px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; letter-spacing: 0.12em; cursor: pointer; pointer-events: auto; }',
    '.nr-btn.is-go { border-color: #35f4ff; background: rgba(53, 244, 255, 0.18); }',
    '.nr-btn.is-home { display: none; border-color: rgba(255, 255, 255, 0.4); }',
    '.nr-btn.is-home.is-on { display: flex; }',
    '.nr-cta-small { font-size: 13px; opacity: 0.75; }',`],
[`    '@media (max-height: 520px) { .nr-panel { padding: 10px 20px 12px; }`,
 `    '@media (max-height: 520px) { .nr-play { margin: 8px auto 2px; padding: 9px 44px; font-size: 18px; } .nr-menu, .nr-barwrap { margin: 8px 0 2px; } .nr-btn { height: 34px; padding: 0 14px; font-size: 13px; } .nr-panel { padding: 10px 20px 12px; }`],

// ---- Wiring
[`        slots: {`, `        play: q('[data-play]'),
        barwrap: q('[data-barwrap]'),
        bar: document.createElement('div'),
        home: q('.nr-dock [data-home]'),
        slots: {`],
[`    var self = this;
    Object.keys(this._hud.panels).forEach(function (key) {
        self._hud.panels[key].addEventListener('pointerdown', function (ev) {
            ev.stopPropagation();
            self.primaryAction();
        });
    });`, `    var self = this;
    this._hud.bar.className = 'nr-bar';
    Object.keys(this._hud.panels).forEach(function (key) {
        self._hud.panels[key].addEventListener('pointerdown', function (ev) {
            ev.stopPropagation();
            self.primaryAction();
        });
    });
    // Buttons inside a panel act on their own; the panel's own tap must not also fire.
    root.addEventListener('pointerdown', function (ev) {
        if (ev.target.closest('button')) ev.stopPropagation();
    }, true);
    root.addEventListener('click', function (ev) {
        var button = ev.target.closest('[data-play],[data-resume],[data-restart],[data-home]');
        if (!button) return;
        if (button.hasAttribute('data-play')) self.start();
        else if (button.hasAttribute('data-resume')) self.resume();
        else if (button.hasAttribute('data-restart')) self.restart();
        else self.resetRun(); // home
    });`],
[`GameManager.prototype._renderHud = function () {
    var h = this._hud;
    for (var key in h.panels) h.panels[key].classList.toggle('is-on', key === this.state);
    h.pause.classList.toggle('is-on', this.state === 'playing');`,
 `GameManager.prototype._renderHud = function () {
    var h = this._hud;
    for (var key in h.panels) h.panels[key].classList.toggle('is-on', key === this.state);
    h.pause.classList.toggle('is-on', this.state === 'playing');
    // The buttons other scripts add sit in the home screen's menu, or in the corner after a crash.
    var home = this.state === 'ready';
    var parent = home ? h.barwrap : h.dock;
    if (h.bar.parentNode !== parent) parent.appendChild(h.bar);
    h.bar.classList.toggle('is-menu', home);
    h.bar.classList.toggle('is-dock', !home);
    h.dock.classList.toggle('is-on', this.state === 'over');
    h.home.classList.toggle('is-on', this.state === 'over');`],
[`// Bottom-left row where other scripts put their buttons (shop, trophies).
GameManager.prototype.getDock = function () {
    return this._hud.dock;
};`, `// Where other scripts put their buttons: the home screen's menu row, or the corner after a crash
// (this moves them for you). Each button shows itself in the states it belongs to.
GameManager.prototype.getButtonBar = function () {
    return this._hud.bar;
};`]
]);

// Buttons move from the old dock to the shared bar.
['shop.js', 'achievements.js', 'challenge.js'].forEach(function (file) {
    patch(file, [['this.game.getDock().appendChild(this._button);', 'this.game.getButtonBar().appendChild(this._button);']]);
});
console.log('patched');
