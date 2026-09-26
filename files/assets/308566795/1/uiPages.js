var UiPages = pc.createScript('uiPages');

// The shop, profile and settings pages, built from entities under the same 2D screen as the rest of
// the menus. The logic stays where it was: this script reads the shop, achievements and settings
// scripts and calls their methods, so buying, equipping and every value keeps one owner. It hands
// each panel to uiScreens, which decides what is on screen and holds the game while it is up.
UiPages.SHOP = { width: 620, height: 580, body: 120 };
UiPages.PROFILE = { width: 640, height: 600, body: 140 };
UiPages.SETTINGS = { width: 560, height: 560, body: 66 };
UiPages.PAD = 18;        // space between a card's edge and its contents
UiPages.STEP = 0.05;     // how much one press of a settings stepper moves

UiPages.prototype.initialize = function () {
    var game = this.app.root.findByName('Game');
    this.game = game.script.gameManager;
    this.progress = game.script.progress;
    this.shop = game.script.shop || null;
    this.profile = game.script.achievements || null;
    this.settings = game.script.settings || null;
    this.levels = game.script.levels || null;
    this.zones = game.script.zones || null;
    this.screens = this.entity.script.uiScreens;
    this.shopTab = 'upgrades';
    this.profileTab = 'stats';
    this.resetArmed = false;
    this._resetTimer = null;

    this.screens.onBuilt(this._build, this);
    this.on('destroy', this._onDestroy, this);
};

UiPages.prototype._build = function () {
    if (this.shop) this._buildShop();
    if (this.profile) this._buildProfile();
    if (this.settings) this._buildSettings();
};

// ---- Shared pieces

// A page card with a title, an optional figure on the right and a close button.
UiPages.prototype._card = function (name, size, title, accent) {
    var self = this;
    var card = UiKit.card(this.screens.root, name, size.width, size.height);
    UiKit.text(card, 'Title', {
        anchor: [0, 1, 0, 1], pivot: [0, 1], position: [UiPages.PAD, -20],
        text: title, size: 24, color: accent
    });
    UiKit.button(card, 'Close', {
        anchor: [1, 1, 1, 1], pivot: [1, 1], position: [-14, -14],
        text: 'X', width: 36, height: 36, size: 16, accent: UiKit.COLORS.dim,
        onClick: function () { self.screens._back(); }
    });
    return card;
};

// The scrolling body of a page, sized from the card.
UiPages.prototype._body = function (card, size) {
    return UiKit.scroll(card, 'Body', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -size.body],
        width: size.width - UiPages.PAD * 2, height: size.height - size.body - 16,
        color: [0.04, 0.018, 0.085]
    });
};

// A row of tabs; returns the buttons so their colour can follow the chosen one.
UiPages.prototype._tabs = function (card, y, list, accent, onPick) {
    var width = Math.floor(520 / list.length) - 8;
    var buttons = {};
    list.forEach(function (tab, i) {
        buttons[tab[0]] = UiKit.button(card, 'Tab' + tab[0], {
            anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1],
            position: [(i - (list.length - 1) / 2) * (width + 8), -y],
            text: tab[1], width: width, height: 36, size: 14, accent: accent,
            onClick: function () { onPick(tab[0]); }
        });
    });
    return buttons;
};

UiPages.prototype._markTabs = function (buttons, current, accent) {
    Object.keys(buttons).forEach(function (key) {
        buttons[key].setAccent(key === current ? accent : UiKit.COLORS.faint);
    });
};

// One row inside a scrolling body: a block of fixed height, measured from the top.
UiPages.prototype._row = function (scroll, y, height, width) {
    return UiKit.group(scroll.content, 'Row', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -y],
        width: width, height: height
    });
};

// A small heading above a group of rows.
UiPages.prototype._heading = function (scroll, y, width, text) {
    var row = this._row(scroll, y, 22, width);
    UiKit.text(row, 'Head', {
        anchor: [0, 0.5, 0, 0.5], pivot: [0, 0.5], position: [2, 0], alignment: [0, 0.5],
        text: text, size: 13, color: UiKit.COLORS.cyan
    });
    return row;
};

