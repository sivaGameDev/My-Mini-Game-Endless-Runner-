// One-off patch: small fixes to levels/achievements, sounds, and the bot's test data.
const fs = require('fs');
const dir = __dirname + '/../scripts/';
const patch = (file, pairs) => {
    let a = fs.readFileSync(dir + file, 'utf8');
    pairs.forEach(([from, to, all]) => {
        if (!a.includes(from)) throw new Error(file + ' missing: ' + from.slice(0, 80));
        a = all ? a.split(from).join(to) : a.replace(from, to);
    });
    fs.writeFileSync(dir + file, a);
};

patch('levels.js', [
    ['Levels.prototype._bar = function (note) {', '// The level bar; note(info, percent) gives the text beside it.\nLevels.prototype.bar = function (note) {'],
    ['return this._bar(function', 'return this.bar(function', true],
    ['var bar = this._bar(function', 'var bar = this.bar(function']
]);

patch('achievements.js', [
    ['this.levels._bar(function', 'this.levels.bar(function'],
    [`    this._checkAll(); // anything already earned (records and counts from before trophies existed)
    this._renderButton();
    this.on('destroy', this._onDestroy, this);
};`, `    this._renderButton();
    this.on('destroy', this._onDestroy, this);
};

// After the first reset has set up today's profile: anything already earned (records and counts from
// before trophies existed) unlocks now.
Achievements.prototype.postInitialize = function () {
    this._checkAll();
    this._renderButton();
};`]
]);

patch('audioFx.js', [
    [`    on('shop:equip', function () { this.play('lane'); });`, `    on('shop:equip', function () { this.play('lane'); });
    on('level:up', function () { this.play('levelup'); });
    on('trophy:unlock', function (id, tier) { this.play('trophy', tier); });`],
    [`        case 'buy':`, `        case 'levelup':
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
        case 'buy':`]
]);

patch('testPilot.js', [
    [`['reward'], ['mission'], ['record'], ['buy']];`, `['reward'], ['mission'], ['record'], ['buy'], ['levelup'], ['trophy', 2]];`],
    [`            d.trails.owned.push('rainbow');
            d.trails.equipped = 'rainbow';
            progress.commit();`, `            d.trails.owned.push('rainbow');
            d.trails.equipped = 'rainbow';
            // Just short of level 5 (Plasma trail) and of two trophies (Pogo, Regular).
            if (typeof Levels !== 'undefined') {
                d.xp = Levels.totalFor(5) - 40;
                d.level = 4;
            }
            d.stats.jumps = 495;
            d.runs = 24;
            progress.commit();`],
    [`    return 'combo ' + combo + ' | ' + audio + ' | ' + zone + ' | ' + progress;`, `    var level = s.levels ? ('level ' + s.levels.getLevel().level + ' xp ' + s.progress.data.xp) : 'no levels script';
    var trophies = s.achievements ? ('trophies ' + s.achievements.count() + '/' + Achievements.LIST.length) : 'no achievements script';
    return 'combo ' + combo + ' | ' + audio + ' | ' + zone + ' | ' + progress + ' | ' + level + ' | ' + trophies;`]
]);
console.log('patched');
