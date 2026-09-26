// One-off patch: progress/markers/testPilot hooks for challenge links (R14).
const fs = require('fs');
const dir = __dirname + '/../scripts/';
const patch = (file, pairs) => {
    let a = fs.readFileSync(dir + file, 'utf8');
    pairs.forEach(([from, to]) => {
        if (!a.includes(from)) throw new Error(file + ' missing: ' + from.slice(0, 80));
        a = a.replace(from, to);
    });
    fs.writeFileSync(dir + file, a);
};

patch('markers.js', [
[`    yesterday: { label: 'YESTERDAY', color: [0.3, 0.9, 1] }
};`, `    yesterday: { label: 'YESTERDAY', color: [0.3, 0.9, 1] },
    friend: { label: 'FRIEND', color: [1, 0.3, 0.84] }
};`],
[`    this.gates = [this._buildGate('best'), this._buildGate('yesterday')];`, `    this.gates = [this._buildGate('best'), this._buildGate('yesterday'), this._buildGate('friend')];`],
[`    var t = this.progress ? this.progress.getTargets() : { best: 0, yesterday: 0 };
    var best = t.best >= Markers.MIN_RECORD ? t.best : 0;
    var yesterday = t.yesterday >= Markers.MIN_RECORD && Math.abs(t.yesterday - t.best) >= Markers.MIN_GAP ? t.yesterday : 0;
    this._arm(this.gates[0], best);
    this._arm(this.gates[1], yesterday);
    if (best || yesterday) console.log('[markers] gates: best ' + (best || 'none') + ' m, yesterday ' + (yesterday || 'none') + ' m');`, `    var t = this.progress ? this.progress.getTargets() : { best: 0, yesterday: 0 };
    // A challenge's target gets its own gate; the player's own gates give way when they'd crowd it.
    var challenge = this.entity.script.challenge;
    var friend = challenge && challenge.active ? challenge.active.distance : 0;
    var clear = function (d) { return !friend || Math.abs(d - friend) >= Markers.MIN_GAP; };
    var best = t.best >= Markers.MIN_RECORD && clear(t.best) ? t.best : 0;
    var yesterday = t.yesterday >= Markers.MIN_RECORD && Math.abs(t.yesterday - t.best) >= Markers.MIN_GAP && clear(t.yesterday) ? t.yesterday : 0;
    this._arm(this.gates[0], best);
    this._arm(this.gates[1], yesterday);
    this._arm(this.gates[2], friend);
    if (best || yesterday || friend) {
        console.log('[markers] gates: best ' + (best || 'none') + ' m, yesterday ' + (yesterday || 'none') + ' m, friend ' + (friend || 'none') + ' m');
    }`],
[`// Record gates (R11): a glowing arch over the road at the player's best distance, and one at
// yesterday's best, each with a floating label.`, `// Record gates (R11): a glowing arch over the road at the player's best distance, one at
// yesterday's best and, on a challenge, one at the friend's distance, each with a floating label.`]
]);

patch('testPilot.js', [
[`TestPilot.attributes.add('dodgeLead',`, `TestPilot.attributes.add('challenge', { type: 'string', default: '', title: 'Challenge Code', description: 'Play this challenge link code (the part after ?c=); empty for a normal run' });
TestPilot.attributes.add('dodgeLead',`],
[`        this.game.start();
        console.log('[pilot] run started,`, `        var challenge = this.gameEntity.script.challenge;
        if (this.challenge && challenge) challenge.enter(this.challenge);
        this.game.start();
        console.log('[pilot] run started,`],
[`    count('record:passed', 'gatesPassed', function (kind) { return 'ran through the ' + kind + ' gate'; });`,
 `    count('record:passed', 'gatesPassed', function (kind) { return 'ran through the ' + kind + ' gate'; });
    count('challenge:beaten', 'challengesBeaten', function () { return 'beat the challenge'; });`],
[`stumbles: 0, tricks: 0, closeCalls: 0, zones: 0, gatesPassed: 0,`, `stumbles: 0, tricks: 0, closeCalls: 0, zones: 0, gatesPassed: 0, challengesBeaten: 0,`]
]);
console.log('patched');