UiPages.hex = function (hex) {
    var n = parseInt(hex.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// A skin or trail colour as the swatch should show it: the lit look, base plus glow.
UiPages.prototype._skinColor = function (def) {
    var original = this.progress.playerOriginal;
    if (def.diffuse) {
        return [
            Math.min(1, def.diffuse[0] + def.emissive[0]),
            Math.min(1, def.diffuse[1] + def.emissive[1]),
            Math.min(1, def.diffuse[2] + def.emissive[2])
        ];
    }
    if (!original) return UiKit.COLORS.cyan;
    return [
        Math.min(1, original.diffuse.r + original.emissive.r),
        Math.min(1, original.diffuse.g + original.emissive.g),
        Math.min(1, original.diffuse.b + original.emissive.b)
    ];
};

// ---- Shop

UiPages.prototype._buildShop = function () {
    var self = this;
    var size = UiPages.SHOP;
    var card = this._card('ShopPanel', size, 'SHOP', UiKit.COLORS.gold);
    this.shopPanel = card;
    this.shopBank = UiKit.text(card, 'Bank', {
        anchor: [1, 1, 1, 1], pivot: [1, 1], position: [-62, -22], alignment: [1, 0.5],
        text: '', size: 16, color: UiKit.COLORS.text
    });
    this.shopTabs = this._tabs(card, 68, Shop.TABS, UiKit.COLORS.gold, function (tab) {
        self.shopTab = tab;
        if (self.shop.confirming) self.shop._arm(null);
        self.shopBody.top();
        self._renderShop();
    });
    this.shopBody = this._body(card, size);
    this.screens.registerPanel('shop', card, this._renderShop, this);
};

UiPages.prototype._renderShop = function () {
    if (!this.shopPanel) return;
    var data = this.shop._data();
    var width = UiPages.SHOP.width - UiPages.PAD * 2 - 14;
    this.shopBank.setText(Progress.fmt(data.wallet) + ' coins');
    this._markTabs(this.shopTabs, this.shopTab, UiKit.COLORS.gold);

    var at = this.shopBody.at();
    this.shopBody.clear();
    var y = 6;
    if (this.shopTab === 'upgrades') y = this._shopUpgrades(y, width);
    else if (this.shopTab === 'items') y = this._shopItems(y, width);
    else y = this._shopStyle(y, width);
    this.shopBody.setHeight(y + 8);
    this.shopBody.to(at);
};

// The buy control for one thing: its price, a confirm step on the dear ones, or why it is off.
UiPages.prototype._buyButton = function (row, kind, id, price) {
    var self = this;
    var data = this.shop._data();
    if (price === null) {
        UiKit.text(row, 'Max', {
            anchor: [1, 0.5, 1, 0.5], pivot: [1, 0.5], position: [0, 0], alignment: [1, 0.5],
            text: 'MAX', size: 14, color: UiKit.COLORS.green
        });
        return;
    }
    var confirming = this.shop.confirming === kind + ':' + id;
    var poor = price > data.wallet;
    UiKit.button(row, 'Buy', {
        anchor: [1, 0.5, 1, 0.5], pivot: [1, 0.5], position: [0, 0],
        text: confirming ? 'Tap to confirm' : Progress.fmt(price),
        width: confirming ? 150 : 110, height: 36, size: 14,
        solid: !poor && !confirming,
        accent: confirming ? UiKit.COLORS.magenta : poor ? UiKit.COLORS.faint : UiKit.COLORS.gold,
        onClick: function () {
            if (poor) return;
            self.shop._buy(kind, id);
            self._renderShop();
        }
    });
};

UiPages.prototype._shopUpgrades = function (y, width) {
    var data = this.shop._data();
    Shop.UPGRADES.forEach(function (def) {
        var level = this.shop._level(def.id);
        var price = Shop.price(data, 'upgrade', def.id);
        var now = this.shop._duration(def, level);
        var row = this._row(this.shopBody, y, 64, width);
        UiKit.text(row, 'Name', {
            anchor: [0, 1, 0, 1], pivot: [0, 1], position: [4, -4], alignment: [0, 0.5],
            text: def.name, size: 16, color: UiKit.COLORS.text
        });
        UiKit.pips(row, 'Pips', Shop.MAX_LEVEL, {
            anchor: [0, 1, 0, 1], pivot: [0, 1], position: [4, -28], level: level
        });
        UiKit.text(row, 'Info', {
            anchor: [0, 1, 0, 1], pivot: [0, 1], position: [4, -40], alignment: [0, 0.5],
            text: price === null ? now + ' s (max)' : now + ' s -> ' + this.shop._duration(def, level + 1) + ' s',
            size: 13, color: UiKit.COLORS.faint, bold: false
        });
        this._buyButton(row, 'upgrade', def.id, price);
        UiKit.divider(this.shopBody.content, y + 64, width);
        y += 66;
    }, this);
    return y;
};

UiPages.prototype._shopItems = function (y, width) {
    var self = this;
    Shop.ITEMS.forEach(function (def) {
        var item = this.shop._data().items[def.id] || { count: 0, use: true };
        var row = this._row(this.shopBody, y, 62, width);
        UiKit.text(row, 'Name', {
            anchor: [0, 1, 0, 1], pivot: [0, 1], position: [4, -4], alignment: [0, 0.5],
            text: def.name, size: 16, color: UiKit.COLORS.text
        });
        UiKit.text(row, 'Info', {
            anchor: [0, 1, 0, 1], pivot: [0, 1], position: [4, -26], alignment: [0, 0.5],
            text: def.text + '  -  you have ' + item.count, size: 13, color: UiKit.COLORS.faint, bold: false
        });
        if (item.count > 0) {
            UiKit.button(row, 'Use', {
                anchor: [1, 0.5, 1, 0.5], pivot: [1, 0.5], position: [-120, 0],
                text: item.use ? 'Use: on' : 'Use: off', width: 100, height: 34, size: 13,
                accent: item.use ? UiKit.COLORS.green : UiKit.COLORS.faint,
                onClick: function () {
                    self.shop._toggle(def.id);
                    self._renderShop();
                }
            });
        }
        this._buyButton(row, 'item', def.id, def.price);
        UiKit.divider(this.shopBody.content, y + 62, width);
        y += 64;
    }, this);
    return y;
};

// Runner colours and trails as a grid of tiles: tap to equip what you own, or to buy.
UiPages.prototype._shopStyle = function (y, width) {
    var self = this;
    var data = this.shop._data();
    var columns = 4;
    var gap = 8;
    var tileWidth = Math.floor((width - gap * (columns - 1)) / columns);

    var grid = function (kind, list, set, swatchOf) {
        list.forEach(function (def, i) {
            var column = i % columns;
            var line = Math.floor(i / columns);
            var owned = set.owned.indexOf(def.id) !== -1;
            var on = set.equipped === def.id;
            var price = Shop.price(data, kind, def.id);
            var confirming = self.shop.confirming === kind + ':' + def.id;
            var note;
            var color = UiKit.COLORS.faint;
            var action = null;
            if (on) {
                note = 'On';
                color = UiKit.COLORS.cyan;
            } else if (owned) {
                note = 'Owned';
                action = 'equip';
            } else if (price === null) {
                note = def.level ? 'Level ' + def.level : 'Day 7 reward';
                color = UiKit.COLORS.magenta;
            } else if (confirming) {
                note = 'Confirm?';
                color = UiKit.COLORS.magenta;
                action = 'buy';
            } else {
                note = Progress.fmt(price);
                color = price > data.wallet ? UiKit.COLORS.faint : UiKit.COLORS.gold;
                action = price > data.wallet ? null : 'buy';
            }
            var tile = UiKit.group(self.shopBody.content, 'Tile', {
                anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1],
                position: [(column - (columns - 1) / 2) * (tileWidth + gap), -(y + line * 90)],
                width: tileWidth, height: 84,
                color: on ? UiKit.COLORS.cyan : UiKit.COLORS.dim, opacity: on ? 0.22 : 0.08,
                useInput: true
            });
            var swatch = swatchOf(def);
            UiKit.swatch(tile, 'Swatch', {
                anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -10], size: 26,
                color: swatch.color, stripes: swatch.stripes
            });
            UiKit.text(tile, 'Name', {
                anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -40],
                text: def.name, size: 12, width: tileWidth - 8, color: UiKit.COLORS.text
            });
            UiKit.text(tile, 'Note', {
                anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -60],
                text: note, size: 11, width: tileWidth - 8, color: color, bold: false
            });
            if (action) {
                tile.element.on('click', function () {
                    if (action === 'equip') self.shop._equip(kind, def.id);
                    else self.shop._buy(kind, def.id);
                    self._renderShop();
                });
            }
        });
        return y + Math.ceil(list.length / columns) * 90;
    };

    this._heading(this.shopBody, y, width, 'RUNNER COLOUR');
    y += 26;
    y = grid('skin', Progress.SKINS, data.skins, function (def) {
        return { color: self._skinColor(def) };
    });
    this._heading(this.shopBody, y, width, 'TRAIL');
    y += 26;
    y = grid('trail', Trail.STYLES, data.trails, function (def) {
        if (def.rainbow) {
            return { stripes: [[1, 0.3, 0.3], [1, 0.82, 0.3], [0.3, 1, 0.53], [0.3, 0.75, 1], [0.72, 0.3, 1]] };
        }
        return { color: def.color || null };
    });
    return y;
};

