var UiKit = pc.createScript('uiKit');

// Shared pieces for the in-game screens (start, join, leaderboard). Everything here builds real
// entities under a 2D screen, so the menus are part of the scene rather than a web page on top of
// it. This script is never attached to an entity; the screen scripts call these helpers.

UiKit.FONTS = { bold: 'PlaypenSans-Bold.ttf', body: 'PlaypenSans-Medium.ttf' };
UiKit.COLORS = {
    panel: [0.055, 0.024, 0.11],
    line: [1, 0.24, 0.95],
    text: [1, 1, 1],
    dim: [0.81, 0.78, 0.9],
    faint: [0.54, 0.5, 0.65],
    cyan: [0.21, 0.96, 1],
    magenta: [1, 0.24, 0.95],
    gold: [1, 0.82, 0.34],
    green: [0.49, 1, 0.69],
    red: [1, 0.42, 0.5]
};

UiKit.app = null;
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
    if (app.mouse && !UiKit._wheelBound) {
        UiKit._wheelBound = true;
        app.mouse.on(pc.EVENT_MOUSEWHEEL, function (e) {
            if (UiKit.activeScroll) UiKit.activeScroll.scrollBy(-e.wheelDelta * 48);
        });
    }
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

// A block: either a stretchy group (anchor plus margins) or a fixed box (width and height).
UiKit.group = function (parent, name, opts) {
    var o = opts || {};
    var e = new pc.Entity(name);
    e.addComponent('element', {
        type: o.color ? pc.ELEMENTTYPE_IMAGE : pc.ELEMENTTYPE_GROUP,
        anchor: o.anchor || [0.5, 0.5, 0.5, 0.5],
        pivot: o.pivot || [0.5, 0.5],
        margin: o.margin,
        width: o.width,
        height: o.height,
        color: o.color,
        opacity: o.opacity === undefined ? 1 : o.opacity,
        useInput: !!o.useInput
    });
    if (o.position) e.setLocalPosition(o.position[0], o.position[1], 0);
    parent.addChild(e);
    return e;
};

// A card: dark panel with a bright line along the top.
UiKit.card = function (parent, name, width, height) {
    var card = UiKit.group(parent, name, {
        width: width, height: height, color: UiKit.COLORS.panel, opacity: 0.95, useInput: true
    });
    UiKit.group(card, 'TopLine', {
        anchor: [0, 1, 1, 1], pivot: [0.5, 1], margin: [0, 0, 0, 0], height: 3,
        color: UiKit.COLORS.line, opacity: 0.9
    });
    return card;
};

// The menu font covers plain ASCII only, and anything else draws as a gap plus a console warning.
// Every string on its way into a text element comes through here, so the game's own copy can keep
// its typography and a player's name from the leaderboard cannot leave holes in a row.
UiKit.SUBS = [
    [/[×✕✖]/g, 'x'],
    [/[·•]/g, '-'],
    [/[→⇒]/g, '->'],
    [/[←⇐]/g, '<-'],
    [/↑/g, 'up'],
    [/↓/g, 'down'],
    [/[✓✔]/g, 'v'],
    [/[‘’]/g, "'"],
    [/[“”]/g, '"'],
    [/[–—]/g, '-'],
    [/…/g, '...']
];

UiKit.plain = function (str) {
    if (str === undefined || str === null) return '';
    var out = String(str);
    UiKit.SUBS.forEach(function (sub) { out = out.replace(sub[0], sub[1]); });
    out = out.replace(/[^\x20-\x7E]/g, '');
    return out || (String(str).trim() ? '?' : '');
};

// A line of text. Give it a width to wrap, or leave it to size itself.
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
        text: UiKit.plain(o.text)
    });
    if (o.position) e.setLocalPosition(o.position[0], o.position[1], 0);
    parent.addChild(e);
    e.setText = function (str) { e.element.text = UiKit.plain(str); };
    e.setColor = function (color) { e.element.color = new pc.Color(color[0], color[1], color[2]); };
    return e;
};

