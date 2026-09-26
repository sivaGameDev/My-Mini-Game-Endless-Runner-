var Shop = pc.createScript('shop');

// Upgrades (R6): each level adds `step` seconds to a power-up.
Shop.UPGRADES = [
    { id: 'magnet', name: 'Magnet', power: 'magnet', step: 2 },
    { id: 'multiplier', name: 'Score ×2', power: 'multiplier', step: 2 },
    { id: 'doubleJump', name: 'Double Jump', power: 'doubleJump', step: 2 },
    { id: 'shield', name: 'Shield', power: 'shield', step: 3 }
];
Shop.UPGRADE_COSTS = [250, 500, 1000, 2000, 4000]; // levels 1-5
Shop.MAX_LEVEL = Shop.UPGRADE_COSTS.length;
// Items (R6): used up one at a time at the start of a run, if switched on.
Shop.ITEMS = [
    { id: 'shield', name: 'Starting Shield', text: 'Start a run with a shield up', price: 150, power: 'shield' },
    { id: 'booster', name: 'Score Booster', text: 'Score ×2 for the first 30 s', price: 200, power: 'multiplier', time: 30 }
];
Shop.CONFIRM_FROM = 1000; // purchases this big need a second tap
Shop.CONFIRM_TIME = 3;    // seconds the second tap stays armed
Shop.TABS = [['upgrades', 'Upgrades'], ['items', 'Items'], ['style', 'Style']];

// The shop (R6 upgrades and items, R7 runner colours and trails). Opened from the SHOP button on
// the start and crash screens; everything is paid from the progress script's coin bank and kept
// in its profile. Upgrades set the power-up durations; items are used when a run starts.
Shop.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.progress = this.entity.script.progress;
    this.powerUps = this.entity.script.powerUps;
    // Power-up durations as set in the editor; upgrade levels add to these.
    this.base = {};
    Shop.UPGRADES.forEach(function (u) {
        this.base[u.id] = this.powerUps[PowerUps.TYPES[u.power].time];
    }, this);
    this.isOpen = false;
    this.tab = 'upgrades';
    this.confirming = null; // 'kind:id' waiting for its second tap
    this._confirmTimer = null;

    var ui = this.app.root.findByName('UI');
    this.screens = (ui && ui.script && ui.script.uiScreens) || null;

    this._buildHud();
    this._applyUpgrades();
    this._renderButton();

    this.app.on('game:state', this._renderButton, this);
    this.app.on('game:start', this._onStart, this);
    this.app.on('progress:changed', this._onChanged, this);
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    this.on('destroy', this._onDestroy, this);
};

// ---- Pure helpers

// Price of the next step for sale, or null if there's nothing to buy (owned, maxed, streak or level only).
Shop.price = function (data, kind, id) {
    var def;
    if (kind === 'upgrade') {
        var level = data.upgrades[id] || 0;
        return level < Shop.MAX_LEVEL ? Shop.UPGRADE_COSTS[level] : null;
    }
    if (kind === 'item') {
        def = Shop.ITEMS.filter(function (i) { return i.id === id; })[0];
        return def ? def.price : null;
    }
    var list = kind === 'skin' ? Progress.SKINS : Trail.STYLES;
    var owned = kind === 'skin' ? data.skins.owned : data.trails.owned;
    def = list.filter(function (s) { return s.id === id; })[0];
    return def && def.price && owned.indexOf(id) === -1 ? def.price : null;
};

// Something new the bank can pay for (items don't count: they're always for sale).
Shop.canAffordNew = function (data) {
    var check = function (kind, id) {
        var p = Shop.price(data, kind, id);
        return p !== null && p <= data.wallet;
    };
    return Shop.UPGRADES.some(function (u) { return check('upgrade', u.id); }) ||
        Progress.SKINS.some(function (s) { return check('skin', s.id); }) ||
        Trail.STYLES.some(function (s) { return check('trail', s.id); });
};

// ---- Buying and using

Shop.prototype._data = function () {
    return this.progress.data;
};

Shop.prototype._level = function (id) {
    return Math.min(this._data().upgrades[id] || 0, Shop.MAX_LEVEL);
};

Shop.prototype._duration = function (u, level) {
    return this.base[u.id] + u.step * level;
};

