var Settings = pc.createScript('settings');

// Everything the player can change, with the range each one allows. Values live in the progress
// profile, so they follow the profile (and one day the cloud save) rather than the browser.
Settings.SLIDERS = [
    { id: 'volume', name: 'Master volume', max: 1 },
    { id: 'sfx', name: 'Effects', max: 1 },
    { id: 'music', name: 'Music', max: 1 },
    { id: 'motion', name: 'Camera motion', max: 1.5, note: 'Shake, landing dips and view kicks' }
];
Settings.TOGGLES = [
    { id: 'cinematic', name: 'Cinematic camera', note: 'Circling shot on the home screen and after a crash' }
];
Settings.DEFAULTS = { volume: 0.7, sfx: 0.8, music: 0.35, motion: 1, cinematic: true };
Settings.CONFIRM_TIME = 4; // seconds the reset confirmation stays armed

Settings.clean = function (raw) {
    var out = {};
    Object.keys(Settings.DEFAULTS).forEach(function (id) {
        var d = Settings.DEFAULTS[id];
        var v = raw ? raw[id] : undefined;
        if (typeof d === 'boolean') out[id] = typeof v === 'boolean' ? v : d;
        else out[id] = typeof v === 'number' && isFinite(v) ? pc.math.clamp(v, 0, 1.5) : d;
    });
    return out;
};

// Settings screen (F2): sound, camera motion and a way to start over. Opened from the home screen.
Settings.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.progress = this.entity.script.progress;
    this.audio = this.entity.script.audioFx || null;
    var camera = this.app.root.findByName('Camera');
    this.camera = camera ? camera.script.cameraFollow : null;
    this.isOpen = false;
    this.confirming = false;
    this._confirmTimer = null;

    var ui = this.app.root.findByName('UI');
    this.screens = (ui && ui.script && ui.script.uiScreens) || null;

    this._buildHud();
    this.app.on('game:state', this._renderButton, this);
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    this.on('destroy', this._onDestroy, this);
};

Settings.prototype.postInitialize = function () {
    this.apply();
    this._renderButton();
};

Settings.prototype.values = function () {
    var data = this.progress.data;
    data.settings = Settings.clean(data.settings);
    return data.settings;
};

// Push the settings into the scripts that use them.
Settings.prototype.apply = function () {
    var v = this.values();
    if (this.audio) this.audio.setVolumes(v.volume, v.sfx, v.music);
    if (this.camera) {
        this.camera.motion = v.motion;
        this.camera.cinematic = v.cinematic;
    }
};

Settings.prototype.set = function (id, value) {
    this.values()[id] = value;
    this.apply();
};

// Wipes the profile and the best score, then reloads for a clean start.
Settings.prototype.resetProgress = function () {
    console.log('[settings] progress reset by the player');
    try {
        window.localStorage.removeItem(this.progress.storageKey);
        window.localStorage.removeItem(GameManager.BEST_KEY);
    } catch (err) {
        // Storage blocked: the reload alone brings back a fresh profile.
    }
    this.progress.sandbox = true; // don't save the old profile on the way out
    window.location.reload();
};

// ---- Page

Settings.prototype.open = function () {
    if (this.screens) {
        this.screens.open('settings');
        return;
    }
    if (this.isOpen || this.progress.pending || this.game.state === 'playing') return;
    this.isOpen = true;
    this.game.hold(true);
    this._render();
    this._panel.classList.add('is-on');
};

Settings.prototype.close = function () {
    if (this.screens) {
        if (this.screens.isOpen('settings')) this.screens._back();
        return;
    }
    if (!this.isOpen) return;
    this.isOpen = false;
    this._arm(false);
    this._panel.classList.remove('is-on');
    this.game.hold(false);
    this.progress.commit();
};

Settings.prototype._onKeyDown = function (e) {
    if (this.screens) return;
    if (this.isOpen && e.key === pc.KEY_ESCAPE) this.close();
};

