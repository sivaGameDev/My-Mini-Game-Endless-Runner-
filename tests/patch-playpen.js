// One-off patch: use the project's Playpen Sans font for the in-game menus, instead of drawing text
// into textures. Its character set is plain ASCII, so the menus avoid arrows, ticks and dots.
const fs = require('fs');
const dir = __dirname + '/../scripts/';
let a = fs.readFileSync(dir + 'uiKit.js', 'utf8');
const rep = (from, to) => {
    if (!a.includes(from)) throw new Error('uiKit missing: ' + from.slice(0, 70));
    a = a.replace(from, to);
};

rep(`UiKit.FAMILY = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
UiKit.TEXT_SCALE = 2;   // texture pixels per interface pixel, so text stays sharp
UiKit.PAD = 6;          // breathing room around the drawn text`,
`UiKit.FONTS = { bold: 'PlaypenSans-Bold.ttf', body: 'PlaypenSans-Medium.ttf' };`);

// Fonts come from the project again.
const drawStart = a.indexOf('UiKit.app = null;');
const drawEnd = a.indexOf('// A line of text:');
if (drawStart < 0 || drawEnd < 0) throw new Error('uiKit: could not find the text section');
a = a.slice(0, drawStart) + `UiKit.app = null;
UiKit.fonts = {};

// Loads the two font assets, then calls back: text stays blank until its font is in. The screen
// script passes the assets it was given; finding them by name is the fallback.
UiKit.ready = function (app, fonts, callback) {
    UiKit.app = app;
    var wanted = {
        bold: (fonts && fonts.bold) || app.assets.find(UiKit.FONTS.bold, 'font'),
        body: (fonts && fonts.body) || app.assets.find(UiKit.FONTS.body, 'font')
    };
    if (!wanted.bold && !wanted.body) {
        console.warn('[ui] no font asset set on the UI entity: menu text will be blank');
        callback();
        return;
    }
    wanted.bold = wanted.bold || wanted.body;
    wanted.body = wanted.body || wanted.bold;
    var left = 2;
    var done = function () {
        left--;
        if (left === 0) {
            console.log('[ui] menu font: ' + wanted.bold.name + ' / ' + wanted.body.name);
            callback();
        }
    };
    ['bold', 'body'].forEach(function (key) {
        var asset = wanted[key];
        UiKit.fonts[key] = asset;
        if (asset.resource) {
            done();
        } else {
            asset.ready(done);
            app.assets.load(asset);
        }
    });
};

UiKit.fontAsset = function (bold) {
    var asset = UiKit.fonts[bold === false ? 'body' : 'bold'] || UiKit.fonts.bold;
    return asset ? asset.id : null;
};

` + a.slice(drawEnd);

rep(`// A line of text: an image element carrying the drawn glyphs, sized to fit them.
UiKit.text = function (parent, name, opts) {
    var o = opts || {};
    var e = new pc.Entity(name);
    e.addComponent('element', {
        type: pc.ELEMENTTYPE_IMAGE,
        anchor: o.anchor || [0.5, 0.5, 0.5, 0.5],
        pivot: o.pivot || [0.5, 0.5],
        width: 1, height: 1,
        color: o.color || UiKit.COLORS.text,
        opacity: o.opacity === undefined ? 1 : o.opacity
    });
    if (o.position) e.setLocalPosition(o.position[0], o.position[1], 0);
    parent.addChild(e);
    e.setText = function (str) {
        if (e._uiText === str) return;
        e._uiText = str;
        var drawn = UiKit.draw(str, o);
        var old = e.element.texture;
        e.element.texture = drawn.texture;
        e.element.width = drawn.width;
        e.element.height = drawn.height;
        if (old) old.destroy();
    };
    e.setColor = function (color) {
        e.element.color = new pc.Color(color[0], color[1], color[2]);
    };
    e.setText(o.text || '');
    return e;
};`,
`// A line of text. Give it a width to wrap, or leave it to size itself.
UiKit.text = function (parent, name, opts) {
    var o = opts || {};
    var size = o.size || 20;
    var e = new pc.Entity(name);
    e.addComponent('element', {
        type: pc.ELEMENTTYPE_TEXT,
        anchor: o.anchor || [0.5, 0.5, 0.5, 0.5],
        pivot: o.pivot || [0.5, 0.5],
        width: o.width,
        height: o.height,
        autoWidth: !o.width,
        autoHeight: !o.height,
        wrapLines: !!o.width,
        fontAsset: UiKit.fontAsset(o.bold),
        fontSize: size,
        lineHeight: size * (o.lineHeight || 1.3),
        color: o.color || UiKit.COLORS.text,
        opacity: o.opacity === undefined ? 1 : o.opacity,
        alignment: o.alignment || [0.5, 0.5],
        text: o.text || ''
    });
    if (o.position) e.setLocalPosition(o.position[0], o.position[1], 0);
    parent.addChild(e);
    e.setText = function (str) { e.element.text = str === undefined || str === null ? '' : String(str); };
    e.setColor = function (color) { e.element.color = new pc.Color(color[0], color[1], color[2]); };
    return e;
};`);

rep(`    var value = UiKit.text(fill, 'Value', {
        anchor: [0, 0.5, 0, 0.5], pivot: [0, 0.5], position: [10, 0], alignment: [0, 0.5],
        text: '', size: 18, color: UiKit.COLORS.text, bold: false
    });`,
`    var value = UiKit.text(fill, 'Value', {
        anchor: [0, 0.5, 0, 0.5], pivot: [0, 0.5], position: [10, 0], alignment: [0, 0.5],
        text: '', size: 18, color: UiKit.COLORS.text, bold: false
    });`);

// The font covers plain ASCII only.
a = a.replace(`        value.setText(o.password ? new Array(input.value.length + 1).join('•') : input.value);`,
    `        value.setText(o.password ? new Array(input.value.length + 1).join('*') : input.value);`);
fs.writeFileSync(dir + 'uiKit.js', a);

let b = fs.readFileSync(dir + 'uiScreens.js', 'utf8');
const repb = (from, to) => {
    if (!b.includes(from)) throw new Error('uiScreens missing: ' + from.slice(0, 70));
    b = b.split(from).join(to);
};
repb(`text: '×', width: 38, height: 38, size: 20`, `text: 'X', width: 38, height: 38, size: 18`);
repb(`text: '← → lanes · ↑ jump · ↓ slide · P pause · M sound', size: 14`,
     `text: 'Arrows move  -  Up jumps  -  Down slides  -  P pause  -  M sound', size: 14, width: 520`);
repb(`    this.startStatus.setText(bits.join('  ·  '));`, `    this.startStatus.setText(bits.join('   -   '));`);
repb(`        line.setText((m.done ? '✓ ' : '') + def.text + (m.done ? '' : '  ' + Progress.fmt(m.progress) + '/' + Progress.fmt(def.target)));`,
     `        line.setText(def.text + (m.done ? '  DONE' : '  ' + Progress.fmt(m.progress) + '/' + Progress.fmt(def.target)));`);
repb(`this.joinGo.setText(account && account.busy ? 'Please wait…' : creating ? 'Create account' : 'Sign in');`,
     `this.joinGo.setText(account && account.busy ? 'Please wait...' : creating ? 'Create account' : 'Sign in');`);
repb(`else if (board && board.loading && !entries.length) note = 'Loading…';`,
     `else if (board && board.loading && !entries.length) note = 'Loading...';`);
fs.writeFileSync(dir + 'uiScreens.js', b);
console.log('patched');
