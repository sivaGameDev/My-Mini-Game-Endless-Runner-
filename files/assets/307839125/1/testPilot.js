var TestPilot = pc.createScript('testPilot');

TestPilot.attributes.add('runSeconds', { type: 'number', default: 45, title: 'Run Seconds' });
TestPilot.attributes.add('barAction', {
    type: 'string', default: 'slide', title: 'Bar Action',
    description: "What the bot does at an overhead bar: 'slide' (should pass), 'none' or 'jump' (both should crash)",
    enum: [{ slide: 'slide' }, { none: 'none' }, { jump: 'jump' }]
});
TestPilot.attributes.add('platformAction', {
    type: 'string', default: 'handle', title: 'Platform Action',
    description: "'handle' climbs ramps, jumps onto steps and avoids walls; 'ignore' runs straight into them (should crash)",
    enum: [{ handle: 'handle' }, { ignore: 'ignore' }]
});
TestPilot.attributes.add('gapAction', {
    type: 'string', default: 'handle', title: 'Gap Action',
    description: "'handle' jumps holes and crosses floating stones; 'ignore' runs straight on (should fall in)",
    enum: [{ handle: 'handle' }, { ignore: 'ignore' }]
});
TestPilot.attributes.add('testStumble', {
    type: 'string', default: 'none', title: 'Test Stumble',
    description: "'once' clips a block from the side on purpose (should stumble, not crash); 'twice' does it again inside the warning window (should crash)",
    enum: [{ none: 'none' }, { once: 'once' }, { twice: 'twice' }]
});
TestPilot.attributes.add('challenge', { type: 'string', default: '', title: 'Challenge Code', description: 'Play this challenge link code (the part after ?c=); empty for a normal run' });
TestPilot.attributes.add('dodgeLead', { type: 'number', default: 1.1, title: 'Dodge Lead (s)', description: 'How far ahead (in seconds) to start dodging a block; about 0.2 makes every dodge a close call' });
TestPilot.attributes.add('seekPads', { type: 'boolean', default: true, title: 'Seek Pads' });
TestPilot.attributes.add('seekPowerUps', { type: 'boolean', default: true, title: 'Seek Power-ups' });
TestPilot.attributes.add('testShield', { type: 'boolean', default: true, title: 'Test Shield', description: 'With a shield up, run into one tall block on purpose' });

TestPilot.PIT_LEAD = 0.12;   // seconds before a hole's near edge to take off
TestPilot.JUMP_LEAD = 0.3;   // seconds before a barrier or step to take off
TestPilot.REACT_TIME = 0.35; // anything closer than this in a lane makes it unsafe to move into
TestPilot.CLIP_HOLD = 0.3;   // hands off for this long after a deliberate side clip

