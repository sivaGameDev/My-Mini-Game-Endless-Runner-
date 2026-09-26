var AudioFx = pc.createScript('audioFx');

AudioFx.attributes.add('volume', { type: 'number', default: 0.7, title: 'Master Volume' });
AudioFx.attributes.add('sfxVolume', { type: 'number', default: 0.8, title: 'Effects Volume' });
AudioFx.attributes.add('musicVolume', { type: 'number', default: 0.35, title: 'Music Volume' });

AudioFx.MUTE_KEY = 'neonRunner.muted';
AudioFx.LOOKAHEAD = 0.12;              // seconds of music scheduled ahead
AudioFx.BASS = [55, 43.65, 65.41, 49]; // A1, F1, C2, G1: Am - F - C - G, one chord per bar
AudioFx.ARP = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
AudioFx.BASS_STEPS = [1, 1, 2, 1, 1.5, 1, 2, 1.5]; // multiples of the root on each eighth note

// Synthesised sound effects and a synthwave music loop, built with Web Audio so the project needs
// no audio files. Effects follow game events; the music plays only while running and speeds up
// with the run. M (or the speaker button) mutes, and the choice is remembered.
AudioFx.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.muted = this._loadMuted();
    this.ctx = null;       // created on the first key press or tap (browsers block audio before that)
    this.triggered = {};   // how many times each effect was triggered (even while audio is locked), for testing
    this.music = { on: false, next: 0, step: 0 };

    var self = this;
    var on = function (event, fn) {
        self.app.on(event, fn, self);
        self._offs = self._offs || [];
        self._offs.push([event, fn]);
    };
    on('runner:jump', function () { this.play('jump'); });
    on('runner:airjump', function () { this.play('airjump'); });
    on('runner:slide', function () { this.play('slide'); });
    on('runner:land', function (impact) { if (impact > 4) this.play('land', impact); });
    on('runner:lane', function () { this.play('lane'); });
    on('runner:bonk', function () { this.play('bonk'); });
    on('runner:coin', function () { this.play('coin'); });
    on('runner:powerup', function () { this.play('powerup'); });
    on('runner:pad', function (v) { this.play('pad', v); });
    on('runner:boost', function () { this.play('boost'); });
    on('runner:goo', function () { this.play('goo'); });
    on('runner:shielded', function () { this.play('shield'); });
    on('runner:stumble', function () { this.play('stumble'); });
    on('runner:crash', function (entity, kind) { this.play(kind === 'gap' ? 'fall' : 'crash'); });
    on('crusher:land', function (distance) { this.play('crusher', distance); });
    on('shifter:move', function (distance) { this.play('shifter', distance); });
    on('stone:crumble', function () { this.play('crumble'); });
    on('combo:trick', function (count) { this.play('trick', count); });
    on('runner:closecall', function () { this.play('closecall'); });
    on('zone:change', function () { this.play('zone'); });
    on('game:start', function () { this._ensure(); this.play('start'); });
    on('progress:reward', function () { this.play('reward'); });
    on('progress:mission', function () { this.play('mission'); });
    on('record:passed', function (kind) { this.play(kind === 'best' ? 'record' : 'mission'); });
    on('shop:buy', function () { this.play('buy'); });
    on('shop:equip', function () { this.play('lane'); });
    on('level:up', function () { this.play('levelup'); });
    on('trophy:unlock', function (id, tier) { this.play('trophy', tier); });
    on('zone:unlock', function () { this.play('reward'); });
    on('challenge:beaten', function () { this.play('record'); });

    this.app.keyboard.on(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    this._unlock = this._ensure.bind(this);
    window.addEventListener('pointerdown', this._unlock);
    window.addEventListener('keydown', this._unlock);
    this._buildButton();
    this.on('destroy', this._onDestroy, this);
};

// Create (or wake) the audio graph: effects and music each have a gain, into a master gain and
// a compressor so stacked sounds don't clip.
AudioFx.prototype._ensure = function () {
    if (!this.ctx) {
        var manager = this.app.systems.sound && this.app.systems.sound.manager;
        var ctx = (manager && manager.context) || new (window.AudioContext || window.webkitAudioContext)();
        this.ctx = ctx;
        this.master = ctx.createGain();
        var comp = ctx.createDynamicsCompressor();
        this.master.connect(comp);
        comp.connect(ctx.destination);
        this.sfx = ctx.createGain();
        this.musicGain = ctx.createGain();
        this.sfx.connect(this.master);
        this.musicGain.connect(this.master);
        this.musicGain.gain.value = 0;
        var len = ctx.sampleRate;
        this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
        var data = this.noiseBuffer.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this._applyVolume();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
};

// Used by the settings screen; music follows straight away if it is playing.
AudioFx.prototype.setVolumes = function (master, sfx, music) {
    this.volume = master;
    this.sfxVolume = sfx;
    this.musicVolume = music;
    this._applyVolume();
    if (this.ctx && this.music.on) this.musicGain.gain.setTargetAtTime(music, this.ctx.currentTime, 0.1);
};

AudioFx.prototype._applyVolume = function () {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.02);
    this.sfx.gain.setTargetAtTime(this.sfxVolume, t, 0.02);
};

