var Challenge = pc.createScript('challenge');

Challenge.PARAM = 'c';           // ?c=<code> in the page address
Challenge.REWARD_COINS = 200;    // for beating a challenge, once per link
Challenge.REWARD_XP = 100;

// ---- Link codes: track seed, distance and score in base 36, plus a check value so a mistyped or
// edited link is ignored rather than played. Nothing about the player is in the link.

Challenge.check = function (seed, distance, score) {
    return Spawner.hash(Spawner.hash(seed, distance), score) % 1296;
};

Challenge.encode = function (seed, distance, score) {
    var n = [seed >>> 0, Math.max(0, Math.floor(distance)), Math.max(0, Math.floor(score))];
    n.push(Challenge.check(n[0], n[1], n[2]));
    return n.map(function (v) { return v.toString(36); }).join('-');
};

Challenge.decode = function (code) {
    if (typeof code !== 'string' || !/^[0-9a-z]{1,7}(-[0-9a-z]{1,7}){3}$/.test(code)) return null;
    var n = code.split('-').map(function (s) { return parseInt(s, 36); });
    if (n[0] > 4294967295 || n[1] > 1e6 || n[2] > 1e9) return null;
    if (Challenge.check(n[0], n[1], n[2]) !== n[3]) return null;
    return { seed: n[0], distance: n[1], score: n[2], code: code };
};

// ---- Script

// Challenge links (R14). SHARE RUN (after a crash) makes a link to the track just played with its
// distance and score; the Web Share sheet on phones, the clipboard elsewhere. Opening a link plays
// that exact track (the spawner builds it from the seed) with a FRIEND gate at the target, a banner
// on the start screen, and the result on the crash screen. Beating a challenge pays once per link.
Challenge.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.progress = this.entity.script.progress;
    this.levels = this.entity.script.levels || null;
    this.spawner = this.app.root.findByName('Pool').script.spawner;
    this.active = null;  // { seed, distance, score, code } while playing a challenge
    this.result = null;  // this run's result against it

    // A link opened this page: set the seed before the first track is built (the first reset).
    var code = null;
    try {
        code = new URLSearchParams(window.location.search).get(Challenge.PARAM);
    } catch (err) {
        // No URL parameters available.
    }
    if (code) this.enter(code);

    this._buildHud();
    this.app.on('game:start', this._onStart, this);
    this.app.on('game:state', this._renderButton, this);
    this.app.on('progress:runOver', this._onRunOver, this);
    this.on('destroy', this._onDestroy, this);
};

Challenge.prototype.postInitialize = function () {
    this.progress.addSection('ready', this._banner, this, true); // shown even to brand-new players
    this.progress.addSection('over', this._resultLine, this);
    this.progress.commit();
    this._renderButton();
};

// Play a challenge (from a link, or the test bot). Returns false for a bad code.
Challenge.prototype.enter = function (code) {
    var c = Challenge.decode(code);
    if (!c) {
        console.log('[challenge] ignored an invalid challenge code');
        return false;
    }
    this.active = c;
    this.spawner.setSeed(c.seed);
    console.log('[challenge] playing track ' + c.seed + ': beat ' + c.distance + ' m (score ' + c.score + ')');
    if (this.game.state === 'ready' && this.spawner.rowIndex) this.game.resetRun(); // rebuild the track already on screen
    return true;
};

// Back to normal, random tracks.
Challenge.prototype.exit = function () {
    if (!this.active) return;
    console.log('[challenge] left the challenge');
    this.active = null;
    this.spawner.setSeed(null);
    try {
        var url = new URL(window.location.href);
        url.searchParams.delete(Challenge.PARAM);
        window.history.replaceState(null, '', url.href);
    } catch (err) {
        // Address can't be changed (sandboxed frame): the challenge still ends for this session.
    }
    if (this.game.state === 'ready') this.game.resetRun();
    else this.progress.commit();
};