// ---- Profile

UiPages.prototype._buildProfile = function () {
    var self = this;
    var size = UiPages.PROFILE;
    var card = this._card('ProfilePanel', size, 'PROFILE', UiKit.COLORS.magenta);
    this.profilePanel = card;
    this.profileCoins = UiKit.text(card, 'Coins', {
        anchor: [1, 1, 1, 1], pivot: [1, 1], position: [-62, -22], alignment: [1, 0.5],
        text: '', size: 16, color: UiKit.COLORS.text
    });
    this.levelText = UiKit.text(card, 'Level', {
        anchor: [0, 1, 0, 1], pivot: [0, 1], position: [UiPages.PAD, -60], alignment: [0, 0.5],
        text: '', size: 13, color: UiKit.COLORS.dim, bold: false
    });
    this.levelBar = UiKit.bar(card, 'LevelBar', {
        anchor: [0, 1, 0, 1], pivot: [0, 1], position: [UiPages.PAD, -82],
        width: size.width - UiPages.PAD * 2, height: 5, color: UiKit.COLORS.magenta
    });
    this.profileTabs = this._tabs(card, 96, [['stats', 'Stats'], ['trophies', 'Trophies'], ['zones', 'Zones']],
        UiKit.COLORS.magenta, function (tab) {
            self.profileTab = tab;
            self.profileBody.top();
            self._renderProfile();
        });
    this.profileBody = this._body(card, size);
    this.screens.registerPanel('profile', card, this._renderProfile, this);
};