// TEMPORARY bot playtest: starts a run and plays it with the runner's own actions (the same ones
// the keys call), exercising every feature, and logs "[pilot] ..." lines. The verdict is
// SURVIVED or CRASH, followed by counts of everything that happened.
TestPilot.prototype.initialize = function () {
    var game = this.app.root.findByName('Game');
    this.game = game.script.gameManager;
    this.powerUps = game.script.powerUps;
    this.gameEntity = game;
    this.runner = this.app.root.findByTag('player')[0].script.runnerController;
    this.spawner = this.app.root.findByName('Pool').script.spawner;
    this.t = 0;
    this.started = false;
    this.done = false;
    this.counted = new WeakSet();
    this.logged = { slide: 0, jump: 0, pad: 0, airjump: 0, level: 0, pit: 0, event: 0 };
    this.lastLaunch = null;   // 'jump' or 'pad': what put the runner in the air, cleared on landing
    this.flight = null;       // { kind, maxY } for pad launches and air jumps
    this.wasGrounded = true;
    this.level = 'ground';
    this.stoneTarget = null;  // lane of the next floating platform while jumping between them
    this.shieldTested = false;
    this.stumbleClips = 0;    // deliberate side clips done
    this.lastClip = -99;
    this.x2 = { points: 0, distance: 0 };
    this.lastPoints = 0;
    this.lastDistance = 0;
    this.coinThisFrame = false;
    this.stats = {
        slides: 0, jumps: 0, airJumps: 0, laneMoves: 0, padLaunches: 0, tallsOverPad: 0,
        barsPassed: 0, barsPassedSliding: 0, lowsPassed: 0, lowsPassedAirborne: 0, tallsDodged: 0,
        rampClimbs: 0, roofLandings: 0, stepLandings: 0, edgeDrops: 0, maxFloor: 0,
        holesCrossed: 0, chasmsCrossed: 0, stoneChasmsCrossed: 0, stoneLandings: 0, skyLandings: 0, tunnelsPassed: 0,
        boosts: 0, gooEntries: 0, crushersLanded: 0, shiftersMoved: 0, stonesCrumbled: 0, bonks: 0,
        stumbles: 0, tricks: 0, closeCalls: 0, zones: 0, gatesPassed: 0, challengesBeaten: 0,
        coins: 0, magnetCoins: 0, shieldAbsorbs: 0, pickups: {}, maxPadHeight: 0, maxAirJumpHeight: 0, resumes: 0
    };

    var self = this;
    var count = function (event, key, note) {
        self.app.on(event, function (a) {
            self.stats[key]++;
            if (note && self.logged.event++ < 40) console.log('[pilot] ' + note(a) + ' at ' + Math.floor(self.game.distance) + ' m');
        });
    };
    count('runner:boost', 'boosts', function () { return 'boost strip'; });
    count('runner:goo', 'gooEntries', function () { return 'ran into goo'; });
    count('crusher:land', 'crushersLanded', function (d) { return 'crusher landed ' + d.toFixed(1) + ' ahead'; });
    count('shifter:move', 'shiftersMoved', function (d) { return 'block shifted lanes ' + d.toFixed(1) + ' ahead'; });
    count('stone:crumble', 'stonesCrumbled', function () { return 'a crumbling stone fell'; });
    count('runner:bonk', 'bonks', function () { return 'bonked on a tunnel roof'; });
    count('runner:stumble', 'stumbles', function () { return 'STUMBLED (bounced back, run continues)'; });
    count('runner:trick', 'tricks');
    count('runner:closecall', 'closeCalls', function (k) { return 'close call past a ' + k; });
    // Trick and close-call bonuses land on these frames; keep them out of the x2 distance check.
    this.app.on('runner:trick', function () { this.coinThisFrame = true; }, this);
    this.app.on('runner:closecall', function () { this.coinThisFrame = true; }, this);
    count('zone:change', 'zones', function () { return 'entered a new colour zone'; });
    count('record:passed', 'gatesPassed', function (kind) { return 'ran through the ' + kind + ' gate'; });
    count('challenge:beaten', 'challengesBeaten', function () { return 'beat the challenge'; });

    this.app.on('runner:coin', function (coin, pulled) {
        this.stats.coins++;
        if (pulled) this.stats.magnetCoins++;
        this.coinThisFrame = true;
    }, this);
    this.app.on('runner:pad', function () {
        this.stats.padLaunches++;
        this.lastLaunch = 'pad';
        this.flight = { kind: 'pad', maxY: 0 };
    }, this);
    this.app.on('runner:airjump', function () {
        this.stats.airJumps++;
        this.flight = { kind: 'airjump', maxY: 0 };
    }, this);
    this.app.on('runner:powerup', function (type) {
        this.stats.pickups[type] = (this.stats.pickups[type] || 0) + 1;
    }, this);
    this.app.on('runner:shielded', function (kind) {
        this.stats.shieldAbsorbs++;
        this.shieldTested = true;
        console.log('[pilot] shield absorbed a ' + kind + ' hit; run continues');
    }, this);
    this.app.on('runner:crash', this._onCrash, this);
};

