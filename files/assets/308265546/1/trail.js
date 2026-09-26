var Trail = pc.createScript('trail');

// Trail styles: sold in the shop (Style tab), or unlocked by reaching a level (levels script).
Trail.STYLES = [
    { id: 'none', name: 'None' },
    { id: 'cyan', name: 'Cyan', price: 400, color: [0.2, 0.95, 1] },
    { id: 'pink', name: 'Pink', price: 700, color: [1, 0.3, 0.9] },
    { id: 'gold', name: 'Gold', price: 1200, color: [1, 0.75, 0.2] },
    { id: 'rainbow', name: 'Rainbow', price: 2500, rainbow: true },
    { id: 'plasma', name: 'Plasma', level: 5, color: [0.7, 0.8, 1] },
    { id: 'ember', name: 'Ember', level: 15, color: [1, 0.35, 0.08] }
];
Trail.POINTS = 24;         // ribbon sections
Trail.LIFE = 0.3;          // seconds a point lasts
Trail.MAX_Z = 6;           // points past this are dropped, well before the camera
Trail.HALF_WIDTH = 0.34;   // at the runner; tapers to nothing
Trail.HEIGHT = 0.3;        // above the runner's feet
Trail.SLIDE_HEIGHT = 0.2;
Trail.MAX_DT = 1 / 20;

// A glowing ribbon behind the runner in the trail style the player has on. Recent runner positions
// ride back with the road and fade; one dynamic mesh, rebuilt each frame, draws them all.
Trail.prototype.initialize = function () {
    this.game = this.entity.script.gameManager;
    this.progress = this.entity.script.progress;
    this.runner = this.app.root.findByTag('player')[0].script.runnerController;
    this.points = []; // newest first: { x, y, z, age }
    this.time = 0;

    var n = Trail.POINTS;
    this.positions = new Float32Array(n * 2 * 3);
    this.colors = new Uint8Array(n * 2 * 4);
    var indices = [];
    for (var i = 0; i < n - 1; i++) {
        var a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    var normals = new Float32Array(n * 2 * 3);
    for (var j = 1; j < normals.length; j += 3) normals[j] = 1; // flat ribbon facing up; the material's shader expects normals
    this.mesh = new pc.Mesh(this.app.graphicsDevice);
    this.mesh.clear(true, false);
    this.mesh.setPositions(this.positions);
    this.mesh.setNormals(normals);
    this.mesh.setColors32(this.colors);
    this.mesh.setIndices(indices);
    this.mesh.update(pc.PRIMITIVE_TRIANGLES);

    this.material = new pc.StandardMaterial();
    this.material.diffuse.set(0, 0, 0);
    this.material.emissive.set(1, 1, 1);
    this.material.emissiveVertexColor = true;
    this.material.emissiveVertexColorChannel = 'rgb';
    this.material.useLighting = false;
    this.material.blendType = pc.BLEND_ADDITIVE;
    this.material.depthWrite = false;
    this.material.cull = pc.CULLFACE_NONE;
    this.material.update();

    var mi = new pc.MeshInstance(this.mesh, this.material);
    mi.cull = false; // the vertices move every frame
    this.ribbon = new pc.Entity('Trail');
    this.ribbon.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
    this.ribbon.enabled = false;
    this.app.root.addChild(this.ribbon);

    this.app.on('game:reset', this.reset, this);
    this.on('destroy', this._onDestroy, this);
};

Trail.prototype.reset = function () {
    this.points = [];
    this.ribbon.enabled = false;
};

Trail.prototype._style = function () {
    var id = this.progress ? this.progress.data.trails.equipped : 'none';
    var style = Trail.STYLES.filter(function (s) { return s.id === id; })[0];
    return style && style.id !== 'none' ? style : null;
};

Trail.prototype.update = function (dt) {
    var state = this.game.state;
    var style = this._style();
    if (!style || state === 'ready' || state === 'paused') {
        if (state !== 'paused' && (this.points.length || this.ribbon.enabled)) this.reset();
        return;
    }
    dt = Math.min(dt, Trail.MAX_DT);
    this.time += dt;
    var step = this.game.getStep(dt); // zero after a crash: the trail stays put and fades

    var points = this.points;
    for (var i = points.length - 1; i >= 0; i--) {
        var p = points[i];
        p.age += dt;
        p.z += step;
        if (p.age > Trail.LIFE || p.z > Trail.MAX_Z) points.splice(i, 1);
    }

    // The newest point follows the runner until it's old enough to leave behind.
    if (state === 'playing') {
        var r = this.runner;
        var y = r.y + (r.isSliding() ? Trail.SLIDE_HEIGHT : Trail.HEIGHT);
        var head = points[0];
        if (!head || head.age >= Trail.LIFE / (Trail.POINTS - 2)) {
            points.unshift({ x: r.x, y: y, z: 0.2, age: 0 });
            if (points.length > Trail.POINTS) points.length = Trail.POINTS;
        } else {
            head.x = r.x;
            head.y = y;
            head.z = 0.2;
        }
    }

    if (points.length < 2) {
        this.ribbon.enabled = false;
        return;
    }
    this.ribbon.enabled = true;
    this._build(style);
};

// Flat ribbon: two vertices per point, as wide as the point is young; unused sections collapse onto
// the last point and draw nothing.
Trail.prototype._build = function (style) {
    var points = this.points;
    var n = points.length;
    var pos = this.positions;
    var col = this.colors;
    for (var i = 0; i < Trail.POINTS; i++) {
        var p = points[Math.min(i, n - 1)];
        var t = Math.min(1, p.age / Trail.LIFE);
        var w = Trail.HALF_WIDTH * (1 - t);
        var v = i * 6;
        pos[v] = p.x - w; pos[v + 1] = p.y; pos[v + 2] = p.z;
        pos[v + 3] = p.x + w; pos[v + 4] = p.y; pos[v + 5] = p.z;

        var fade = i < n ? (1 - t) * (1 - t) : 0;
        var c = style.rainbow ? Trail.hue((this.time * 0.6 + i * 0.045) % 1) : style.color;
        var k = i * 8;
        for (var s = 0; s < 2; s++) {
            col[k + s * 4] = c[0] * fade * 255;
            col[k + s * 4 + 1] = c[1] * fade * 255;
            col[k + s * 4 + 2] = c[2] * fade * 255;
            col[k + s * 4 + 3] = 255;
        }
    }
    this.mesh.setPositions(pos);
    this.mesh.setColors32(col);
    this.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
};

// Fully saturated colour for a hue in 0..1.
Trail.hue = function (h) {
    var x = h * 6;
    return [
        pc.math.clamp(Math.abs(x - 3) - 1, 0, 1),
        pc.math.clamp(2 - Math.abs(x - 2), 0, 1),
        pc.math.clamp(2 - Math.abs(x - 4), 0, 1)
    ];
};

Trail.prototype._onDestroy = function () {
    this.app.off('game:reset', this.reset, this);
    this.ribbon.destroy();
    this.material.destroy();
    this.mesh.destroy();
};