// ---- Synth building blocks

// A single oscillator gliding from f0 to f1 with a quick attack and exponential decay.
AudioFx.prototype._tone = function (type, f0, f1, dur, vol, when, out) {
    var ctx = this.ctx;
    var t = when || ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(out || this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
};

// Filtered noise: whooshes, hats, crashes.
AudioFx.prototype._noise = function (dur, vol, filter, f0, f1, when, out) {
    var ctx = this.ctx;
    var t = when || ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    var bq = ctx.createBiquadFilter();
    bq.type = filter;
    bq.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) bq.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq);
    bq.connect(g);
    g.connect(out || this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
};

AudioFx.prototype._arp = function (notes, gap, type, vol) {
    var t = this.ctx.currentTime;
    for (var i = 0; i < notes.length; i++) this._tone(type, notes[i], notes[i], gap * 1.6, vol, t + i * gap);
};

// Quieter with distance, for things happening down the road.
AudioFx.prototype._far = function (distance) {
    return Math.max(0.15, 1 - (distance || 0) / 60);
};

// ---- Effects

AudioFx.prototype.play = function (name, arg) {
    this.triggered[name] = (this.triggered[name] || 0) + 1;
    if (this.muted) return;
    if (this.ctx && this.ctx.state === 'running') {
        this._sound(name, arg);
        return;
    }
    // Audio is still locked. A sound that comes straight from a key press or tap (the start of the
    // first run, claiming the daily reward) wakes it and plays once it's running.
    var activation = navigator.userActivation;
    if (!activation || !activation.isActive) return;
    this._ensure();
    var self = this;
    this.ctx.resume().then(function () {
        if (!self.muted) self._sound(name, arg);
    }, function () {});
};

// Builds one effect on this.ctx, into this.sfx, starting now.
AudioFx.prototype._sound = function (name, arg) {
    var t = this.ctx.currentTime;
    switch (name) {
        case 'jump': this._tone('square', 280, 560, 0.12, 0.12); break;
        case 'airjump': this._tone('square', 420, 900, 0.14, 0.12); break;
        case 'slide': this._noise(0.25, 0.25, 'bandpass', 1400, 300); break;
        case 'land': this._tone('sine', 140, 55, 0.09, Math.min(0.35, arg * 0.03)); break;
        case 'lane': this._noise(0.05, 0.05, 'highpass', 4000, 4000); break;
        case 'bonk': this._tone('square', 220, 140, 0.08, 0.12); break;
        case 'coin':
            this._tone('triangle', 1320, 1320, 0.06, 0.12);
            this._tone('triangle', 1760, 1760, 0.1, 0.12, t + 0.05);
            break;
        case 'powerup': this._arp([523, 659, 784, 1047], 0.06, 'triangle', 0.14); break;
        case 'pad': this._tone('sine', 160, (arg || 14) * 60, 0.35, 0.3); break;
        case 'boost': this._tone('sawtooth', 200, 1200, 0.4, 0.1); break;
        case 'goo': this._tone('sine', 110, 60, 0.3, 0.25); break;
        case 'shield':
            this._tone('square', 1200, 300, 0.2, 0.1);
            this._noise(0.15, 0.15, 'highpass', 3000, 1500);
            break;
        case 'stumble': this._tone('sawtooth', 170, 80, 0.3, 0.2); break;
        case 'crash':
            this._noise(0.6, 0.5, 'lowpass', 2500, 150);
            this._tone('sine', 110, 35, 0.6, 0.45);
            break;
        case 'fall': this._tone('sine', 900, 90, 0.8, 0.22); break;
        case 'crusher':
            this._tone('sine', 75, 38, 0.35, 0.5 * this._far(arg));
            this._noise(0.25, 0.25 * this._far(arg), 'lowpass', 600, 150);
            break;
        case 'shifter': this._noise(0.3, 0.14 * this._far(arg), 'bandpass', 400, 1600); break;
        case 'crumble': this._noise(0.45, 0.2, 'bandpass', 900, 250); break;
        case 'trick': {
            var up = Math.pow(2, Math.min(arg || 1, 10) / 12); // a semitone higher per combo step
            this._tone('triangle', 660 * up, 990 * up, 0.1, 0.1);
            break;
        }
        case 'closecall':
            this._noise(0.22, 0.2, 'highpass', 2000, 7000);
            this._tone('triangle', 880, 1320, 0.12, 0.08);
            break;
        case 'zone': [440, 554.4, 659.3].forEach(function (f) { this._tone('triangle', f, f, 1.2, 0.08); }, this); break;
        case 'start': this._arp([330, 440, 554, 659], 0.07, 'square', 0.08); break;
        case 'reward':
            this._arp([523, 659, 784, 1047, 1319], 0.07, 'triangle', 0.14);
            this._noise(0.5, 0.06, 'highpass', 6000, 9000, t + 0.3);
            break;
        case 'mission': this._arp([659, 880, 1175], 0.08, 'square', 0.07); break;
        case 'levelup':
            this._arp([392, 494, 587, 784, 988, 1175], 0.08, 'square', 0.07);
            this._tone('sine', 1568, 1568, 0.7, 0.09, t + 0.5);
            break;
        case 'trophy': {
            var root = 880 * Math.pow(2, (arg || 0) * 2 / 12); // brighter for silver and gold
            this._tone('triangle', root, root, 0.12, 0.12);
            this._tone('triangle', root * 1.5, root * 1.5, 0.3, 0.12, t + 0.1);
            this._noise(0.4, 0.05, 'highpass', 7000, 9000, t + 0.1);
            break;
        }
        case 'buy':
            this._tone('triangle', 1320, 1320, 0.06, 0.12);
            this._tone('triangle', 1760, 1760, 0.06, 0.12, t + 0.06);
            this._tone('triangle', 2350, 2350, 0.14, 0.12, t + 0.12);
            break;
        case 'record':
            this._arp([392, 523, 659, 784, 1047], 0.09, 'sawtooth', 0.07);
            this._tone('triangle', 1047, 1047, 0.6, 0.1, t + 0.45);
            break;
    }
};