TestPilot.prototype.update = function (dt) {
    if (this.done) return;
    this.t += dt;
    if (!this.started) {
        if (this.t < 1) return;
        this.started = true;
        this.t = 0;
        // The progress script gives the bot a fresh, unsaved profile: give it records so both gates
        // show, and shop purchases (an upgrade, both items, a colour and a trail) to see them in play.
        var progress = this.gameEntity.script.progress;
        if (progress && progress.sandbox) {
            var d = progress.data;
            d.records.best = 300;
            d.records.days[progress.today - 1] = 150;
            d.upgrades.magnet = 3;
            d.items.shield = { count: 1, use: true };
            d.items.booster = { count: 1, use: true };
            d.skins.owned.push('lime');
            d.skins.equipped = 'lime';
            d.trails.owned.push('rainbow');
            d.trails.equipped = 'rainbow';
            // Just short of level 5 (Plasma trail) and of two trophies (Pogo, Regular).
            if (typeof Levels !== 'undefined') {
                d.xp = Levels.totalFor(5) - 40;
                d.level = 4;
            }
            d.stats.jumps = 495;
            d.runs = 24;
            progress.commit();
        }
        var challenge = this.gameEntity.script.challenge;
        if (this.challenge && challenge) challenge.enter(this.challenge);
        this.game.start();
        console.log('[pilot] run started, barAction=' + this.barAction + ', platformAction=' + this.platformAction +
            ', gapAction=' + this.gapAction + ', testStumble=' + this.testStumble);
        return;
    }
    // The game pauses itself when the window loses focus; the bot keeps going.
    if (this.game.state === 'paused') {
        this.stats.resumes++;
        this.game.resume();
    }
    if (this.game.state !== 'playing') return;

    this._drive();
    this._count();
    this._trackFlight();
    this._trackLevels();
    this._measureMultiplier();

    if (this.t >= this.runSeconds) {
        this.done = true;
        var ratio = this.x2.distance > 0 ? (this.x2.points / this.x2.distance).toFixed(3) : 'n/a';
        console.log('[pilot] SURVIVED ' + this.runSeconds + 's | ' + Math.floor(this.game.distance) + ' m | speed ' + this.game.speed.toFixed(1) +
            ' | x2 points per metre: ' + ratio + ' | ' + JSON.stringify(this.stats) + ' | ' + this._extras());
        this._audioCheck();
    }
};

// Combo, sound and zone state, from their own scripts.
TestPilot.prototype._extras = function () {
    var s = this.gameEntity.script;
    var combo = s.combo ? JSON.stringify(s.combo.stats) : 'no combo script';
    var audio = s.audioFx ? ('audio ' + (s.audioFx.ctx ? s.audioFx.ctx.state : 'not started') + ' muted=' + s.audioFx.muted + ' triggered=' + JSON.stringify(s.audioFx.triggered)) : 'no audio script';
    var zone = s.zones ? ('zone ' + s.zones.zone) : 'no zones script';
    var p = s.progress;
    var progress = p ? ('progress bank ' + p.data.wallet + ' streak ' + p.data.streak.count + ' missions ' + p.data.missions.list.map(function (m) {
        return m.id + ' ' + m.progress + (m.done ? ' done' : '');
    }).join(', ')) : 'no progress script';
    var level = s.levels ? ('level ' + s.levels.getLevel().level + ' xp ' + s.progress.data.xp) : 'no levels script';
    var trophies = s.achievements ? ('trophies ' + s.achievements.count() + '/' + Achievements.LIST.length) : 'no achievements script';
    return 'combo ' + combo + ' | ' + audio + ' | ' + zone + ' | ' + progress + ' | ' + level + ' | ' + trophies;
};

// The browser keeps the page's audio locked until a real click or key press, which the bot
// can't make. So each effect and a bar of music are rendered offline with the same synth code
// and measured: a silent, clipped or broken sound is reported.
TestPilot.AUDIO_EFFECTS = [['jump'], ['airjump'], ['slide'], ['land', 8], ['lane'], ['bonk'], ['coin'], ['powerup'], ['pad', 16],
    ['boost'], ['goo'], ['shield'], ['stumble'], ['crash'], ['fall'], ['crusher', 20], ['shifter', 20], ['crumble'], ['trick', 3],
    ['closecall'], ['zone'], ['start'], ['reward'], ['mission'], ['record'], ['buy'], ['levelup'], ['trophy', 2]];

