var TrackScroller = pc.createScript('trackScroller');

TrackScroller.attributes.add('segmentLength', { type: 'number', default: 24, title: 'Segment Length' });
TrackScroller.attributes.add('segmentCount', { type: 'number', default: 7, title: 'Segment Count', description: 'Copies of Segment laid end to end; 7 x 24 reaches past the fog' });
TrackScroller.attributes.add('recycleZ', { type: 'number', default: 14, title: 'Recycle Z', description: 'A segment whose near edge passes this z (behind the camera) jumps to the far end' });

// Scrolls copies of the child 'Segment' toward the player and recycles them, so the road never ends.
TrackScroller.prototype.initialize = function () {
    this.game = this.app.root.findByName('Game').script.gameManager;

    var template = this.entity.findByName('Segment');
    this.startZ = template.getLocalPosition().z;
    this.segments = [template];
    for (var i = 1; i < this.segmentCount; i++) {
        var copy = template.clone();
        copy.name = 'Segment' + i;
        this.entity.addChild(copy);
        this.segments.push(copy);
    }

    this.app.on('game:reset', this.reset, this);
    this.on('destroy', function () {
        this.app.off('game:reset', this.reset, this);
    }, this);
};

TrackScroller.prototype.reset = function () {
    for (var i = 0; i < this.segments.length; i++) {
        this.segments[i].setLocalPosition(0, 0, this.startZ - i * this.segmentLength);
        this._decorate(this.segments[i]);
    }
};

TrackScroller.prototype.update = function (dt) {
    var step = this.game.getStep(dt);
    if (step === 0) return;

    var span = this.segmentLength * this.segments.length;
    var half = this.segmentLength / 2;
    for (var i = 0; i < this.segments.length; i++) {
        var seg = this.segments[i];
        var z = seg.getLocalPosition().z + step;
        if (z - half > this.recycleZ) {
            z -= span;
            this._decorate(seg);
        }
        seg.setLocalPosition(0, 0, z);
    }
};

// Re-roll the roadside blocks so recycled segments don't repeat exactly.
TrackScroller.prototype._decorate = function (seg) {
    var names = ['BlockL', 'BlockR'];
    for (var i = 0; i < names.length; i++) {
        var block = seg.findByName(names[i]);
        if (!block) continue;
        var side = i === 0 ? -1 : 1;
        var h = pc.math.random(1.2, 6);
        var w = pc.math.random(1.1, 2.4);
        block.setLocalScale(w, h, w);
        // Ground planes sit at y = -0.4; stand the block on them.
        block.setLocalPosition(side * pc.math.random(6.2, 8.2), h / 2 - 0.4, pc.math.random(-9, 9));
    }
};