// ---- Music: a 16-step synthwave loop scheduled a little ahead of time

AudioFx.prototype.update = function () {
    if (!this.ctx || this.ctx.state !== 'running') return;
    var playing = this.game.state === 'playing' && !this.muted;
    var now = this.ctx.currentTime;
    if (playing !== this.music.on) {
        this.music.on = playing;
        this.musicGain.gain.setTargetAtTime(playing ? this.musicVolume : 0, now, 0.15);
        if (playing) this.music.next = Math.max(this.music.next, now + 0.05);
    }
    if (!playing) return;

    var intensity = this.game.getIntensity();
    var stepTime = 60 / (112 + 28 * intensity) / 4;
    while (this.music.next < now + AudioFx.LOOKAHEAD) {
        this._musicStep(this.music.step, this.music.next, intensity);
        this.music.next += stepTime;
        this.music.step++;
    }
};

AudioFx.prototype._musicStep = function (step, t, intensity) {
    var out = this.musicGain;
    var s = step % 16;
    var chord = Math.floor(step / 16) % 4;
    if (s % 4 === 0) this._tone('sine', 150, 42, 0.16, 0.6, t, out);                 // kick
    if (s === 4 || s === 12) this._noise(0.12, 0.22, 'bandpass', 1800, 1200, t, out); // snare
    if (s % 4 === 2) this._noise(0.04, 0.1, 'highpass', 7000, 7000, t, out);          // hat
    if (s % 2 === 0) {
        var f = AudioFx.BASS[chord] * AudioFx.BASS_STEPS[s / 2];
        this._tone('sawtooth', f, f, 0.2, 0.18, t, out);                               // bass
    }
    if (intensity > 0.3) {
        var notes = AudioFx.ARP[chord];
        var n = notes[s % 3] * 2;
        this._tone('triangle', n, n, 0.1, 0.05 * intensity, t, out);                   // arpeggio once the run gets going
    }
};

// ---- Mute

AudioFx.prototype._onKeyDown = function (e) {
    if (e.key === pc.KEY_M) this.toggleMute();
};

AudioFx.prototype.toggleMute = function () {
    this.muted = !this.muted;
    try {
        window.localStorage.setItem(AudioFx.MUTE_KEY, this.muted ? '1' : '0');
    } catch (err) {
        // Storage blocked: the setting lasts for this session only.
    }
    this._ensure();
    this._applyVolume();
    this._renderButton();
};

AudioFx.prototype._loadMuted = function () {
    try {
        return window.localStorage.getItem(AudioFx.MUTE_KEY) === '1';
    } catch (err) {
        return false;
    }
};

AudioFx.prototype._buildButton = function () {
    this._style = document.createElement('style');
    this._style.textContent = '.nr-sound { position: fixed; right: 16px; bottom: 16px; z-index: 10; width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(53, 244, 255, 0.5); background: rgba(14, 6, 28, 0.62); color: #35f4ff; font-size: 18px; cursor: pointer; }' +
        '.nr-sound.is-muted { color: #8a7fa6; border-color: rgba(138, 127, 166, 0.5); text-decoration: line-through; }';
    document.head.appendChild(this._style);
    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.className = 'nr-sound';
    this._button.textContent = '♪';
    var self = this;
    this._button.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        self.toggleMute();
    });
    document.body.appendChild(this._button);
    this._renderButton();
};

AudioFx.prototype._renderButton = function () {
    this._button.classList.toggle('is-muted', this.muted);
    this._button.setAttribute('aria-label', this.muted ? 'Sound off' : 'Sound on');
};

AudioFx.prototype._onDestroy = function () {
    var self = this;
    (this._offs || []).forEach(function (o) { self.app.off(o[0], o[1], self); });
    this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKeyDown, this);
    window.removeEventListener('pointerdown', this._unlock);
    window.removeEventListener('keydown', this._unlock);
    this._button.remove();
    this._style.remove();
    if (this.musicGain) this.musicGain.gain.value = 0;
};