TestPilot.prototype._audioCheck = function () {
    var audio = this.gameEntity.script.audioFx;
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!audio || !Offline) return;
    var RATE = 22050;
    var render = function (seconds, build) {
        var ctx = new Offline(1, Math.ceil(RATE * seconds), RATE);
        var noise = ctx.createBuffer(1, RATE, RATE);
        var data = noise.getChannelData(0);
        for (var i = 0; i < RATE; i++) data[i] = Math.random() * 2 - 1;
        // A stand-in that reads the real script's methods and settings but builds on the offline context.
        var fake = Object.create(audio);
        fake.ctx = ctx;
        fake.sfx = ctx.destination;
        fake.musicGain = ctx.destination;
        fake.noiseBuffer = noise;
        build(fake);
        return ctx.startRendering().then(function (buf) {
            var d = buf.getChannelData(0);
            var peak = 0;
            var sum = 0;
            for (var j = 0; j < d.length; j++) {
                var v = Math.abs(d[j]);
                if (v !== v) return { peak: NaN, rms: NaN };
                if (v > peak) peak = v;
                sum += v * v;
            }
            return { peak: peak, rms: Math.sqrt(sum / d.length) };
        });
    };
    var jobs = TestPilot.AUDIO_EFFECTS.map(function (e) {
        return render(1.5, function (fake) { fake._sound(e[0], e[1]); }).then(function (r) { r.name = e[0]; return r; });
    });
    jobs.push(render(2.3, function (fake) {
        // One bar at full intensity (kick, snare, hats, bass and arpeggio), 16 steps 0.13 s apart.
        for (var s = 0; s < 16; s++) fake._musicStep(s, s * 0.13, 1);
    }).then(function (r) { r.name = 'music'; return r; }));
    Promise.all(jobs).then(function (results) {
        var bad = results.filter(function (r) { return !(r.peak > 0.005) || r.peak > 1.5; });
        console.log('[pilot] audio render: ' + results.map(function (r) {
            return r.name + ' ' + r.peak.toFixed(2) + '/' + r.rms.toFixed(3);
        }).join(', ') + (bad.length ? ' | PROBLEM: ' + bad.map(function (r) { return r.name; }).join(', ') : ' | all ' + results.length + ' sounds audible, none clipping'));
    }).catch(function (err) {
        console.error('[pilot] audio render failed: ' + err);
    });
};

// Lanes a hole covers.
TestPilot.prototype._pitLanes = function (pit) {
    var laneW = this.runner.laneWidth;
    var p = pit.entity.getLocalPosition();
    return [Math.round((p.x - pit.w / 2) / laneW + 0.5), Math.round((p.x + pit.w / 2) / laneW - 0.5)];
};

// Nearest thing per lane that needs an action: obstacles (a shifting block counts in the lane it
// is heading to, and in its own lane until it has moved; a crusher counts from the start);
// platforms the runner can't just walk onto ('wall' = too high, dodge it; 'step' = jump onto it);
// holes without stones ('pit' = jump it). Ramps and floating platforms make their lane walkable.
TestPilot.prototype._scan = function () {
    var r = this.runner;
    var laneW = r.laneWidth;
    var self = this;
    var ahead = [null, null, null];
    var put = function (idx, dist, kind) {
        if (idx < 0 || idx > 2) return;
        if (!ahead[idx] || dist < ahead[idx].dist) ahead[idx] = { dist: dist, kind: kind };
    };
    this.spawner.obstacles.forEach(function (o) {
        var p = o.entity.getLocalPosition();
        if (p.z - o.def.maxHz > 0.3) return;
        var dist = -(p.z + o.def.maxHz);
        if (o.shift) {
            put(o.shift.to + 1, dist, 'tall');
            if (o.shift.t < 1) put(o.shift.from + 1, dist, 'tall');
            return;
        }
        put(Math.round(p.x / laneW) + 1, dist, o.crush ? 'tall' : o.def.name);
    });

    this.spawner.pits.forEach(function (pit) {
        if (pit.stones) return;
        var p = pit.entity.getLocalPosition();
        if (p.z - pit.len / 2 > 0.25) return;
        var lanes = self._pitLanes(pit);
        for (var l = lanes[0]; l <= lanes[1]; l++) put(l + 1, -(p.z + pit.len / 2), 'pit');
    });

    var nearest = [null, null, null];
    this.spawner.solids.forEach(function (s) {
        var p = s.entity.getLocalPosition();
        if (p.z - s.len / 2 > 0.25) return; // fully behind the runner
        var idx = Math.round(s.x / laneW) + 1;
        var dist = -(p.z + s.len / 2);
        if (!nearest[idx] || dist < nearest[idx].dist) nearest[idx] = { dist: dist, solid: s };
    });
    for (var idx = 0; idx < 3; idx++) {
        var n = nearest[idx];
        if (!n || n.solid.kind === 'ramp' || n.solid.kind === 'slab' || n.solid.kind === 'high') continue;
        var rise = n.solid.h - r.y;
        if (rise <= 0.05) continue;                                   // on it, or above it
        if (idx === r.lane + 1 && r.grounded && rise <= 0.8) continue; // stepping up off a ramp
        put(idx, n.dist, rise <= 1.05 ? 'step' : 'wall');
    }
    return ahead;
};

