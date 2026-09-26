// One-off patch: crash-screen fit on short screens, stacked dock, no toasts over the crash screen.
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
    [`    '.nr-dock { position: absolute; left: 16px; bottom: 16px; display: flex; gap: 8px; }',`,
     `    '.nr-dock { position: absolute; left: 16px; bottom: 16px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }',`],
    [`    '@media (max-height: 520px) { .nr-panel { padding: 14px 22px; } .nr-panel h1 { margin-bottom: 6px; font-size: 26px; } .nr-help { margin-top: 10px; font-size: 12px; line-height: 1.5; } .nr-final { margin-bottom: 2px; } }',`,
     `    '@media (max-height: 520px) { .nr-panel { padding: 10px 20px 12px; } .nr-panel h1 { margin-bottom: 2px; font-size: 24px; } .nr-help { margin-top: 10px; font-size: 12px; line-height: 1.5; } .nr-final { margin-bottom: 0; font-size: 15px; } .nr-final b { font-size: 24px; } .nr-newbest { margin-bottom: 4px; } }',`]
]);

patch('progress.js', [
    [`    '@media (max-height: 520px) { .nr-meta { margin: 8px auto 8px; } .nr-mhead { margin-top: 6px; } .nr-m { padding: 2px 0 3px; } .nr-mbar { margin-top: 2px; } .nr-streak { margin-top: 4px; } }',`,
     `    '@media (max-height: 520px) { .nr-meta { margin: 6px auto 6px; } .nr-next { margin-bottom: 4px; padding: 4px 10px; } .nr-mhead { margin-top: 4px; } .nr-m { padding: 1px 0; } .nr-mbar { display: none; } .nr-streak { margin-top: 3px; } }',`],
    [`Progress.prototype.toast = function (text, kind) {
    this._toast(text, kind);
};`, `// Toasts from other scripts; skipped over the crash screen, which lists what happened at the end
// of the run (level-ups, trophies) and would be covered by them.
Progress.prototype.toast = function (text, kind) {
    if (this.game.state === 'over') return;
    this._toast(text, kind);
};`]
]);

patch('shop.js', [
    [`    '.nr-shop-btn { display: none; align-items: center; gap: 8px; height: 44px;`, `    '.nr-shop-btn { display: none; align-items: center; gap: 8px; height: 40px;`]
]);
patch('achievements.js', [
    [`    '.nr-tro-btn { display: none; align-items: center; gap: 8px; height: 44px;`, `    '.nr-tro-btn { display: none; align-items: center; gap: 8px; height: 40px;`]
]);
console.log('patched');