// A button: outline, fill and label, with hover and press shading.
UiKit.button = function (parent, name, opts) {
    var o = opts || {};
    var accent = o.accent || UiKit.COLORS.cyan;
    var outer = UiKit.group(parent, name, {
        anchor: o.anchor, pivot: o.pivot, position: o.position,
        width: o.width || 220, height: o.height || 52,
        color: accent, opacity: 0.55, useInput: true
    });
    var fill = UiKit.group(outer, 'Fill', {
        anchor: [0, 0, 1, 1], margin: [2, 2, 2, 2],
        color: o.solid ? accent : UiKit.COLORS.panel, opacity: o.solid ? 1 : 0.92
    });
    // Either a word or a picture: an icon button passes a texture asset instead of text.
    var label = null;
    if (o.texture) {
        var icon = UiKit.group(fill, 'Icon', {
            anchor: [0.5, 0.5, 0.5, 0.5], pivot: [0.5, 0.5], position: [0, 0],
            width: o.iconSize || 24, height: o.iconSize || 24, color: [1, 1, 1], opacity: 1
        });
        icon.element.textureAsset = o.texture;
    } else {
        label = UiKit.text(fill, 'Label', {
            text: o.text || '', size: o.size || 18, width: (o.width || 220) - 16,
            color: o.solid ? [0.06, 0.01, 0.11] : (o.textColor || accent)
        });
    }
    var shade = function (v) {
        fill.element.opacity = (o.solid ? 1 : 0.92) * v;
        outer.element.opacity = 0.55 * v;
    };
    outer.element.on('mouseenter', function () { shade(1.3); });
    outer.element.on('mouseleave', function () { shade(1); });
    outer.element.on('mousedown', function () { shade(0.7); });
    outer.element.on('mouseup', function () { shade(1.3); });
    outer.element.on('touchstart', function () { shade(0.7); });
    outer.element.on('touchend', function () { shade(1); });
    if (o.onClick) outer.element.on('click', o.onClick);
    outer.setText = function (text) { if (label) label.setText(text); };
    outer.setAccent = function (color) {
        outer.element.color = new pc.Color(color[0], color[1], color[2]);
        if (o.solid) fill.element.color = new pc.Color(color[0], color[1], color[2]);
        else if (label) label.setColor(color);
    };
    return outer;
};

// A text field. Typing goes through an invisible browser input, so phone keyboards open and
// password managers still work; the characters are mirrored into the element's text.
UiKit.field = function (parent, name, opts) {
    var o = opts || {};
    var box = UiKit.group(parent, name, {
        anchor: o.anchor, pivot: o.pivot, position: o.position,
        width: o.width || 300, height: o.height || 46,
        color: UiKit.COLORS.dim, opacity: 0.22, useInput: true
    });
    var fill = UiKit.group(box, 'Fill', { anchor: [0, 0, 1, 1], margin: [1, 1, 1, 1], color: [0.1, 0.07, 0.16], opacity: 0.95 });
    UiKit.text(box, 'Caption', {
        anchor: [0, 1, 0, 1], pivot: [0, 0], position: [2, 3],
        text: o.label || '', size: 13, color: UiKit.COLORS.faint, bold: false
    });
    var value = UiKit.text(fill, 'Value', {
        anchor: [0, 0.5, 0, 0.5], pivot: [0, 0.5], position: [10, 0], alignment: [0, 0.5],
        text: '', size: 18, color: UiKit.COLORS.text, bold: false
    });

    var input = document.createElement('input');
    input.type = o.password ? 'password' : o.email ? 'email' : 'text';
    input.autocomplete = o.autocomplete || 'off';
    input.maxLength = o.maxLength || 60;
    input.setAttribute('aria-label', o.label || name);
    input.style.cssText = 'position:fixed;left:-500px;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;';
    document.body.appendChild(input);

    var show = function () {
        value.setText(o.password ? new Array(input.value.length + 1).join('*') : input.value);
    };
    input.addEventListener('input', show);
    input.addEventListener('focus', function () { box.element.opacity = 0.65; });
    input.addEventListener('blur', function () { box.element.opacity = 0.22; });
    input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && o.onEnter) o.onEnter();
    });
    box.element.on('click', function () { input.focus(); });

    box.field = {
        input: input,
        get: function () { return input.value; },
        set: function (v) {
            input.value = v || '';
            show();
        },
        focus: function () { input.focus(); },
        clear: function () {
            input.value = '';
            show();
        }
    };
    return box;
};

// ---- Scrolling

// The scroller the wheel currently belongs to: the page that is open sets it.
UiKit.activeScroll = null;

UiKit.scale = function () {
    var screen = UiKit.screenEntity && UiKit.screenEntity.screen;
    return screen && screen.scale ? screen.scale : 1;
};