// Nearest unused pad per lane.
TestPilot.prototype._padsAhead = function () {
    var laneW = this.runner.laneWidth;
    var pads = [null, null, null];
    this.spawner.pads.forEach(function (pad) {
        if (pad.used) return;
        var p = pad.entity.getLocalPosition();
        var dist = -(p.z + 0.8);
        if (dist < -1) return;
        var idx = Math.round(p.x / laneW) + 1;
        if (!pads[idx] || dist < pads[idx].dist) pads[idx] = { dist: dist };
    });
    return pads;
};

// Something the runner has to get out of the way of, straight ahead.
TestPilot.prototype._blocks = function (entry) {
    return entry && (entry.kind === 'tall' || entry.kind === 'wall');
};

// Something that makes a lane unsafe to move into sideways: blockers, plus anything in that lane
// too close to react to once there (a barrier, bar, step or hole right ahead or alongside).
TestPilot.prototype._blocksSideways = function (entry, speed) {
    return this._blocks(entry) || (entry && entry.dist < speed * TestPilot.REACT_TIME);
};

// Floating platforms (stones over a chasm, or sky platforms): the one under the runner, the next
// one along, and whether one sits in a given lane right here. Returns true while steering across.
TestPilot.prototype._stones = function (speed) {
    var r = this.runner;
    var laneW = r.laneWidth;
    var slabs = this.spawner.solids.filter(function (s) { return (s.kind === 'slab' || s.kind === 'high') && !s.falling; });
    var here = function (lane) {
        for (var i = 0; i < slabs.length; i++) {
            var p = slabs[i].entity.getLocalPosition();
            if (Math.round(slabs[i].x / laneW) === lane && p.z + slabs[i].len / 2 > -0.25 && p.z - slabs[i].len / 2 < 0.25 &&
                Math.abs(r.y - slabs[i].h) < 0.3) return slabs[i];
        }
        return null;
    };
    var cur = r.grounded ? here(r.lane) : null;

    if (!cur) {
        if (r.grounded) {
            this.stoneTarget = null;
            return false;
        }
        // In the air between platforms: steer for the next one.
        if (this.stoneTarget !== null) {
            this._moveTo(this.stoneTarget);
            return true;
        }
        return false;
    }

    // The next platform of the same kind: the nearest one starting beyond the end of this one.
    var curFar = cur.entity.getLocalPosition().z - cur.len / 2;
    var next = null;
    slabs.forEach(function (s) {
        if (s.kind !== cur.kind) return;
        var p = s.entity.getLocalPosition();
        var near = p.z + s.len / 2;
        if (near >= curFar - 0.01) return;
        if (!next || near > next.near) next = { near: near, lane: Math.round(s.x / laneW) };
    });
    var target = next ? next.lane : r.lane;

    // Already lined up, or a platform alongside to walk across on (the first row fills every lane).
    if (target !== r.lane && here(target)) this._moveTo(target);

    // Jump just before this platform's end, then steer in the air (off the last one, just drop).
    var toEnd = -curFar;
    if (next && toEnd > 0 && toEnd < speed * TestPilot.PIT_LEAD && r.jumpBuffer === 0) {
        r.jump();
        this.lastLaunch = 'jump';
        this.stats.jumps++;
        this.stoneTarget = target;
    } else if (!next && cur.kind === 'slab' && toEnd > 0 && toEnd < speed * TestPilot.PIT_LEAD && r.jumpBuffer === 0) {
        r.jump(); // last stone: jump the final gap to the road
        this.lastLaunch = 'jump';
        this.stats.jumps++;
        this.stoneTarget = r.lane;
    }
    return true;
};