UiPages.prototype._renderProfile = function () {
    if (!this.profilePanel) return;
    var data = this.progress.data;
    var width = UiPages.PROFILE.width - UiPages.PAD * 2 - 14;
    this.profileCoins.setText(Progress.fmt(data.wallet) + ' coins');
    if (this.levels) {
        var info = this.levels.getLevel();
        this.levelText.setText('Lv ' + info.level + '   ' + Progress.fmt(info.into) + ' / ' + Progress.fmt(info.need) +
            ' XP   -   next: ' + Levels.nextText(info.level));
        this.levelBar.setPct(info.into / info.need * 100);
    }
    this.profileTabs.trophies.setText('Trophies ' + this.profile.count() + '/' + Achievements.LIST.length);
    this._markTabs(this.profileTabs, this.profileTab, UiKit.COLORS.magenta);

    var at = this.profileBody.at();
    this.profileBody.clear();
    var y = 6;
    if (this.profileTab === 'trophies') y = this._profileTrophies(y, width);
    else if (this.profileTab === 'zones') y = this._profileZones(y, width);
    else y = this._profileStats(y, width);
    this.profileBody.setHeight(y + 8);
    this.profileBody.to(at);
};

UiPages.prototype._profileStats = function (y, width) {
    var data = this.progress.data;
    var stats = data.stats;
    var skin = Progress.SKINS.filter(function (s) { return s.id === data.skins.equipped; })[0];
    var trail = Trail.STYLES.filter(function (s) { return s.id === data.trails.equipped; })[0];
    var since = '';
    if (data.firstDay >= 0) {
        try {
            since = new Date(data.firstDay * 86400000).toLocaleDateString();
        } catch (err) {
            since = '';
        }
    }
    var self = this;
    var group = function (title, pairs) {
        self._heading(self.profileBody, y, width, title);
        y += 26;
        pairs.filter(Boolean).forEach(function (pair) {
            var row = self._row(self.profileBody, y, 24, width);
            UiKit.text(row, 'Key', {
                anchor: [0, 0.5, 0, 0.5], pivot: [0, 0.5], position: [4, 0], alignment: [0, 0.5],
                text: pair[0], size: 14, color: UiKit.COLORS.faint, bold: false
            });
            UiKit.text(row, 'Value', {
                anchor: [1, 0.5, 1, 0.5], pivot: [1, 0.5], position: [-4, 0], alignment: [1, 0.5],
                text: pair[1], size: 14, color: UiKit.COLORS.text
            });
            UiKit.divider(self.profileBody.content, y + 24, width);
            y += 26;
        });
        y += 6;
    };
    group('RECORDS', [
        ['Best distance', Progress.fmt(data.records.best) + ' m'],
        ['Best score', Progress.fmt(this.game.best)],
        ['Runs played', Progress.fmt(data.runs)],
        ['Day streak', data.streak.count + (data.streak.best > data.streak.count ? ' (best ' + data.streak.best + ')' : '')]
    ]);
    group('TOTALS', [
        ['Distance run', Progress.fmt(Math.round((stats.distance || 0) / 100) / 10) + ' km'],
        ['Coins collected', Progress.fmt(stats.coins || 0)],
        ['Coins in the bank', Progress.fmt(data.wallet)],
        ['Jumps', Progress.fmt(stats.jumps || 0)],
        ['Bars slid under', Progress.fmt(stats.bars || 0)],
        ['Jump pads used', Progress.fmt(stats.pads || 0)],
        ['Crushers seen', Progress.fmt(stats.crushers || 0)],
        ['Missions done', Progress.fmt(stats.missions || 0)],
        ['Shop purchases', Progress.fmt(stats.buys || 0)]
    ]);
    group('NOW WEARING', [
        ['Runner colour', skin ? skin.name : 'Classic'],
        ['Trail', trail ? trail.name : 'None'],
        ['Trophies', this.profile.count() + ' of ' + Achievements.LIST.length],
        ['Colour zones', (Zones.PALETTES.length + data.zones.length) + ' of ' + (Zones.PALETTES.length + Zones.EXTRA.length)],
        since ? ['Playing since', since] : null
    ]);
    return y;
};

