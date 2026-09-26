var PixelHarness = pc.createScript('pixelHarness');

PixelHarness.attributes.add('label', { type: 'string', default: 'baseline', title: 'Capture Label', description: "'baseline' stores the reference captures; 'diag' hunts frame-to-frame noise; any other label compares against the baseline" });
PixelHarness.attributes.add('seed', { type: 'number', default: 1234, title: 'Random Seed' });
PixelHarness.attributes.add('warmupFrames', { type: 'number', default: 90, title: 'Warmup Frames' });

PixelHarness.DB = 'pixelHarness';
PixelHarness.STORE = 'captures';

// TEMPORARY dev harness (verify-pixels): seeds Math.random before the first reset, freezes the
// scene, renders fixed poses one frame at a time, reads the raw backbuffer and byte-compares it
// with the stored baseline. Results go to the console as "[pixels] ..." lines.
PixelHarness.prototype.initialize = function () {
    var s = this.seed >>> 0;
    this._origRandom = Math.random;
    Math.random = function () { // mulberry32
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // Coins spin with real frame time during warmup; hold them at their seeded angle.
    var pool = this.app.root.findByName('Pool');
    this.spawner = pool.script.spawner;
    this._origSpin = this.spawner.coinSpin;
    this.spawner.coinSpin = 0;

    this.frames = 0;
    this.started = false;
};

PixelHarness.prototype.update = function () {
    if (this.started) return;
    if (++this.frames < this.warmupFrames) return;
    this.started = true;
    this._run().catch(function (err) {
        console.error('[pixels] harness failed: ' + (err && err.stack ? err.stack : err));
    });
};

PixelHarness.prototype._run = async function () {
    var app = this.app;
    var device = app.graphicsDevice;
    var camera = app.root.findByName('Camera');
    var follow = camera.script.cameraFollow;
    var base = { pos: camera.getLocalPosition().clone(), rot: camera.getLocalEulerAngles().clone() };
    var self = this;

    follow.enabled = false;
    app.timeScale = 0;
    app.autoRender = false;

    var chase = function () {
        camera.setLocalPosition(base.pos);
        camera.setLocalEulerAngles(base.rot);
    };
    console.log('[pixels] label=' + this.label + ' seed=' + this.seed + ' backbuffer ' + device.width + 'x' + device.height);

    if (this.label === 'diag') {
        chase();
        await this._diagnose(camera);
    } else {
        await this._capturePoses([
            { name: 'A-start-chase', setup: chase },
            { name: 'B-start-side', setup: function () { camera.setPosition(9, 7, -8); camera.lookAt(0, 0, -34); } },
            { name: 'C-scrolled-chase', setup: function () { chase(); self._scroll(); } }
        ]);
    }

    // Hand the app back in a playable state.
    chase();
    follow.enabled = true;
    Math.random = this._origRandom;
    this.spawner.coinSpin = this._origSpin;
    app.timeScale = 1;
    app.autoRender = true;
    console.log('[pixels] done');
};

PixelHarness.prototype._capturePoses = async function (poses) {
    var db = await this._openDb();
    var isBaseline = this.label === 'baseline';

    for (var i = 0; i < poses.length; i++) {
        var pose = poses[i];
        pose.setup();
        var f1 = await this._renderAndRead();
        var f2 = await this._renderAndRead();
        var f3 = await this._renderAndRead();
        var total = f3.w * f3.h;
        var line = '[pixels] pose=' + pose.name + ' drawCalls=' + f3.drawCalls +
            ' | repeat f1-f2: ' + this._describe(this._diff(f1.pixels, f2.pixels, f3.w, f3.h), total) +
            ' | repeat f2-f3: ' + this._describe(this._diff(f2.pixels, f3.pixels, f3.w, f3.h), total);

        if (isBaseline) {
            await this._put(db, pose.name, { w: f3.w, h: f3.h, pixels: f3.pixels, drawCalls: f3.drawCalls });
            line += ' | saved as baseline';
        } else {
            var ref = await this._get(db, pose.name);
            if (!ref) {
                line += ' | NO BASELINE';
            } else if (ref.w !== f3.w || ref.h !== f3.h) {
                line += ' | SIZE MISMATCH baseline ' + ref.w + 'x' + ref.h;
            } else {
                line += ' | vs baseline (drawCalls ' + ref.drawCalls + '): ' + this._describe(this._diff(ref.pixels, f3.pixels, f3.w, f3.h), total);
            }
        }
        console.log(line);
    }
};

// Track-only noise hunt: are any transforms or camera matrices changing between frozen frames,
// and does the noise follow one kind of track piece, the fog, the sun or the skybox?
PixelHarness.prototype._diagnose = async function (camera) {
    var app = this.app;
    var scene = app.scene;
    var self = this;
    var player = app.root.findByTag('player')[0];
    var dynamic = this.spawner.coins.concat(this.spawner.obstacles.map(function (o) { return o.entity; }), [player]);
    dynamic.forEach(function (e) { e.enabled = false; });

    var renders = app.root.findComponents('render');
    var signature = function () {
        var h = 0;
        var add = function (f32) {
            var u = new Uint32Array(f32.buffer, f32.byteOffset, f32.length);
            for (var i = 0; i < u.length; i++) h = (Math.imul(h, 31) + u[i]) | 0;
        };
        add(camera.getWorldTransform().data);
        add(camera.camera.projectionMatrix.data);
        renders.forEach(function (r) {
            if (r.entity.enabled) add(r.entity.getWorldTransform().data);
        });
        return h;
    };

    var check = async function (label) {
        var f = [];
        var sigs = [];
        for (var i = 0; i < 4; i++) {
            f.push(await self._renderAndRead());
            sigs.push(signature());
        }
        var total = f[0].w * f[0].h;
        var d = function (a, b) { return self._describe(self._diff(a.pixels, b.pixels, a.w, a.h), total); };
        var distinct = sigs.filter(function (v, i) { return sigs.indexOf(v) === i; }).length;
        console.log('[pixels] diag ' + label + ' | transform signatures distinct=' + distinct + ' | f2-f3: ' + d(f[1], f[2]) + ' | f3-f4: ' + d(f[2], f[3]));
    };

    await check('track only');

    var segments = app.root.findByName('Track').script.trackScroller.segments;
    var kinds = [['Road'], ['LaneL', 'LaneR'], ['RailL', 'RailR'], ['GroundL', 'GroundR'], ['BlockL', 'BlockR']];
    for (var k = 0; k < kinds.length; k++) {
        var parts = [];
        segments.forEach(function (seg) {
            kinds[k].forEach(function (n) { parts.push(seg.findByName(n)); });
        });
        parts.forEach(function (e) { e.enabled = false; });
        await check('track without ' + kinds[k].join('/'));
        parts.forEach(function (e) { e.enabled = true; });
    }

    var fogType = scene.fog.type;
    scene.fog.type = 'none';
    await check('track, fog off');
    scene.fog.type = fogType;

    var sun = app.root.findByName('Sun');
    sun.enabled = false;
    await check('track, sun off');
    sun.enabled = true;

    var sky = scene.skybox;
    scene.skybox = null;
    await check('track, skybox off');
    scene.skybox = sky;

    dynamic.forEach(function (e) { e.enabled = true; });
};

// Scroll the track and the spawned rows 60 units with a fixed step, so recycled and
// re-decorated segments are in view. Deterministic because Math.random is seeded.
PixelHarness.prototype._scroll = function () {
    var track = this.app.root.findByName('Track').script.trackScroller;
    var spawner = this.spawner;
    var stub = { state: 'ready', speed: 14, startSpeed: 14, distance: 0, getStep: function () { return 1; } };
    var gameT = track.game;
    var gameS = spawner.game;
    track.game = stub;
    spawner.game = stub;
    for (var i = 0; i < 60; i++) {
        track.update(1 / 60);
        spawner.update(1 / 60);
    }
    track.game = gameT;
    spawner.game = gameS;
};

// Render exactly one frame and read the default framebuffer in the same task, before compositing.
// The frame's draw-call count is published to app.stats by the following tick.
PixelHarness.prototype._renderAndRead = function () {
    var app = this.app;
    var device = app.graphicsDevice;
    return new Promise(function (resolve) {
        app.once('frameend', function () {
            var gl = device.gl;
            var w = device.width;
            var h = device.height;
            var pixels = new Uint8Array(w * h * 4);
            if (device.setFramebuffer) device.setFramebuffer(null);
            else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            app.once('update', function () {
                resolve({ w: w, h: h, pixels: pixels, drawCalls: app.stats.drawCalls.total });
            });
        });
        app.renderNextFrame = true;
    });
};

PixelHarness.prototype._describe = function (d, total) {
    var s = d.count + ' of ' + total + ' differ';
    if (d.count) s += ' (max delta ' + d.maxDelta + ', bbox x' + d.bbox[0] + '-' + d.bbox[2] + ' y' + d.bbox[1] + '-' + d.bbox[3] + ')';
    return s;
};

PixelHarness.prototype._diff = function (a, b, w, h) {
    var count = 0;
    var maxDelta = 0;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var p = 0, i = 0; p < w * h; p++, i += 4) {
        var d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]));
        if (!d) continue;
        count++;
        if (d > maxDelta) maxDelta = d;
        var x = p % w;
        var y = (p / w) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    // readPixels rows run bottom-up; report the box in top-left screen coordinates.
    return { count: count, maxDelta: maxDelta, bbox: count ? [minX, h - 1 - maxY, maxX, h - 1 - minY] : null };
};

PixelHarness.prototype._openDb = function () {
    return new Promise(function (resolve, reject) {
        var req = indexedDB.open(PixelHarness.DB, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(PixelHarness.STORE); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
    });
};

PixelHarness.prototype._get = function (db, key) {
    return new Promise(function (resolve, reject) {
        var req = db.transaction(PixelHarness.STORE, 'readonly').objectStore(PixelHarness.STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
    });
};

PixelHarness.prototype._put = function (db, key, value) {
    return new Promise(function (resolve, reject) {
        var tx = db.transaction(PixelHarness.STORE, 'readwrite');
        tx.objectStore(PixelHarness.STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
    });
};