// Deliberate side clip for the stumble test: step into a block that is right alongside.
TestPilot.prototype._clipOnPurpose = function () {
    var want = this.testStumble === 'once' ? 1 : this.testStumble === 'twice' ? 2 : 0;
    if (this.stumbleClips >= want || this.t - this.lastClip < 1.5 || !this.runner.grounded) return false;
    var r = this.runner;
    var hb = r.getHitbox();
    var laneW = r.laneWidth;
    var target = null;
    this.spawner.obstacles.forEach(function (o) {
        if (target !== null || o.def.name !== 'tall') return;
        var p = o.entity.getLocalPosition();
        var lane = Math.round(p.x / laneW);
        if (Math.abs(lane - r.lane) === 1 &&
            p.z + o.def.maxHz > hb.z - hb.halfDepth + 0.3 && p.z - o.def.maxHz < hb.z + hb.halfDepth - 0.3) target = lane;
    });
    if (target === null) return false;
    this.stumbleClips++;
    this.lastClip = this.t;
    console.log('[pilot] clipping the side of a block on purpose (#' + this.stumbleClips + ')');
    r.changeLane(target > r.lane ? 1 : -1);
    return true;
};

TestPilot.prototype._drive = function () {
    var r = this.runner;
    var speed = this.game.getSpeed();
    var ignorePlatforms = this.platformAction === 'ignore';
    var ignoreGaps = this.gapAction === 'ignore';

    // After a deliberate clip, let it land: dodging now would steer straight back out of the block.
    if (this._clipOnPurpose() || this.t - this.lastClip < TestPilot.CLIP_HOLD) return;

    // Double Jump: after an ordinary jump, jump again at the top of the arc.
    if (this.powerUps.isActive('doubleJump') && !r.grounded && !r.airJumped && this.lastLaunch === 'jump' && r.vy < 0.3 && r.vy > -1.5 && r.ceiling === Infinity) {
        r.jump();
    }

    if (!ignoreGaps && this._stones(speed)) return;

    var ahead = this._scan();
    var pads = this._padsAhead();
    var cur = ahead[r.lane + 1];

    if (cur && (cur.kind === 'wall' || cur.kind === 'step') && ignorePlatforms) return;
    if (cur && cur.kind === 'pit' && ignoreGaps) return;

    if (this._blocks(cur) && cur.dist < speed * this.dodgeLead) {
        var pad = pads[r.lane + 1];
        var riding = !r.grounded && this.lastLaunch === 'pad';
        if (cur.kind === 'tall' && ((pad && pad.dist < cur.dist) || riding)) {
            // A pad in front of the block throws us over it.
        } else if (cur.kind === 'tall' && this.testShield && !this.shieldTested && this.powerUps.isActive('shield')) {
            if (!this.shieldNoted) {
                this.shieldNoted = true;
                console.log('[pilot] shield up: running into the tall block ' + cur.dist.toFixed(1) + ' ahead on purpose');
            }
        } else {
            this._dodge(ahead, cur, speed);
            return;
        }
    }

    if (cur && cur.dist > -0.5 && !this._blocks(cur)) {
        var jumpIt = cur.kind === 'low' || cur.kind === 'step' || cur.kind === 'pit' || (cur.kind === 'bar' && this.barAction === 'jump');
        var lead = cur.kind === 'pit' ? TestPilot.PIT_LEAD : TestPilot.JUMP_LEAD;
        if (jumpIt && cur.dist < speed * lead && r.grounded && r.jumpBuffer === 0) {
            r.jump();
            this.lastLaunch = 'jump';
            this.stats.jumps++;
            var key = cur.kind === 'pit' ? 'pit' : 'jump';
            if (this.logged[key]++ < 2) console.log('[pilot] jump: ' + cur.kind + ' ' + cur.dist.toFixed(2) + ' ahead at speed ' + speed.toFixed(1));
            return;
        }
        if (cur.kind === 'bar' && this.barAction === 'slide' && cur.dist < speed * 0.25 && !r.isSliding() && !r.slideQueued) {
            r.down();
            this.stats.slides++;
            if (this.logged.slide++ < 2) console.log('[pilot] slide: bar ' + cur.dist.toFixed(2) + ' ahead at speed ' + speed.toFixed(1) + ', grounded=' + r.grounded);
            return;
        }
        if (cur.dist < speed * 0.5) return; // busy with this lane
    }

    if (r.grounded) this._seek(ahead, speed);
};

