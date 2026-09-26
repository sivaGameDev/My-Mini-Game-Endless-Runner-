// One-off patch: menu text drawn into textures (no font asset needed).
const fs = require('fs');
const dir = __dirname + '/../scripts/';
let a = fs.readFileSync(dir + 'uiKit.js', 'utf8');
const rep = (from, to) => {
    if (!a.includes(from)) throw new Error('uiKit missing: ' + from.slice(0, 70));
    a = a.replace(from, to);
};

rep(`UiKit.FONTS = { bold: 'Roboto-Bold.ttf', body: 'Roboto-Medium.ttf' };`,
`UiKit.FAMILY = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
UiKit.TEXT_SCALE = 2;   // texture pixels per interface pixel, so text stays sharp
UiKit.PAD = 6;          // breathing room around the drawn text`);

rep(`UiKit.app = null;
UiKit.fonts = {};

// Loads the fonts once, then calls back. Text elements stay blank until their font is in.
// The screen script passes its font assets in; looking them up by name is only a fallback.
UiKit.ready = function (app, fonts, callback) {
    UiKit.app = app;
    var wanted = { bold: (fonts && fonts.bold) || app.assets.find(UiKit.FONTS.bold, 'font'),
        body: (fonts && fonts.body) || app.assets.find(UiKit.FONTS.body, 'font') };
    if (!wanted.bold && !wanted.body) {
        console.warn('[ui] no font asset set on the UI entity: menu text will be blank');
        callback();
        return;
    }
    if (!wanted.bold) wanted.bold = wanted.body;
    if (!wanted.body) wanted.body = wanted.bold;
    var left = 2;
    var done = function () {
        left--;
        if (left === 0) {
            console.log('[ui] fonts ready: ' + wanted.bold.name + ', ' + wanted.body.name);
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

UiKit.fontId = function (bold) {
    var asset = UiKit.fonts[bold === false ? 'body' : 'bold'] || UiKit.fonts.bold;
    return asset ? asset.id : null;
};`,
`UiKit.app = null;

// Nothing to load: the type comes from the browser, drawn into textures. Kept as a call so the
// screens have one place to start from.
UiKit.ready = function (app, fonts, callback) {
    UiKit.app = app;
    callback();
};

// Draws a line, or wrapped lines, into a texture. The pixels are white so the element colour tints
// them, which keeps one texture per string rather than one per colour.
UiKit.draw = function (str, opts) {
    var scale = UiKit.TEXT_SCALE;
    var pad = UiKit.PAD;
    var size = (opts.size || 20) * scale;
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var font = (opts.bold === false ? 600 : 800) + ' ' + size + 'px ' + UiKit.FAMILY;
    ctx.font = font;

    var lines = [str === undefined || str === null ? '' : String(str)];
    var maxWidth = opts.width ? (opts.width - pad * 2) * scale : 0;
    if (maxWidth && ctx.measureText(lines[0]).width > maxWidth) {
        var words = lines[0].split(' ');
        lines = [''];
        words.forEach(function (word) {
            var line = lines[lines.length - 1];
            var next = line ? line + ' ' + word : word;
            if (line && ctx.measureText(next).width > maxWidth) lines.push(word);
            else lines[lines.length - 1] = next;
        });
    }
    var lineHeight = size * (opts.lineHeight || 1.3);
    var width = 0;
    lines.forEach(function (line) { width = Math.max(width, ctx.measureText(line).width); });
    canvas.width = Math.max(2, Math.ceil(width) + pad * 2);
    canvas.height = Math.max(2, Math.ceil(lineHeight * lines.length) + pad * 2);

    ctx.font = font;
    ctx.textBaseline = 'middle';
    var align = opts.alignment && opts.alignment[0] === 0 ? 'left' : opts.alignment && opts.alignment[0] === 1 ? 'right' : 'center';
    ctx.textAlign = align;
    ctx.fillStyle = '#ffffff';
    var x = align === 'left' ? pad : align === 'right' ? canvas.width - pad : canvas.width / 2;
    lines.forEach(function (line, i) {
        ctx.fillText(line, x, pad + lineHeight * (i + 0.5));
    });

    var texture = new pc.Texture(UiKit.app.graphicsDevice, {
        width: canvas.width, height: canvas.height, format: pc.PIXELFORMAT_RGBA8,
        mipmaps: true, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, name: 'ui-text'
    });
    texture.setSource(canvas);
    return { texture: texture, width: canvas.width / scale, height: canvas.height / scale };
};`);

