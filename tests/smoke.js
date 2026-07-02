/* Headless end-to-end smoke test of the built game (dist/index.html).
   Boots the page in jsdom with a canvas stub, starts a run, runs a shift
   with the bare drive (fails quota), and expects the game-over screen.
   Run: node tests/smoke.js [path-to-index.html] */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const file = process.argv[2] || path.join(__dirname, '..', 'dist', 'index.html');
const html = fs.readFileSync(file, 'utf8');

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://mainspring.test/',
  pretendToBeVisual: true,
  beforeParse(window) {
    /* canvas 2D stub: absorbs everything the renderer calls */
    const gradient = { addColorStop() {} };
    const ctxStub = new Proxy({}, {
      get(t, prop) {
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient;
        if (prop === 'canvas') return { width: 300, height: 150 };
        return () => {};
      },
      set() { return true; },
    });
    window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
    window.addEventListener('error', e => errors.push('window error: ' + e.message));
  },
});
const { window } = dom;
const doc = window.document;
const $ = id => doc.getElementById(id);

function click(id) {
  const el = $(id);
  if (!el) throw new Error('missing element #' + id);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  try {
    await sleep(300); /* onload fired, UI.init ran */
    if (!$('scr-title') || !$('scr-title').classList.contains('on')) throw new Error('title screen not shown');
    console.log('boot OK — title screen visible');

    click('btn-new');
    await sleep(200);
    /* first run shows how-to once */
    if ($('scr-how').classList.contains('on')) { click('btn-how-ok'); await sleep(100); }
    if (doc.querySelector('.screen.on')) throw new Error('a screen still covers the board after new run');
    if ($('h-contract').textContent !== '1') throw new Error('contract HUD wrong: ' + $('h-contract').textContent);
    console.log('new run OK — contract 1, gold ' + $('h-gold').textContent);

    /* forecast should show drive-only output (10) vs quota 25 */
    await sleep(300);
    const fc = $('forecast').textContent;
    if (!/10/.test(fc)) throw new Error('unexpected forecast: ' + fc);
    console.log('forecast OK — "' + fc.trim() + '"');

    /* run the shift with just the drive -> fails 10 < 25 -> game over screen */
    click('runbtn');
    let over = false;
    for (let i = 0; i < 140; i++) { /* anim ~5.5s + payout 1.6s */
      await sleep(100);
      if ($('scr-over').classList.contains('on')) { over = true; break; }
    }
    if (!over) throw new Error('game-over screen never appeared after failed shift');
    if (!/Contracts cleared/.test($('over-stats').textContent + $('over-stats').innerHTML)) throw new Error('stats missing on game over');
    console.log('shift + fail flow OK — game over screen with stats');

    /* new run from game over, then settings + compendium open/close */
    click('btn-again');
    await sleep(200);
    click('btn-menu'); await sleep(50);
    click('btn-comp'); await sleep(50);
    if (!$('scr-comp').classList.contains('on')) throw new Error('compendium did not open');
    if (!/Discovered/.test($('comp-count').textContent)) throw new Error('compendium count missing');
    click('btn-comp-ok'); await sleep(50);
    click('btn-set2'); await sleep(50);
    if (!$('scr-settings').classList.contains('on')) throw new Error('settings did not open');
    console.log('menus OK — compendium & settings open/close');

    if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
    console.log('\nSMOKE PASS (' + path.basename(path.dirname(file)) + ')');
    process.exit(0);
  } catch (e) {
    console.error('\nSMOKE FAIL: ' + e.message);
    if (errors.length) console.error('page errors: ' + errors.join(' | '));
    process.exit(1);
  }
})();