TestPilot.prototype._dodge = function (ahead, cur, speed) {
    var r = this.runner;
    var order = [r.lane - 1, r.lane + 1, r.lane - 2, r.lane + 2];
    for (var i = 0; i < order.length; i++) {
        var l = order[i];
        if (l < -1 || l > 1) continue;
        var a = ahead[l + 1];
        if (this._blocksSideways(a, speed) && a.dist <= cur.dist + 4) continue;
        // Crossing two lanes: wait until the middle lane is safe to pass through.
        if (Math.abs(l - r.lane) === 2) {
            var mid = ahead[(l + r.lane) / 2 + 1];
            if (this._blocksSideways(mid, speed) && mid.dist < speed * 0.4) return;
        }
        this._moveTo(l);
        return;
    }
};

// Head for a pad or a power-up in another lane when nothing gets in the way first.
TestPilot.prototype._seek = function (ahead, speed) {
    var r = this.runner;
    var laneW = r.laneWidth;
    var best = null;
    var consider = function (p, kind) {
        var dist = -p.z;
        if (dist < 3 || dist > speed * 1.6) return;
        var lane = Math.round(p.x / laneW);
        if (lane === r.lane) return;
        if (!best || dist < best.dist) best = { lane: lane, dist: dist, kind: kind };
    };
    if (this.seekPowerUps) this.spawner.pickups.forEach(function (pk) { if (pk.y < 2) consider(pk.entity.getLocalPosition(), 'power-up'); });
    if (this.seekPads) this.spawner.pads.forEach(function (pad) { if (!pad.used) consider(pad.entity.getLocalPosition(), 'pad'); });
    if (!best) return;

    var target = ahead[best.lane + 1];
    if (target && target.dist < best.dist + 1) return;
    if (Math.abs(best.lane - r.lane) === 2) {
        var mid = ahead[(best.lane + r.lane) / 2 + 1];
        if (mid && mid.dist < best.dist + 1) return;
    }
    this._moveTo(best.lane);
};

TestPilot.prototype._moveTo = function (lane) {
    var r = this.runner;
    for (var i = 0; i < 2 && r.lane !== lane; i++) {
        var before = r.lane;
        r.changeLane(lane > r.lane ? 1 : -1);
        if (r.lane === before) return; // input locked this frame
        this.stats.laneMoves++;
    }
};

// Record the peak of each pad launch and double jump; everything resets on the landing frame.
TestPilot.prototype._trackFlight = function () {
    var r = this.runner;
    var landed = r.grounded && !this.wasGrounded;
    this.wasGrounded = r.grounded;
    if (this.flight) this.flight.maxY = Math.max(this.flight.maxY, r.y);
    if (!landed) return;
    this.lastLaunch = null;
    var f = this.flight;
    if (!f) return;
    this.flight = null;
    if (f.kind === 'pad') this.stats.maxPadHeight = Math.max(this.stats.maxPadHeight, +f.maxY.toFixed(2));
    else this.stats.maxAirJumpHeight = Math.max(this.stats.maxAirJumpHeight, +f.maxY.toFixed(2));
    if (this.logged[f.kind]++ < 2) console.log('[pilot] ' + (f.kind === 'pad' ? 'pad launch' : 'double jump') + ' landed, peak height ' + f.maxY.toFixed(2));
};

// What the runner is standing on, and how it got there.
TestPilot.prototype._trackLevels = function () {
    var r = this.runner;
    var fs = this.spawner.floorSolid;
    var onIt = r.grounded && fs && Math.abs(r.y - fs.h) < 0.02;
    var level;
    if (!r.grounded) level = 'air';
    else if (onIt && fs.kind === 'high') level = 'sky';
    else if (onIt && fs.kind === 'slab') level = 'stone';
    else if (onIt && fs.kind === 'platform') level = fs.h >= this.spawner.rooftopHeight - 0.01 ? 'roof' : 'step';
    else if (r.y > 0.001) level = 'ramp';
    else level = 'ground';
    this.stats.maxFloor = Math.max(this.stats.maxFloor, +r.floor.toFixed(2));

    var prev = this.level;
    if (level === prev) return;
    this.level = level;
    var note = null;
    if (level === 'roof' && prev === 'ramp') { this.stats.rampClimbs++; note = 'ran up a ramp onto a rooftop (y ' + r.y.toFixed(2) + ')'; }
    else if (level === 'roof' && prev === 'air') { this.stats.roofLandings++; note = 'landed on a rooftop'; }
    else if (level === 'step' && prev === 'air') { this.stats.stepLandings++; note = 'jumped up onto a step (y ' + r.y.toFixed(2) + ')'; }
    else if (level === 'stone' && prev === 'air') { this.stats.stoneLandings++; }
    else if (level === 'sky' && prev === 'air') { this.stats.skyLandings++; note = 'landed on a sky platform (y ' + r.y.toFixed(2) + ')'; }
    else if (level === 'air' && (prev === 'roof' || prev === 'step' || prev === 'sky') && Math.abs(r.vy) < 0.01) { this.stats.edgeDrops++; note = 'ran off the end of a ' + prev; }
    if (note && this.logged.level++ < 10) console.log('[pilot] ' + note + ' at ' + Math.floor(this.game.distance) + ' m');
};