Shop.prototype._applyUpgrades = function () {
    Shop.UPGRADES.forEach(function (u) {
        this.powerUps[PowerUps.TYPES[u.power].time] = this._duration(u, this._level(u.id));
    }, this);
};

Shop.prototype._item = function (id) {
    var items = this._data().items;
    if (!items[id]) items[id] = { count: 0, use: true };
    return items[id];
};

Shop.prototype._buy = function (kind, id) {
    var data = this._data();
    var price = Shop.price(data, kind, id);
    if (price === null || price > data.wallet) return;
    var key = kind + ':' + id;
    if (price >= Shop.CONFIRM_FROM && this.confirming !== key) {
        this._arm(key);
        return;
    }
    this._arm(null);
    data.wallet -= price;
    if (kind === 'upgrade') {
        data.upgrades[id] = this._level(id) + 1;
        this._applyUpgrades();
    } else if (kind === 'item') {
        this._item(id).count++;
    } else if (kind === 'skin') {
        data.skins.owned.push(id);
        data.skins.equipped = id;
    } else {
        data.trails.owned.push(id);
        data.trails.equipped = id;
    }
    console.log('[shop] bought ' + key + ' for ' + price + ' | bank ' + data.wallet);
    this.app.fire('shop:buy', kind, id);
    this.progress.commit();
};

// Ask for a second tap on a big purchase; it disarms by itself after a few seconds.
Shop.prototype._arm = function (key) {
    this.confirming = key;
    clearTimeout(this._confirmTimer);
    if (key) {
        var self = this;
        this._confirmTimer = setTimeout(function () {
            self.confirming = null;
            if (self.isOpen || self.screens) self._render();
        }, Shop.CONFIRM_TIME * 1000);
    }
    this._render();
};

Shop.prototype._equip = function (kind, id) {
    var data = this._data();
    var set = kind === 'skin' ? data.skins : data.trails;
    if (set.owned.indexOf(id) === -1 || set.equipped === id) return;
    set.equipped = id;
    this.app.fire('shop:equip', kind, id);
    this.progress.commit();
};

Shop.prototype._toggle = function (id) {
    var item = this._item(id);
    item.use = !item.use;
    this.progress.commit();
};

// Upgrades apply to this run; switched-on items are used up.
Shop.prototype._onStart = function () {
    this.close();
    this._applyUpgrades();
    var used = [];
    Shop.ITEMS.forEach(function (def) {
        var item = this._data().items[def.id];
        if (!item || !item.use || item.count <= 0) return;
        item.count--;
        this.powerUps.grant(def.power, def.time);
        used.push(def.name + ' (' + item.count + ' left)');
    }, this);
    if (used.length) {
        console.log('[shop] used at the start: ' + used.join(', '));
        this.progress.toast('Used ' + used.join(' · '), 'mission');
        this.progress.commit();
    }
};

// ---- Opening and closing

Shop.prototype.open = function () {
    if (this.screens) {
        this.screens.open('shop');
        return;
    }
    if (this.isOpen || this.progress.pending || this.game.state === 'playing') return;
    this.isOpen = true;
    this.game.hold(true);
    this._render();
    this._panel.classList.add('is-on');
    console.log('[shop] opened | bank ' + this._data().wallet);
};

Shop.prototype.close = function () {
    if (this.screens) {
        if (this.screens.isOpen('shop')) this.screens._back();
        return;
    }
    if (!this.isOpen) return;
    this.isOpen = false;
    this._arm(null);
    this._panel.classList.remove('is-on');
    this.game.hold(false);
};

Shop.prototype._onKeyDown = function (e) {
    if (this.screens) return;
    if (this.isOpen && e.key === pc.KEY_ESCAPE) this.close();
};

Shop.prototype._onChanged = function () {
    this._renderButton();
    if (this.isOpen) this._render();
};

// ---- HUD

