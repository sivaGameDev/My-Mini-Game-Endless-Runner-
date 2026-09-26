var PerfProbe = pc.createScript('perfProbe');

PerfProbe.attributes.add('interval', { type: 'number', default: 2, title: 'Log Interval (s)' });

// TEMPORARY measurement helper: logs averaged frame stats. F9 halves the pixel ratio, F10 restores it.
PerfProbe.prototype.initialize = function () {
    this.device = this.app.graphicsDevice;
    this.originalRatio = this.device.maxPixelRatio;
    this._reset();
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this._onKey, this);
    this.on('destroy', function () {
        this.app.keyboard.off(pc.EVENT_KEYDOWN, this._onKey, this);
    }, this);
    console.log('[perf] drawCalls fields: ' + JSON.stringify(this.app.stats.drawCalls));
};

PerfProbe.prototype._reset = function () {
    this.t = 0;
    this.n = 0;
    this.a = { ms: 0, upd: 0, rnd: 0, total: 0, fwd: 0, shadow: 0, depth: 0, tris: 0 };
    this.maxTotal = 0;
};

PerfProbe.prototype._onKey = function (e) {
    if (e.key === pc.KEY_F9) {
        this.device.maxPixelRatio = Math.min(this.originalRatio, window.devicePixelRatio) / 2;
        this.app.resizeCanvas();
        this._reset();
        console.log('[perf] pixel ratio halved -> ' + this.device.maxPixelRatio + ', backbuffer ' + this.device.width + 'x' + this.device.height);
    } else if (e.key === pc.KEY_F10) {
        this.device.maxPixelRatio = this.originalRatio;
        this.app.resizeCanvas();
        this._reset();
        console.log('[perf] pixel ratio restored -> ' + this.device.maxPixelRatio + ', backbuffer ' + this.device.width + 'x' + this.device.height);
    }
};

PerfProbe.prototype.update = function (dt) {
    var s = this.app.stats;
    var f = s.frame;
    var dc = s.drawCalls;
    this.a.ms += f.ms || 0;
    this.a.upd += f.updateTime || 0;
    this.a.rnd += f.renderTime || 0;
    this.a.total += dc.total || 0;
    this.a.fwd += dc.forward || 0;
    this.a.shadow += dc.shadow || 0;
    this.a.depth += dc.depth || 0;
    this.a.tris += f.triangles || 0;
    this.maxTotal = Math.max(this.maxTotal, dc.total || 0);
    this.n++;
    this.t += dt;
    if (this.t < this.interval) return;

    var n = this.n;
    var game = this.app.root.findByName('Game');
    var state = game && game.script && game.script.gameManager ? game.script.gameManager.state : '?';
    var r = function (v) { return Math.round(v / n * 10) / 10; };
    console.log('[perf] state=' + state +
        ' | drawCalls total=' + r(this.a.total) + ' (max ' + this.maxTotal + ') forward=' + r(this.a.fwd) + ' shadow=' + r(this.a.shadow) + ' depth=' + r(this.a.depth) +
        ' | tris=' + Math.round(this.a.tris / n) +
        ' | frame ms=' + r(this.a.ms) + ' fps=' + f.fps + ' update=' + r(this.a.upd) + ' render=' + r(this.a.rnd) +
        ' | backbuffer ' + this.device.width + 'x' + this.device.height + ' ratio=' + this.device.maxPixelRatio);
    this._reset();
};