// With Score x2 active, distance should earn 2 points per metre (coin and trick frames excluded).
TestPilot.prototype._measureMultiplier = function () {
    var points = this.game.points;
    var distance = this.game.distance;
    if (this.powerUps.isActive('multiplier') && !this.coinThisFrame) {
        this.x2.points += points - this.lastPoints;
        this.x2.distance += distance - this.lastDistance;
    }
    this.lastPoints = points;
    this.lastDistance = distance;
    this.coinThisFrame = false;
};

// Tally each obstacle, hole and tunnel once, as it passes the player.
TestPilot.prototype._count = function () {
    var r = this.runner;
    var laneW = r.laneWidth;
    var self = this;
    this.spawner.obstacles.forEach(function (o) {
        if (self.counted.has(o)) return;
        var p = o.entity.getLocalPosition();
        if (p.z - o.def.maxHz <= 0.3) return;
        self.counted.add(o);
        var inLane = Math.round(p.x / laneW) === r.lane;
        if (o.def.name === 'tall') {
            if (!inLane) self.stats.tallsDodged++;
            else if (!r.grounded) self.stats.tallsOverPad++;
        } else if (inLane && o.def.name === 'bar') {
            self.stats.barsPassed++;
            if (r.isSliding()) self.stats.barsPassedSliding++;
        } else if (inLane && o.def.name === 'low') {
            self.stats.lowsPassed++;
            if (!r.grounded) self.stats.lowsPassedAirborne++;
        }
    });
    this.spawner.pits.forEach(function (pit) {
        if (self.counted.has(pit)) return;
        var p = pit.entity.getLocalPosition();
        if (p.z - pit.len / 2 <= 0.3) return;
        self.counted.add(pit);
        var lanes = self._pitLanes(pit);
        if (r.lane < lanes[0] || r.lane > lanes[1]) return;
        if (pit.stones) self.stats.stoneChasmsCrossed++;
        else if (lanes[1] - lanes[0] === 2) self.stats.chasmsCrossed++;
        else self.stats.holesCrossed++;
    });
    this.spawner.tunnels.forEach(function (tn) {
        if (self.counted.has(tn)) return;
        var p = tn.entity.getLocalPosition();
        if (p.z - tn.len / 2 <= 0.3) return;
        self.counted.add(tn);
        self.stats.tunnelsPassed++;
        console.log('[pilot] came out of a tunnel (' + tn.len.toFixed(1) + ' long) at ' + Math.floor(self.game.distance) + ' m');
    });
};

TestPilot.prototype._onCrash = function (entity, kind) {
    if (this.done || !this.started) return;
    this.done = true;
    var r = this.runner;
    var hb = r.getHitbox();
    console.log('[pilot] CRASH into ' + kind + ' after ' + this.t.toFixed(1) + 's | ' + Math.floor(this.game.distance) + ' m | speed ' + this.game.speed.toFixed(1) +
        ' | lane ' + r.lane + ' x ' + hb.x.toFixed(2) + ' y ' + hb.y.toFixed(2) + ' floor ' + r.floor.toFixed(2) + ' vy ' + r.vy.toFixed(2) +
        ' grounded ' + r.grounded + ' sliding ' + r.isSliding() + ' | lastLaunch ' + this.lastLaunch + ' stoneTarget ' + this.stoneTarget +
        ' | ahead ' + JSON.stringify(this._scan()) + ' | ' + JSON.stringify(this.stats) + ' | ' + this._extras());
};