UiPages.prototype._profileTrophies = function (y, width) {
    var self = this;
    var data = this.progress.data;
    var section = function (title, filter) {
        self._heading(self.profileBody, y, width, title);
        y += 26;
        Achievements.LIST.filter(filter).forEach(function (def) {
            var done = data.achievements[def.id] !== undefined;
            var tier = Achievements.TIERS[def.tier];
            var color = UiPages.hex(tier.color);
            var value = Math.min(Achievements.value(def, data, null), def.target);
            var row = self._row(self.profileBody, y, 52, width);
            UiKit.group(row, 'Tier', {
                anchor: [0, 1, 0, 1], pivot: [0, 1], position: [4, -6],
                width: 14, height: 14, color: color, opacity: done ? 1 : 0.3
            });
            UiKit.text(row, 'Name', {
                anchor: [0, 1, 0, 1], pivot: [0, 1], position: [26, -3], alignment: [0, 0.5],
                text: def.name, size: 14, color: done ? UiKit.COLORS.text : UiKit.COLORS.dim
            });
            UiKit.text(row, 'Text', {
                anchor: [0, 1, 0, 1], pivot: [0, 1], position: [26, -22], alignment: [0, 0.5],
                text: def.text, size: 12, color: UiKit.COLORS.faint, bold: false
            });
            if (!done && def.target > 1) {
                UiKit.bar(row, 'Bar', {
                    anchor: [0, 1, 0, 1], pivot: [0, 1], position: [26, -40],
                    width: width - 150, height: 3, pct: value / def.target * 100
                });
            }
            UiKit.text(row, 'Value', {
                anchor: [1, 1, 1, 1], pivot: [1, 1], position: [-44, -3], alignment: [1, 0.5],
                text: done ? 'DONE' : def.target === 1 ? '' : Progress.fmt(value) + '/' + Progress.fmt(def.target),
                size: 12, color: done ? UiKit.COLORS.green : UiKit.COLORS.dim, bold: false
            });
            UiKit.text(row, 'Reward', {
                anchor: [1, 1, 1, 1], pivot: [1, 1], position: [-4, -3], alignment: [1, 0.5],
                text: '+' + tier.coins, size: 12, color: UiKit.COLORS.gold
            });
            UiKit.divider(self.profileBody.content, y + 52, width);
            y += 54;
        });
        y += 6;
    };
    section('IN ONE RUN', function (def) { return def.run; });
    section('OVER TIME', function (def) { return def.stat; });
    return y;
};