Challenge.prototype._onStart = function () {
    this.result = null;
};

Challenge.prototype._onRunOver = function (run) {
    var c = this.active;
    if (!c) return;
    var data = this.progress.data;
    var before = data.challenges[c.code];
    var won = run.distance > c.distance;
    var firstWin = won && !(before > c.distance);
    data.challenges[c.code] = Math.max(before || 0, run.distance);
    var codes = Object.keys(data.challenges);
    if (codes.length > 20) delete data.challenges[codes[0]];
    this.result = { distance: run.distance, target: c.distance, won: won, reward: firstWin };
    if (firstWin) {
        this.progress.earn(Challenge.REWARD_COINS);
        if (this.levels) this.levels.add(Challenge.REWARD_XP);
        this.app.fire('challenge:beaten', c.code);
    }
    console.log('[challenge] ' + run.distance + ' m vs ' + c.distance + ' m: ' + (won ? 'beaten' + (firstWin ? ' (+' + Challenge.REWARD_COINS + ' coins, +' + Challenge.REWARD_XP + ' XP)' : ' again') : 'not yet'));
};

// ---- Sharing

Challenge.prototype.linkFor = function (seed, distance, score) {
    var url = new URL(window.location.href);
    url.searchParams.set(Challenge.PARAM, Challenge.encode(seed, distance, score));
    url.hash = '';
    return url.href;
};

Challenge.prototype.share = function () {
    var distance = Math.floor(this.game.distance);
    var link = this.linkFor(this.spawner.seed, distance, this.game.score);
    var text = 'I ran ' + Progress.fmt(distance) + ' m in Neon Runner. Beat me on the same track!';
    var self = this;
    console.log('[challenge] share: ' + link);
    var touch = false;
    try {
        touch = window.matchMedia('(pointer: coarse)').matches;
    } catch (err) {
        // Assume a desktop.
    }
    if (touch && navigator.share) {
        navigator.share({ title: 'Neon Runner challenge', text: text, url: link }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text + ' ' + link).then(function () {
            self.progress.toast('Challenge link copied: send it to a friend', 'gold', true);
        }, function () {
            self._showLink(link);
        });
    } else {
        this._showLink(link);
    }
};

// Last resort (clipboard blocked): show the link, selected, to copy by hand.
Challenge.prototype._showLink = function (link) {
    this._linkBox.querySelector('input').value = link;
    this._linkBox.classList.add('is-on');
    this.game.hold(true);
    var input = this._linkBox.querySelector('input');
    input.focus();
    input.select();
};

Challenge.prototype._closeLink = function () {
    this._linkBox.classList.remove('is-on');
    this.game.hold(false);
};

// ---- HUD

Challenge.HUD_CSS = [
    '.nr-chal { display: flex; align-items: center; gap: 8px; margin: 2px 0 6px; padding: 6px 8px 6px 10px; border-radius: 8px; background: rgba(255, 77, 214, 0.14); border: 1px solid rgba(255, 77, 214, 0.6); color: #fff; font-size: 13px; }',
    '.nr-chal small { color: #ff9df6; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; }',
    '.nr-chal span { flex: 1; }',
    '.nr-chal button { width: 26px; height: 26px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.1); color: #fff; font: inherit; cursor: pointer; }',
    '.nr-chal-res { margin: 2px 0; font-size: 12px; color: #ff9df6; }',
    '.nr-chal-res b { color: #fff; }',
    '.nr-chal-res.is-won { color: #7dffb0; font-weight: 700; }',
    '.nr-share-btn { display: none; align-items: center; height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid rgba(255, 77, 214, 0.7); background: rgba(14, 6, 28, 0.75); color: #ff9df6; font: 800 14px "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; letter-spacing: 0.12em; cursor: pointer; }',
    '.nr-share-btn.is-on { display: flex; }',
    '.nr-linkbox { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center; padding: 16px; background: rgba(8, 3, 18, 0.62); font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; }',
    '.nr-linkbox.is-on { display: flex; }',
    '.nr-linkbox div { width: 420px; max-width: 100%; box-sizing: border-box; padding: 16px 18px; border-radius: 14px; background: rgba(14, 6, 28, 0.96); border: 1px solid rgba(255, 77, 214, 0.6); color: #cfc6e6; font-size: 13px; }',
    '.nr-linkbox b { display: block; margin-bottom: 8px; color: #fff; font-size: 15px; }',
    '.nr-linkbox input { width: 100%; box-sizing: border-box; padding: 8px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #fff; font: inherit; }',
    '.nr-linkbox button { margin-top: 10px; padding: 7px 18px; border: 0; border-radius: 999px; background: #ff4dd6; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }'
].join('\n');