Shop.HUD_CSS = [
    '.nr-shop-btn { display: none; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid rgba(255, 210, 87, 0.6); background: rgba(14, 6, 28, 0.75); color: #fff; font: 800 14px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; letter-spacing: 0.12em; cursor: pointer; }',
    '.nr-shop-btn.is-on { display: flex; }',
    '.nr-shop-btn b { color: #ffd257; letter-spacing: 0.02em; }',
    '.nr-shop-btn i { display: none; width: 9px; height: 9px; border-radius: 50%; background: #ff3df2; box-shadow: 0 0 10px #ff3df2; animation: nr-blink 1s ease-in-out infinite; }',
    '.nr-shop-btn.is-new i { display: block; }',
    '.nr-shop { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center; padding: 12px; background: rgba(8, 3, 18, 0.62); font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; color: #cfc6e6; user-select: none; -webkit-user-select: none; }',
    '.nr-shop.is-on { display: flex; }',
    '.nr-shop-card { display: flex; flex-direction: column; width: 440px; max-width: 100%; max-height: 100%; box-sizing: border-box; background: rgba(14, 6, 28, 0.96); border: 1px solid rgba(255, 210, 87, 0.55); border-radius: 16px; box-shadow: 0 0 32px rgba(255, 190, 40, 0.2); }',
    '.nr-shop-head { display: flex; align-items: center; gap: 12px; padding: 12px 14px 8px 18px; }',
    '.nr-shop-head h2 { margin: 0; font-size: 20px; letter-spacing: 0.2em; color: #ffd257; text-shadow: 0 0 12px rgba(255, 190, 40, 0.6); }',
    '.nr-shop-bank { margin-left: auto; color: #fff; font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }',
    '.nr-shop-bank small { color: #9d93b8; font-size: 11px; font-weight: 600; }',
    '.nr-shop-x { width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.08); color: #fff; font: inherit; font-size: 18px; line-height: 1; cursor: pointer; }',
    '.nr-shop-tabs { display: flex; gap: 6px; padding: 0 14px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }',
    '.nr-shop-tabs button { flex: 1; padding: 6px 0; border: 1px solid rgba(53, 244, 255, 0.3); border-radius: 8px; background: transparent; color: #9fe9ff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }',
    '.nr-shop-tabs button.is-on { background: rgba(53, 244, 255, 0.16); border-color: #35f4ff; color: #fff; }',
    '.nr-shop-body { overflow-y: auto; padding: 6px 14px 14px; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.2) transparent; }',
    '.nr-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }',
    '.nr-row-main { flex: 1; min-width: 0; }',
    '.nr-row-main b { color: #fff; font-size: 14px; }',
    '.nr-row-main small { display: block; margin-top: 2px; font-size: 12px; color: #9d93b8; }',
    '.nr-pips { margin-left: 8px; color: #35f4ff; font-size: 11px; letter-spacing: 2px; }',
    '.nr-pips em { color: rgba(255, 255, 255, 0.18); font-style: normal; }',
    '.nr-buy { min-width: 86px; padding: 7px 10px; border: 0; border-radius: 999px; background: #ffd257; color: #1a0620; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap; }',
    '.nr-buy[disabled] { background: rgba(255, 255, 255, 0.1); color: #8a7fa6; cursor: default; }',
    '.nr-buy.is-confirm { background: #ff3df2; color: #fff; }',
    '.nr-max { min-width: 86px; text-align: center; color: #7dffb0; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; }',
    '.nr-use { padding: 6px 10px; border: 1px solid rgba(125, 255, 176, 0.5); border-radius: 999px; background: transparent; color: #7dffb0; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }',
    '.nr-use.is-off { border-color: rgba(255, 255, 255, 0.2); color: #8a7fa6; }',
    '.nr-shop-h { margin: 12px 0 6px; color: #9fe9ff; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }',
    '.nr-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }',
    '.nr-tile { position: relative; padding: 8px 4px 7px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px; background: rgba(255, 255, 255, 0.04); color: #fff; font: inherit; text-align: center; cursor: pointer; }',
    '.nr-tile i { display: block; width: 26px; height: 26px; margin: 0 auto 5px; border-radius: 50%; background: var(--c); box-shadow: 0 0 10px var(--c); }',
    '.nr-tile b { display: block; font-size: 12px; }',
    '.nr-tile small { display: block; margin-top: 2px; font-size: 11px; color: #ffd257; font-weight: 700; }',
    '.nr-tile.is-none i { box-sizing: border-box; border: 1px dashed #8a7fa6; box-shadow: none; }',
    '.nr-tile.is-on { border-color: #35f4ff; background: rgba(53, 244, 255, 0.12); }',
    '.nr-tile.is-on small { color: #35f4ff; }',
    '.nr-tile.is-owned small { color: #9d93b8; }',
    '.nr-tile.is-locked { cursor: default; opacity: 0.55; }',
    '.nr-tile.is-locked small { color: #ff9df6; }',
    '.nr-tile.is-poor small { color: #8a7fa6; }',
    '.nr-tile.is-confirm { border-color: #ff3df2; background: rgba(255, 61, 242, 0.14); }',
    '.nr-tile.is-confirm small { color: #ff9df6; }',
    '@media (max-width: 420px) { .nr-tiles { grid-template-columns: repeat(3, 1fr); } }'
].join('\n');