UiPages.prototype._profileZones = function (y, width) {
    if (!this.zones) return y;
    var data = this.progress.data;
    this.zones.palettes.forEach(function (palette, i) {
        var open = i < Zones.PALETTES.length || data.zones.indexOf(palette.id) !== -1;
        var row = this._row(this.profileBody, y, 44, width);
        UiKit.swatch(row, 'Colour', {
            anchor: [0, 0.5, 0, 0.5], pivot: [0, 0.5], position: [4, 0], size: 18,
            color: palette.rail || UiKit.COLORS.dim
        }).element.opacity = open ? 1 : 0.35;
        UiKit.text(row, 'Name', {
            anchor: [0, 1, 0, 1], pivot: [0, 1], position: [30, -3], alignment: [0, 0.5],
            text: palette.name, size: 14, color: open ? UiKit.COLORS.text : UiKit.COLORS.dim
        });
        UiKit.text(row, 'Note', {
            anchor: [0, 1, 0, 1], pivot: [0, 1], position: [30, -22], alignment: [0, 0.5],
            text: open ? 'In your runs' : 'Unlocks at ' + Zones.unlockText(palette),
            size: 12, color: UiKit.COLORS.faint, bold: false
        });
        if (open) {
            UiKit.text(row, 'Tick', {
                anchor: [1, 0.5, 1, 0.5], pivot: [1, 0.5], position: [-4, 0], alignment: [1, 0.5],
                text: 'ON', size: 12, color: UiKit.COLORS.green
            });
        }
        UiKit.divider(this.profileBody.content, y + 44, width);
        y += 46;
    }, this);
    return y;
};

// ---- Settings

UiPages.prototype._buildSettings = function () {
    var size = UiPages.SETTINGS;
    var card = this._card('SettingsPanel', size, 'SETTINGS', UiKit.COLORS.cyan);
    this.settingsPanel = card;
    this.settingsBody = this._body(card, size);
    this.screens.registerPanel('settings', card, this._renderSettings, this);
};