Challenge.prototype._buildHud = function () {
    var self = this;
    this._style = document.createElement('style');
    this._style.textContent = Challenge.HUD_CSS;
    document.head.appendChild(this._style);

    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.className = 'nr-share-btn';
    this._button.textContent = 'SHARE RUN';
    this._button.setAttribute('aria-label', 'Challenge a friend to beat this run');
    this._button.addEventListener('click', function () { self.share(); });
    this.game.getButtonBar().appendChild(this._button);

    this._linkBox = document.createElement('div');
    this._linkBox.className = 'nr-linkbox';
    this._linkBox.innerHTML = '<div><b>Challenge a friend</b>Copy this link and send it:<input type="text" readonly aria-label="Challenge link"><button type="button">Done</button></div>';
    this._linkBox.querySelector('button').addEventListener('click', function () { self._closeLink(); });
    document.body.appendChild(this._linkBox);

    // The banner's ✕ sits inside the start panel, whose tap starts a run: catch it first.
    this._onPointer = function (ev) {
        if (ev.target.closest && ev.target.closest('[data-challenge-exit]')) ev.stopPropagation();
    };
    this._onClick = function (ev) {
        if (ev.target.closest && ev.target.closest('[data-challenge-exit]')) self.exit();
    };
    document.addEventListener('pointerdown', this._onPointer, true);
    document.addEventListener('click', this._onClick);
};

Challenge.prototype._renderButton = function () {
    this._button.classList.toggle('is-on', this.game.state === 'over');
};

// Start screen: what to beat, with a way out.
Challenge.prototype._banner = function () {
    var c = this.active;
    if (!c) return '';
    return '<div class="nr-chal"><small>CHALLENGE</small><span>Beat <b>' + Progress.fmt(c.distance) + ' m</b> on this track</span>' +
        '<button type="button" data-challenge-exit aria-label="Stop the challenge">✕</button></div>';
};

// Crash screen: this run against the challenge.
Challenge.prototype._resultLine = function () {
    var r = this.result;
    if (!r) return '';
    if (r.won) {
        return '<div class="nr-chal-res is-won">Challenge beaten! ' + Progress.fmt(r.distance) + ' m vs ' + Progress.fmt(r.target) + ' m' +
            (r.reward ? ' · +' + Challenge.REWARD_COINS + ' coins' : '') + '</div>';
    }
    return '<div class="nr-chal-res">Challenge: <b>' + Progress.fmt(r.target - r.distance + 1) + ' m</b> short of your friend (' + Progress.fmt(r.target) + ' m)</div>';
};

Challenge.prototype._onDestroy = function () {
    this.app.off('game:start', this._onStart, this);
    this.app.off('game:state', this._renderButton, this);
    this.app.off('progress:runOver', this._onRunOver, this);
    document.removeEventListener('pointerdown', this._onPointer, true);
    document.removeEventListener('click', this._onClick);
    if (this._linkBox.classList.contains('is-on')) this.game.hold(false);
    this.spawner.setSeed(null);
    this._button.remove();
    this._linkBox.remove();
    this._style.remove();
};