Settings.prototype._arm = function (on) {
    this.confirming = on;
    clearTimeout(this._confirmTimer);
    if (on) {
        var self = this;
        this._confirmTimer = setTimeout(function () {
            self.confirming = false;
            if (self.isOpen) self._render();
        }, Settings.CONFIRM_TIME * 1000);
    }
};

Settings.HUD_CSS = [
    '.nr-set-btn { display: none; align-items: center; height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(159, 233, 255, 0.5); background: rgba(14, 6, 28, 0.75); color: #9fe9ff; font: 800 14px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; letter-spacing: 0.12em; cursor: pointer; }',
    '.nr-set-btn.is-on { display: flex; }',
    '.nr-set { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center; padding: 12px; background: rgba(8, 3, 18, 0.62); font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; color: #cfc6e6; }',
    '.nr-set.is-on { display: flex; }',
    '.nr-set-card { display: flex; flex-direction: column; width: 420px; max-width: 100%; max-height: 100%; box-sizing: border-box; background: rgba(14, 6, 28, 0.96); border: 1px solid rgba(53, 244, 255, 0.5); border-radius: 16px; box-shadow: 0 0 32px rgba(53, 244, 255, 0.2); }',
    '.nr-set-head { display: flex; align-items: center; padding: 12px 14px 8px 18px; }',
    '.nr-set-head h2 { margin: 0; flex: 1; font-size: 20px; letter-spacing: 0.2em; color: #35f4ff; text-shadow: 0 0 12px rgba(53, 244, 255, 0.6); }',
    '.nr-set-x { width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.08); color: #fff; font: inherit; font-size: 18px; line-height: 1; cursor: pointer; }',
    '.nr-set-body { overflow-y: auto; padding: 4px 18px 16px; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.2) transparent; }',
    '.nr-set-h { margin: 12px 0 2px; color: #9fe9ff; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }',
    '.nr-set-row { padding: 8px 0 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }',
    '.nr-set-row label { display: flex; align-items: baseline; gap: 8px; color: #fff; font-size: 14px; }',
    '.nr-set-row label span { margin-left: auto; color: #35f4ff; font-variant-numeric: tabular-nums; font-size: 13px; }',
    '.nr-set-row small { display: block; margin-top: 1px; color: #9d93b8; font-size: 12px; }',
    '.nr-set-row input[type=range] { width: 100%; margin-top: 8px; accent-color: #35f4ff; }',
    '.nr-switch { display: flex; align-items: center; gap: 10px; }',
    '.nr-switch button { width: 52px; height: 28px; padding: 0; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 999px; background: rgba(255, 255, 255, 0.08); cursor: pointer; position: relative; }',
    '.nr-switch button i { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #8a7fa6; transition: left 0.15s, background 0.15s; }',
    '.nr-switch button.is-on { border-color: #35f4ff; background: rgba(53, 244, 255, 0.22); }',
    '.nr-switch button.is-on i { left: 27px; background: #35f4ff; }',
    '.nr-set-keys { margin: 8px 0 0; font-size: 12px; line-height: 1.7; color: #cfc6e6; }',
    '.nr-set-keys b { color: #fff; }',
    '.nr-danger { margin-top: 10px; padding: 8px 14px; border-radius: 999px; border: 1px solid rgba(255, 77, 106, 0.6); background: transparent; color: #ff6b84; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }',
    '.nr-danger.is-armed { background: #ff4d6a; color: #fff; }'
].join('\n');