UiPages.prototype._renderSettings = function () {
    if (!this.settingsPanel) return;
    var self = this;
    var values = this.settings.values();
    var width = UiPages.SETTINGS.width - UiPages.PAD * 2 - 14;
    var at = this.settingsBody.at();
    this.settingsBody.clear();
    var y = 6;

    var stepper = function (def) {
        var max = def.max || 1;
        var value = values[def.id];
        var box = UiKit.stepper(self.settingsBody.content, 'Set' + def.id, {
            anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -y],
            width: width, label: def.name, note: def.note,
            onStep: function (dir) {
                var next = pc.math.clamp(self.settings.values()[def.id] + dir * UiPages.STEP, 0, max);
                self.settings.set(def.id, Math.round(next * 100) / 100);
                self.progress.commit();
                self._renderSettings();
            }
        });
        box.setValue(Math.round(value * 100) + '%', value / max * 100);
        y += def.note ? 68 : 52;
    };

    this._heading(this.settingsBody, y, width, 'SOUND');
    y += 26;
    Settings.SLIDERS.slice(0, 3).forEach(stepper);
    this._heading(this.settingsBody, y, width, 'CAMERA');
    y += 26;
    Settings.SLIDERS.slice(3).forEach(stepper);
    Settings.TOGGLES.forEach(function (def) {
        var row = self._row(self.settingsBody, y, 50, width);
        UiKit.text(row, 'Name', {
            anchor: [0, 1, 0, 1], pivot: [0, 1], position: [0, -2], alignment: [0, 0.5],
            text: def.name, size: 16, color: UiKit.COLORS.text
        });
        UiKit.text(row, 'Note', {
            anchor: [0, 1, 0, 1], pivot: [0, 1], position: [0, -22], alignment: [0, 0.5],
            text: def.note, size: 12, width: width - 70, color: UiKit.COLORS.faint, bold: false
        });
        UiKit.toggle(row, 'Switch', {
            anchor: [1, 0.5, 1, 0.5], pivot: [1, 0.5], position: [0, 0], on: !!values[def.id],
            onClick: function () {
                self.settings.set(def.id, !self.settings.values()[def.id]);
                self.progress.commit();
                self._renderSettings();
            }
        });
        y += 54;
    });

    this._heading(this.settingsBody, y, width, 'CONTROLS');
    y += 26;
    [
        'Left and right arrows, or A and D, or swipe: change lane',
        'Up arrow, W or Space, or swipe up: jump',
        'Down arrow or S, or swipe down: slide under bars',
        'P or Esc: pause    -    M: sound on or off'
    ].forEach(function (line) {
        var row = self._row(self.settingsBody, y, 22, width);
        UiKit.text(row, 'Line', {
            anchor: [0, 0.5, 0, 0.5], pivot: [0, 0.5], position: [0, 0], alignment: [0, 0.5],
            text: line, size: 13, width: width, color: UiKit.COLORS.dim, bold: false
        });
        y += 22;
    });
    y += 10;

    this._heading(this.settingsBody, y, width, 'START OVER');
    y += 26;
    var warn = this._row(this.settingsBody, y, 36, width);
    UiKit.text(warn, 'Warn', {
        anchor: [0, 1, 0, 1], pivot: [0, 1], position: [0, 0], alignment: [0, 0.5],
        text: 'Clears coins, levels, trophies, records and everything you own on this device.',
        size: 12, width: width, color: UiKit.COLORS.faint, bold: false
    });
    y += 40;
    UiKit.button(this.settingsBody.content, 'Reset', {
        anchor: [0.5, 1, 0.5, 1], pivot: [0.5, 1], position: [0, -y],
        text: this.resetArmed ? 'Tap again to erase everything' : 'Reset all progress',
        width: 300, height: 40, size: 14,
        solid: this.resetArmed, accent: UiKit.COLORS.red,
        onClick: function () { self._reset(); }
    });
    y += 50;

    this.settingsBody.setHeight(y);
    this.settingsBody.to(at);
};

// Erasing everything asks twice, and forgets it was asked after a few seconds.
UiPages.prototype._reset = function () {
    if (this.resetArmed) {
        this.settings.resetProgress();
        return;
    }
    var self = this;
    this.resetArmed = true;
    clearTimeout(this._resetTimer);
    this._resetTimer = setTimeout(function () {
        self.resetArmed = false;
        if (self.screens.isOpen('settings')) self._renderSettings();
    }, Settings.CONFIRM_TIME * 1000);
    this._renderSettings();
};

UiPages.prototype._onDestroy = function () {
    clearTimeout(this._resetTimer);
};