// A masked viewport with a block of content inside it. Rows are placed from the top of `content`;
// once they are in, tell it the total height and the wheel or a drag moves it.
UiKit.scroll = function (parent, name, opts) {
    var o = opts || {};
    var width = o.width || 400;
    var height = o.height || 300;
    var view = UiKit.group(parent, name, {
        anchor: o.anchor, pivot: o.pivot, position: o.position,
        width: width, height: height,
        color: o.color || UiKit.COLORS.panel, opacity: 1, useInput: true
    });
    view.element.mask = true;   // children are drawn only inside this rectangle

    var content = UiKit.group(view, 'Content', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], width: width, height: 10
    });
    var track = UiKit.group(view, 'ScrollTrack', {
        anchor: [1, 0, 1, 1], pivot: [1, 0.5], position: [-2, 0], margin: [0, 3, 0, 3], width: 3,
        color: UiKit.COLORS.dim, opacity: 0.14
    });
    var thumb = UiKit.group(track, 'Thumb', {
        anchor: [0, 1, 1, 1], pivot: [0.5, 1], margin: [0, 0, 0, 0], height: 24,
        color: UiKit.COLORS.dim, opacity: 0.55
    });

    var pos = 0;
    var total = 0;
    var apply = function () {
        var max = Math.max(0, total - height);
        pos = pc.math.clamp(pos, 0, max);
        content.setLocalPosition(0, pos, 0);
        track.enabled = max > 0.5;
        if (track.enabled) {
            var size = Math.max(24, height * (height / total));
            thumb.element.height = size;
            thumb.setLocalPosition(0, -(pos / max) * (height - size), 0);
        }
    };

    // A drag anywhere in the viewport scrolls it; the page's own buttons still get their clicks.
    var dragging = false;
    var last = 0;
    var at = function (e) {
        if (e.y !== undefined) return e.y;
        return e.touches && e.touches[0] ? e.touches[0].y : 0;
    };
    var start = function (e) {
        dragging = true;
        last = at(e);
    };
    view.element.on('mousedown', start);
    view.element.on('touchstart', start);

    var moved = function (y) {
        if (!dragging) return;
        pos -= (y - last) / UiKit.scale();
        last = y;
        apply();
    };
    var stop = function () { dragging = false; };
    var app = UiKit.app;
    if (app.mouse) {
        app.mouse.on(pc.EVENT_MOUSEMOVE, function (e) { moved(e.y); });
        app.mouse.on(pc.EVENT_MOUSEUP, stop);
    }
    if (app.touch) {
        app.touch.on(pc.EVENT_TOUCHMOVE, function (e) {
            if (e.touches && e.touches[0]) moved(e.touches[0].y);
        });
        app.touch.on(pc.EVENT_TOUCHEND, stop);
        app.touch.on(pc.EVENT_TOUCHCANCEL, stop);
    }

    var box = {
        entity: view,
        content: content,
        // Empties the content so the page can fill it again.
        clear: function () {
            content.children.slice().forEach(function (child) { UiKit.destroy(child); });
            total = 0;
        },
        setHeight: function (h) {
            total = Math.max(h, height);
            apply();
        },
        scrollBy: function (dy) {
            pos += dy;
            apply();
        },
        top: function () {
            pos = 0;
            apply();
        },
        // Keeps the scroll position across a redraw when the same list is rebuilt.
        at: function () { return pos; },
        to: function (y) {
            pos = y;
            apply();
        }
    };
    // The wheel belongs to whichever viewport the pointer is over.
    view.element.on('mouseenter', function () { UiKit.activeScroll = box; });
    view.element.on('mouseleave', function () {
        if (UiKit.activeScroll === box) UiKit.activeScroll = null;
    });

    view.scroll = box;
    return box;
};

// ---- Controls

// A thin rule between rows.
UiKit.divider = function (parent, y, width) {
    return UiKit.group(parent, 'Rule', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -y],
        width: width, height: 1, color: UiKit.COLORS.dim, opacity: 0.12
    });
};

// A progress bar; setPct(0..100) fills it.
UiKit.bar = function (parent, name, opts) {
    var o = opts || {};
    var width = o.width || 200;
    var track = UiKit.group(parent, name, {
        anchor: o.anchor, pivot: o.pivot, position: o.position,
        width: width, height: o.height || 4, color: UiKit.COLORS.dim, opacity: 0.18
    });
    var fill = UiKit.group(track, 'Fill', {
        anchor: [0, 0, 0, 1], pivot: [0, 0.5], margin: [0, 0, 0, 0], width: 1,
        color: o.color || UiKit.COLORS.cyan, opacity: 1
    });
    track.setPct = function (pct) {
        fill.element.width = Math.max(1, width * pc.math.clamp(pct, 0, 100) / 100);
    };
    track.setColor = function (color) {
        fill.element.color = new pc.Color(color[0], color[1], color[2]);
    };
    track.setPct(o.pct || 0);
    return track;
};

// Little blocks showing how many upgrade levels are bought.
UiKit.pips = function (parent, name, count, opts) {
    var o = opts || {};
    var size = o.size || 8;
    var gap = o.gap || 3;
    var row = UiKit.group(parent, name, {
        anchor: o.anchor, pivot: o.pivot, position: o.position,
        width: count * size + (count - 1) * gap, height: size
    });
    var dots = [];
    for (var i = 0; i < count; i++) {
        dots.push(UiKit.group(row, 'Pip' + i, {
            anchor: [0, 0.5, 0, 0.5], pivot: [0, 0.5], position: [i * (size + gap), 0],
            width: size, height: size, color: o.color || UiKit.COLORS.cyan, opacity: 0.18
        }));
    }
    row.setLevel = function (n) {
        dots.forEach(function (dot, i) { dot.element.opacity = i < n ? 1 : 0.18; });
    };
    row.setLevel(o.level || 0);
    return row;
};