rep(`UiKit.text = function (parent, name, opts) {
    var o = opts || {};
    var e = new pc.Entity(name);
    var size = o.size || 20;
    e.addComponent('element', {
        type: pc.ELEMENTTYPE_TEXT,
        anchor: o.anchor || [0.5, 0.5, 0.5, 0.5],
        pivot: o.pivot || [0.5, 0.5],
        margin: o.margin,
        width: o.width,
        height: o.height,
        autoWidth: !o.width && !o.margin,
        autoHeight: !o.height && !o.margin,
        wrapLines: !!(o.width || o.margin),
        fontAsset: UiKit.fontId(o.bold),
        fontSize: size,
        lineHeight: size * (o.lineHeight || 1.3),
        color: o.color || UiKit.COLORS.text,
        opacity: o.opacity === undefined ? 1 : o.opacity,
        alignment: o.alignment || [0.5, 0.5],
        text: o.text || ''
    });
    if (o.position) e.setLocalPosition(o.position[0], o.position[1], 0);
    parent.addChild(e);
    return e;
};`,
`// A line of text: an image element carrying the drawn glyphs, sized to fit them.
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
};`);

rep(`    var label = UiKit.text(fill, 'Label', {
        anchor: [0, 0, 1, 1], margin: [8, 0, 8, 0],
        text: o.text || '', size: o.size || 18,
        color: o.solid ? [0.06, 0.01, 0.11] : (o.textColor || accent)
    });`,
`    var label = UiKit.text(fill, 'Label', {
        text: o.text || '', size: o.size || 18, width: (o.width || 220) - 16,
        color: o.solid ? [0.06, 0.01, 0.11] : (o.textColor || accent)
    });`);

rep(`    outer.setText = function (text) { label.element.text = text; };
    outer.setAccent = function (color) {
        outer.element.color = new pc.Color(color[0], color[1], color[2]);
        if (o.solid) fill.element.color = new pc.Color(color[0], color[1], color[2]);
        else label.element.color = new pc.Color(color[0], color[1], color[2]);
    };`,
`    outer.setText = function (text) { label.setText(text); };
    outer.setAccent = function (color) {
        outer.element.color = new pc.Color(color[0], color[1], color[2]);
        if (o.solid) fill.element.color = new pc.Color(color[0], color[1], color[2]);
        else label.setColor(color);
    };`);

rep(`    var value = UiKit.text(fill, 'Value', {
        anchor: [0, 0, 1, 1], margin: [10, 0, 10, 0], alignment: [0, 0.5],
        text: '', size: 18, color: UiKit.COLORS.text, bold: false
    });`,
`    var value = UiKit.text(fill, 'Value', {
        anchor: [0, 0.5, 0, 0.5], pivot: [0, 0.5], position: [10, 0], alignment: [0, 0.5],
        text: '', size: 18, color: UiKit.COLORS.text, bold: false
    });`);

rep(`    var show = function () {
        value.element.text = o.password ? new Array(input.value.length + 1).join('•') : input.value;
    };`,
`    var show = function () {
        value.setText(o.password ? new Array(input.value.length + 1).join('•') : input.value);
    };`);
fs.writeFileSync(dir + 'uiKit.js', a);

// The screens now set text and colour through the helpers.
let b = fs.readFileSync(dir + 'uiScreens.js', 'utf8');
b = b.replace(/([\w.\[\]]+)\.element\.text = ([^;]+);/g, '$1.setText($2);');
b = b.replace(/([\w.\[\]]+)\.element\.color = new pc\.Color\((\w+)\[0\], \2\[1\], \2\[2\]\);/g, '$1.setColor($2);');
fs.writeFileSync(dir + 'uiScreens.js', b);
console.log('patched');
