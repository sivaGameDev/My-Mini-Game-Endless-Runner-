// The loading screen: what someone sees for the second or two before the first run. It is the only
// screen that has to work before any of the game's own assets exist, so everything here is plain DOM
// and CSS with a system font - no engine features, no Playpen Sans, nothing to wait for.
//
// It does one job beyond covering the wait: it teaches the controls, so a new player arrives at the
// home screen already knowing how to move.
pc.script.createLoadingScreen(function (app) {
    var BG = '#0d0218';
    var TIPS = [
        'Arrows, A and D, or a swipe: change lane',
        'Up, W, Space or a swipe up: jump',
        'Down, S or a swipe down: slide under the bars',
        'Clip something once and you stumble. Twice in a row ends the run',
        'Your best distance stands on the road as a gate. Run through it',
        'Close calls are worth the most points. Pass things closely'
    ];

    var css = [
        '#nr-load { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center;',
        '  justify-content: center; background: ' + BG + ';',
        '  font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;',
        '  color: #cfc6e6; transition: opacity 0.45s ease; }',
        '#nr-load.is-done { opacity: 0; pointer-events: none; }',
        // Two neon verges fanning up from a vanishing point: the game's road, hinted at in CSS.
        // Deliberately faint - this sits behind the title and must not compete with it.
        '#nr-load .nr-road { position: absolute; inset: 0; overflow: hidden; }',
        '#nr-load .nr-road i { position: absolute; top: 40%; left: 50%; width: 7vmax; height: 90vmax;',
        '  background: linear-gradient(to bottom, rgba(255, 61, 242, 0) 6%, rgba(255, 61, 242, 0.36) 78%);',
        '  transform-origin: 50% 0; }',
        '#nr-load .nr-road i:first-child { transform: translateX(-50%) rotate(-31deg); }',
        '#nr-load .nr-road i:last-child { transform: translateX(-50%) rotate(31deg); }',
        // A pool of dark behind the card so the text stays clean over the glow.
        '#nr-load .nr-vignette { position: absolute; inset: 0;',
        '  background: radial-gradient(60% 45% at 50% 46%, rgba(13, 2, 24, 0.92) 38%, rgba(13, 2, 24, 0) 100%); }',
        '#nr-load .nr-card { position: relative; width: 320px; max-width: calc(100vw - 48px); text-align: center; }',
        '#nr-load h1 { margin: 0 0 4px; font-size: 34px; letter-spacing: 0.14em; color: #ff3df2;',
        '  text-shadow: 0 0 22px rgba(255, 61, 242, 0.75); }',
        '#nr-load .nr-sub { margin: 0 0 26px; font-size: 12px; letter-spacing: 0.3em; color: #6f6590; }',
        '#nr-load .nr-track { height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.1); overflow: hidden; }',
        '#nr-load .nr-fill { display: block; height: 100%; width: 0%; border-radius: 3px;',
        '  background: linear-gradient(90deg, #ff3df2, #35f4ff); box-shadow: 0 0 14px rgba(53, 244, 255, 0.7);',
        '  transition: width 0.25s ease; }',
        '#nr-load .nr-pct { margin: 10px 0 0; font-size: 12px; letter-spacing: 0.18em; color: #9d93b8;',
        '  font-variant-numeric: tabular-nums; }',
        '#nr-load .nr-tip { margin: 34px 0 0; font-size: 13px; line-height: 1.6; color: #8a7fa6; min-height: 42px; }',
        '#nr-load .nr-tip b { display: block; margin-bottom: 5px; font-size: 10px; letter-spacing: 0.22em;',
        '  color: #35f4ff; }',
        '@media (max-height: 420px) { #nr-load h1 { font-size: 26px; } #nr-load .nr-tip { margin-top: 20px; } }'
    ].join('\n');

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var screen = document.createElement('div');
    screen.id = 'nr-load';
    screen.innerHTML = '<div class="nr-road"><i></i><i></i></div><div class="nr-vignette"></div>' +
        '<div class="nr-card">' +
        '<h1>NEON RUNNER</h1>' +
        '<p class="nr-sub">LOADING</p>' +
        '<div class="nr-track"><span class="nr-fill"></span></div>' +
        '<p class="nr-pct">0%</p>' +
        '<p class="nr-tip"><b>WHILE YOU WAIT</b><span></span></p>' +
        '</div>';
    document.body.appendChild(screen);

    var fill = screen.querySelector('.nr-fill');
    var pct = screen.querySelector('.nr-pct');
    var tip = screen.querySelector('.nr-tip span');
    tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

    // The bar only ever moves forward: a reported progress that dips would read as a stall.
    var shown = 0;
    var show = function (value) {
        var next = Math.max(shown, Math.min(1, value || 0));
        if (next === shown) return;
        shown = next;
        fill.style.width = (shown * 100).toFixed(0) + '%';
        pct.textContent = (shown * 100).toFixed(0) + '%';
    };

    app.on('preload:progress', show);
    app.on('preload:end', function () { show(1); });
    app.on('start', function () {
        show(1);
        screen.classList.add('is-done');
        setTimeout(function () {
            if (screen.parentNode) screen.parentNode.removeChild(screen);
            if (style.parentNode) style.parentNode.removeChild(style);
        }, 500);
    });
});