// A colour sample. `stripes` paints several colours side by side, for the rainbow trail.
UiKit.swatch = function (parent, name, opts) {
    var o = opts || {};
    var size = o.size || 24;
    var box = UiKit.group(parent, name, {
        anchor: o.anchor, pivot: o.pivot, position: o.position,
        width: size, height: size,
        color: o.color || UiKit.COLORS.faint,
        opacity: o.color ? 1 : 0.3
    });
    if (o.stripes && o.stripes.length) {
        box.element.opacity = 0;
        var w = size / o.stripes.length;
        o.stripes.forEach(function (color, i) {
            UiKit.group(box, 'Stripe' + i, {
                anchor: [0, 0, 0, 1], pivot: [0, 0.5], position: [i * w, 0], margin: [0, 0, 0, 0],
                width: w, color: color, opacity: 1
            });
        });
    }
    return box;
};

// An on/off switch.
UiKit.toggle = function (parent, name, opts) {
    var o = opts || {};
    var track = UiKit.group(parent, name, {
        anchor: o.anchor, pivot: o.pivot, position: o.position,
        width: 52, height: 26, color: UiKit.COLORS.dim, opacity: 0.25, useInput: true
    });
    var knob = UiKit.group(track, 'Knob', {
        anchor: [0, 0.5, 0, 0.5], pivot: [0, 0.5], position: [3, 0],
        width: 20, height: 20, color: UiKit.COLORS.faint, opacity: 1
    });
    track.setOn = function (on) {
        var color = on ? UiKit.COLORS.cyan : UiKit.COLORS.dim;
        track.element.color = new pc.Color(color[0], color[1], color[2]);
        track.element.opacity = on ? 0.35 : 0.25;
        knob.element.color = new pc.Color(color[0], color[1], color[2]);
        knob.setLocalPosition(on ? 29 : 3, 0, 0);
    };
    if (o.onClick) track.element.on('click', o.onClick);
    track.setOn(!!o.on);
    return track;
};

// A value nudged up and down. A drag-along slider inside the canvas is fiddly on a phone, so this
// steps instead: minus, a bar showing where it sits, plus.
UiKit.stepper = function (parent, name, opts) {
    var o = opts || {};
    var width = o.width || 380;
    var box = UiKit.group(parent, name, {
        anchor: o.anchor, pivot: o.pivot, position: o.position,
        width: width, height: o.note ? 62 : 46
    });
    UiKit.text(box, 'Label', {
        anchor: [0, 1, 0, 1], pivot: [0, 1], position: [0, 0], alignment: [0, 0.5],
        text: o.label || '', size: 16, color: UiKit.COLORS.text
    });
    var value = UiKit.text(box, 'Value', {
        anchor: [1, 1, 1, 1], pivot: [1, 1], position: [0, 0], alignment: [1, 0.5],
        text: '', size: 16, color: UiKit.COLORS.cyan, bold: false
    });
    if (o.note) {
        UiKit.text(box, 'Note', {
            anchor: [0, 1, 0, 1], pivot: [0, 1], position: [0, -20], alignment: [0, 0.5],
            text: o.note, size: 12, color: UiKit.COLORS.faint, bold: false
        });
    }
    var y = o.note ? -40 : -24;
    UiKit.button(box, 'Minus', {
        anchor: [0, 1, 0, 1], pivot: [0, 1], position: [0, y], text: '-', width: 34, height: 22,
        size: 16, accent: UiKit.COLORS.dim, onClick: function () { if (o.onStep) o.onStep(-1); }
    });
    UiKit.button(box, 'Plus', {
        anchor: [1, 1, 1, 1], pivot: [1, 1], position: [0, y], text: '+', width: 34, height: 22,
        size: 16, accent: UiKit.COLORS.dim, onClick: function () { if (o.onStep) o.onStep(1); }
    });
    var bar = UiKit.bar(box, 'Bar', {
        anchor: [0, 1, 0, 1], pivot: [0, 0.5], position: [42, y - 11],
        width: width - 84, height: 4
    });
    box.setValue = function (text, pct) {
        value.setText(text);
        bar.setPct(pct);
    };
    return box;
};

// Removes a panel and any hidden inputs inside it.
UiKit.destroy = function (entity) {
    if (!entity) return;
    var inputs = [];
    var walk = function (e) {
        if (e.field) inputs.push(e.field.input);
        e.children.forEach(walk);
    };
    walk(entity);
    inputs.forEach(function (i) { i.remove(); });
    entity.destroy();
};