Settings.prototype._buildHud = function () {
    var self = this;
    this._style = document.createElement('style');
    this._style.textContent = Settings.HUD_CSS;
    document.head.appendChild(this._style);

    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.className = 'nr-set-btn';
    this._button.textContent = 'SETTINGS';
    this._button.addEventListener('click', function () { self.open(); });
    this.game.getButtonBar().appendChild(this._button);

    if (this.screens) return;   // the in-game page is up instead

    this._panel = document.createElement('div');
    this._panel.className = 'nr-set';
    document.body.appendChild(this._panel);
    this._panel.addEventListener('click', function (ev) {
        if (ev.target === self._panel || ev.target.closest('[data-close]')) {
            self.close();
            return;
        }
        var toggle = ev.target.closest('[data-toggle]');
        if (toggle) {
            self.set(toggle.getAttribute('data-toggle'), !self.values()[toggle.getAttribute('data-toggle')]);
            self._render();
            return;
        }
        if (ev.target.closest('[data-reset]')) {
            if (self.confirming) self.resetProgress();
            else {
                self._arm(true);
                self._render();
            }
        }
    });
    this._panel.addEventListener('input', function (ev) {
        var slider = ev.target.closest('[data-slider]');
        if (!slider) return;
        var id = slider.getAttribute('data-slider');
        self.set(id, Number(slider.value) / 100);
        var out = self._panel.querySelector('[data-out="' + id + '"]');
        if (out) out.textContent = slider.value + '%';
    });
    this._panel.addEventListener('change', function () { self.progress.commit(); });
};

Settings.prototype._renderButton = function () {
    this._button.classList.toggle('is-on', this.game.state === 'ready');
};

Settings.prototype._render = function () {
    if (this.screens) {
        this.app.fire('ui:refresh');   // the in-game page redraws itself
        return;
    }
    var v = this.values();
    var keep = this._panel.querySelector('.nr-set-body');
    var scroll = keep ? keep.scrollTop : 0;
    var row = function (list) {
        return list.map(function (s) {
            var pct = Math.round(v[s.id] * 100);
            return '<div class="nr-set-row"><label>' + s.name + '<span data-out="' + s.id + '">' + pct + '%</span></label>' +
                (s.note ? '<small>' + s.note + '</small>' : '') +
                '<input type="range" min="0" max="' + Math.round(s.max * 100) + '" step="5" value="' + pct + '" data-slider="' + s.id + '" aria-label="' + s.name + '"></div>';
        }).join('');
    };
    var toggles = Settings.TOGGLES.map(function (t) {
        return '<div class="nr-set-row nr-switch"><div><label>' + t.name + '</label><small>' + t.note + '</small></div>' +
            '<button type="button" class="' + (v[t.id] ? 'is-on' : '') + '" data-toggle="' + t.id + '" role="switch" aria-checked="' + !!v[t.id] + '" aria-label="' + t.name + '"><i></i></button></div>';
    }).join('');
    var sound = Settings.SLIDERS.slice(0, 3);
    var camera = Settings.SLIDERS.slice(3);
    this._panel.innerHTML = '<div class="nr-set-card">' +
        '<div class="nr-set-head"><h2>SETTINGS</h2><button class="nr-set-x" type="button" data-close aria-label="Close">×</button></div>' +
        '<div class="nr-set-body">' +
        '<div class="nr-set-h">Sound</div>' + row(sound) +
        '<div class="nr-set-h">Camera</div>' + row(camera) + toggles +
        '<div class="nr-set-h">Controls</div><p class="nr-set-keys"><b>← →</b> or <b>A D</b> or swipe: change lane<br>' +
        '<b>↑</b> or <b>W</b> or <b>Space</b> or swipe up: jump<br><b>↓</b> or <b>S</b> or swipe down: slide<br>' +
        '<b>P</b> or <b>Esc</b>: pause · <b>M</b>: sound on/off</p>' +
        '<div class="nr-set-h">Start over</div>' +
        '<p class="nr-set-keys">Clears coins, levels, trophies, records and everything you own on this device.</p>' +
        '<button class="nr-danger' + (this.confirming ? ' is-armed' : '') + '" type="button" data-reset>' +
        (this.confirming ? 'Tap again to erase everything' : 'Reset all progress') + '</button>' +
        '</div></div>';
    this._panel.querySelector('.nr-set-body').scrollTop = scroll;
};

Settings.prototype._onDestroy = function () {
    this.app.off('game:state', this._renderButton, this);
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    clearTimeout(this._confirmTimer);
    if (this.isOpen) this.game.hold(false);
    this._button.remove();
    if (this._panel) this._panel.remove();
    this._style.remove();
};