Shop.prototype._buildHud = function () {
    var self = this;
    this._style = document.createElement('style');
    this._style.textContent = Shop.HUD_CSS;
    document.head.appendChild(this._style);

    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.className = 'nr-shop-btn';
    this._button.setAttribute('aria-label', 'Shop');
    this._button.addEventListener('click', function () { self.open(); });
    this.game.getButtonBar().appendChild(this._button);

    if (this.screens) return;   // the in-game page is up instead

    this._panel = document.createElement('div');
    this._panel.className = 'nr-shop';
    this._panel.addEventListener('click', function (ev) {
        if (ev.target === self._panel) {
            self.close(); // tapped outside the card
            return;
        }
        var el = ev.target.closest('[data-act]');
        if (!el || el.disabled) return;
        var act = el.getAttribute('data-act');
        var kind = el.getAttribute('data-kind');
        var id = el.getAttribute('data-id');
        if (act === 'close') self.close();
        else if (act === 'tab') { self.tab = id; self._arm(null); }
        else if (act === 'buy') self._buy(kind, id);
        else if (act === 'equip') self._equip(kind, id);
        else if (act === 'use') self._toggle(id);
    });
    document.body.appendChild(this._panel);
};

Shop.prototype._renderButton = function () {
    var state = this.game.state;
    var data = this._data();
    this._button.classList.toggle('is-on', state === 'ready' || state === 'over');
    this._button.classList.toggle('is-new', Shop.canAffordNew(data));
    this._button.innerHTML = 'SHOP <b>' + Progress.fmt(data.wallet) + '</b><i></i>';
};

Shop.prototype._render = function () {
    if (this.screens) {
        this.app.fire('ui:refresh');   // the in-game page redraws itself
        return;
    }
    if (!this.isOpen) return;
    var data = this._data();
    var keep = this._panel.querySelector('.nr-shop-body');
    var scroll = keep ? keep.scrollTop : 0;
    var tabs = Shop.TABS.map(function (t) {
        return '<button type="button" data-act="tab" data-id="' + t[0] + '"' + (this.tab === t[0] ? ' class="is-on"' : '') + '>' + t[1] + '</button>';
    }, this).join('');
    var body = this.tab === 'upgrades' ? this._upgradeRows() : this.tab === 'items' ? this._itemRows() : this._styleTiles();
    this._panel.innerHTML = '<div class="nr-shop-card">' +
        '<div class="nr-shop-head"><h2>SHOP</h2><span class="nr-shop-bank">' + Progress.fmt(data.wallet) + ' <small>coins</small></span>' +
        '<button class="nr-shop-x" type="button" data-act="close" aria-label="Close">×</button></div>' +
        '<div class="nr-shop-tabs">' + tabs + '</div><div class="nr-shop-body">' + body + '</div></div>';
    this._panel.querySelector('.nr-shop-body').scrollTop = scroll;
};

// The buy button for kind:id at `price`: confirm state on big purchases, greyed out if too dear.
Shop.prototype._buyButton = function (kind, id, price) {
    var confirm = this.confirming === kind + ':' + id;
    var poor = price > this._data().wallet;
    return '<button type="button" class="nr-buy' + (confirm ? ' is-confirm' : '') + '" data-act="buy" data-kind="' + kind + '" data-id="' + id + '"' +
        (poor ? ' disabled' : '') + '>' + (confirm ? 'Tap to confirm' : Progress.fmt(price)) + '</button>';
};

Shop.prototype._upgradeRows = function () {
    var data = this._data();
    return Shop.UPGRADES.map(function (u) {
        var level = this._level(u.id);
        var pips = '●'.repeat(level) + '<em>' + '●'.repeat(Shop.MAX_LEVEL - level) + '</em>';
        var now = this._duration(u, level);
        var price = Shop.price(data, 'upgrade', u.id);
        var info = price === null ? now + ' s (max)' : now + ' s → ' + this._duration(u, level + 1) + ' s';
        return '<div class="nr-row"><div class="nr-row-main"><b>' + u.name + '</b><span class="nr-pips">' + pips + '</span><small>' + info + '</small></div>' +
            (price === null ? '<span class="nr-max">MAX</span>' : this._buyButton('upgrade', u.id, price)) + '</div>';
    }, this).join('');
};

Shop.prototype._itemRows = function () {
    return Shop.ITEMS.map(function (def) {
        var item = this._data().items[def.id] || { count: 0, use: true };
        var use = item.count > 0 ? '<button type="button" class="nr-use' + (item.use ? '' : ' is-off') + '" data-act="use" data-id="' + def.id + '">' +
            (item.use ? 'Use: on' : 'Use: off') + '</button>' : '';
        return '<div class="nr-row"><div class="nr-row-main"><b>' + def.name + '</b><small>' + def.text + ' · you have ' + item.count + '</small></div>' +
            use + this._buyButton('item', def.id, def.price) + '</div>';
    }, this).join('');
};

Shop.prototype._styleTiles = function () {
    var data = this._data();
    var original = this.progress.playerOriginal;
    var rgb = function (c) { return 'rgb(' + c.map(function (v) { return Math.round(Math.min(1, v) * 255); }).join(',') + ')'; };
    var tile = function (kind, def, set, swatch) {
        var owned = set.owned.indexOf(def.id) !== -1;
        var on = set.equipped === def.id;
        var price = Shop.price(data, kind, def.id);
        var confirm = this.confirming === kind + ':' + def.id;
        var cls = 'nr-tile' + (def.id === 'none' ? ' is-none' : '');
        var note;
        var act;
        if (on) { cls += ' is-on'; note = 'On'; act = ''; }
        else if (owned) { cls += ' is-owned'; note = 'Owned'; act = 'equip'; }
        else if (price === null) { cls += ' is-locked'; note = def.level ? 'Level ' + def.level : 'Day 7 reward'; act = ''; }
        else if (confirm) { cls += ' is-confirm'; note = 'Tap to confirm'; act = 'buy'; }
        else { note = Progress.fmt(price); act = 'buy'; if (price > data.wallet) cls += ' is-poor'; }
        return '<button type="button" class="' + cls + '"' + (act ? ' data-act="' + act + '" data-kind="' + kind + '" data-id="' + def.id + '"' : '') +
            (act === 'buy' && price > data.wallet ? ' disabled' : '') + ' style="--c: ' + swatch + '"><i></i><b>' + def.name + '</b><small>' + note + '</small></button>';
    }.bind(this);

    // Swatches show the lit look: base colour plus glow.
    var lit = function (d, e) { return rgb([d[0] + e[0], d[1] + e[1], d[2] + e[2]]); };
    var skins = Progress.SKINS.map(function (s) {
        var c = s.diffuse ? lit(s.diffuse, s.emissive) :
            original ? lit([original.diffuse.r, original.diffuse.g, original.diffuse.b], [original.emissive.r, original.emissive.g, original.emissive.b]) : '#3cc8ff';
        return tile('skin', s, data.skins, c);
    }).join('');
    var trails = Trail.STYLES.map(function (s) {
        var c = s.rainbow ? 'linear-gradient(90deg, #ff4d4d, #ffd24d, #4dff88, #4dc0ff, #b84dff)' : s.color ? rgb(s.color) : 'transparent';
        return tile('trail', s, data.trails, c);
    }).join('');
    return '<div class="nr-shop-h">Runner colour</div><div class="nr-tiles">' + skins + '</div>' +
        '<div class="nr-shop-h">Trail</div><div class="nr-tiles">' + trails + '</div>';
};

Shop.prototype._onDestroy = function () {
    this.app.off('game:state', this._renderButton, this);
    this.app.off('game:start', this._onStart, this);
    this.app.off('progress:changed', this._onChanged, this);
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    clearTimeout(this._confirmTimer);
    if (this.isOpen) this.game.hold(false);
    Shop.UPGRADES.forEach(function (u) {
        this.powerUps[PowerUps.TYPES[u.power].time] = this.base[u.id];
    }, this);
    this._button.remove();
    if (this._panel) this._panel.remove();
    this._style.remove();
};
