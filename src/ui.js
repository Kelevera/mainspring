/* MAINSPRING — UI: canvas renderer, DOM screens, input, persistence.
   Browser-only. Depends on data.js, engine.js, audio.js globals. */
'use strict';

const UI = (() => {
  const D = MSDATA, E = Engine;
  const SQ3 = Math.sqrt(3);
  let st = null;               /* current run state (engine) */
  let meta = null;             /* persistent meta */
  let DEMO = false, ITCH_URL = 'https://itch.io', unlockHashes = []; /* set via init opts */
  let canvas, ctx2, W = 0, H = 0, DPR = 1;
  let hoverKey = null, carrying = null; /* carrying = {uid, id} */
  let mouse = { x: 0, y: 0 };
  let anim = null;             /* running shift animation */
  let gearAngles = {};         /* key -> visual angle */
  let floaters = [], sparks = [];
  let shake = 0, lastT = 0;
  let spinCache = null, forecastCache = null, dirty = true;
  let coachStep = 0;

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  /* ================= persistence ================= */
  function loadMeta() {
    try { meta = JSON.parse(localStorage.getItem('mainspring_meta')) || {}; } catch (e) { meta = {}; }
    meta.discovered = meta.discovered || ['drive', 'brass', 'copper'];
    meta.settings = Object.assign({ master: 0.8, sfx: 0.8, music: 0.45, musicOn: true, reduceMotion: false, seenHow: false }, meta.settings || {});
    meta.daily = meta.daily || {};
    meta.stats = Object.assign({ runs: 0, wins: 0, bestContract: 0, endlessBest: 0, coach: 0 }, meta.stats || {});
    meta.unlocked = !!meta.unlocked;
  }
  function saveMeta() { try { localStorage.setItem('mainspring_meta', JSON.stringify(meta)); } catch (e) {} }
  function saveRun() { try { if (st && st.phase !== 'over') localStorage.setItem('mainspring_run', E.toJSON(st)); else localStorage.removeItem('mainspring_run'); } catch (e) {} }
  function loadRun() { try { return E.fromJSON(localStorage.getItem('mainspring_run')); } catch (e) { return null; } }
  function discover(id) { if (!meta.discovered.includes(id)) { meta.discovered.push(id); saveMeta(); } }
  function isDemo() { return DEMO && !meta.unlocked; }

  /* ================= boot / layout ================= */
  function init(opts) {
    DEMO = !!(opts && opts.demo); ITCH_URL = (opts && opts.itchUrl) || ITCH_URL;
    unlockHashes = (opts && opts.unlockHashes) || [];
    loadMeta();
    buildDom();
    canvas = $('board'); ctx2 = canvas.getContext('2d');
    addEvents();
    applySettingsToAudio();
    showScreen('title');
    refreshTitle();
    requestAnimationFrame(frame);
  }

  function buildDom() {
    $('app').innerHTML = `
      ${isDemo() ? '<div class="demobadge">DEMO</div>' : ''}
      <div id="hud">
        <div class="logo serif">⚙ MAINSPRING</div>
        <div class="pill">Contract <b id="h-contract">1</b><span class="dim" id="h-of">/8</span></div>
        <div id="quotabarwrap"><div id="quotabar"></div><div id="quotatxt"></div></div>
        <div id="bossbanner"></div>
        <div class="pill">🪙 <b id="h-gold">0</b></div>
        <div class="pill">Ticks <b id="h-ticks">10</b></div>
        <button class="ghost iconbtn" id="btn-how" title="How to play (H)">?</button>
        <button class="ghost iconbtn" id="btn-settings" title="Settings">⚙</button>
        <button class="ghost iconbtn" id="btn-menu" title="Menu">☰</button>
      </div>
      <div id="boardwrap">
        <canvas id="board"></canvas>
        <div id="forecast"></div>
        <div id="jamwarn">⚠ JAMMED TRAIN — meshed gears form a tight loop. Break it up or grease it.</div>
        <div id="payout"></div>
        <div id="coach" class="coach" style="display:none"></div>
      </div>
      <div id="dock">
        <div id="shoprow">
          <div id="shopoffers"></div>
          <div id="shopside">
            <button class="ghost" id="btn-reroll">Reroll 🪙2</button>
            <button class="big" id="btn-next">NEXT SHIFT ▸</button>
          </div>
        </div>
        <div id="trayrow">
          <div id="charmbar"></div>
          <div id="tray"></div>
          <div id="sellzone">SELL</div>
          <button class="big" id="runbtn">RUN SHIFT ⚙</button>
        </div>
      </div>
      <div id="tooltip"></div>
      ${screenHtml()}`;
  }

  function screenHtml() {
    return `
    <div class="screen" id="scr-title"><div class="panel">
      <div class="tag">a clockwork engine-building roguelike</div>
      <h1>⚙ MAINSPRING</h1>
      <p class="dim" id="title-sub">The Guild has contracts. You have gears. Meshed gears counter-rotate — close a tight loop and the whole train <span class="red">jams</span>.</p>
      <div class="row">
        <button class="big" id="btn-new">NEW RUN</button>
        <button class="big ghost" id="btn-continue" style="display:none">CONTINUE</button>
      </div>
      <div class="row">
        <button class="ghost" id="btn-daily">📅 DAILY GEARWORK</button>
        <button class="ghost" id="btn-howto2">HOW TO PLAY</button>
        <button class="ghost" id="btn-comp">COMPENDIUM</button>
        <button class="ghost" id="btn-set2">SETTINGS</button>
      </div>
      <p class="small dim" id="title-stats"></p>
      <p class="small dim" id="title-tip"></p>
    </div></div>

    <div class="screen" id="scr-how"><div class="panel">
      <h2>How to run a Gearworks</h2>
      <div class="howgrid">
        <h3>1 · Build the train</h3>
        <p>Drag gears from the tray onto the hex board. Power flows from the central <b>Mainspring Drive</b> — a gear only spins if it is meshed (adjacent) to the Drive through other gears.</p>
        <h3>2 · Mind your loops</h3>
        <p>Meshed gears must counter-rotate: <span class="gold">clockwise ↻</span> gears turn their neighbors <span class="gold">counter-clockwise ↺</span>. Three gears in a tight triangle can't agree — the whole train <span class="red">JAMS</span> and produces nothing. Straight lines and wide curves are safe; a <b>Greased Bushing</b> can break any loop.</p>
        <h3>3 · Direction matters</h3>
        <p>Some gears pay more clockwise, some counter-clockwise. Every second gear in a chain flips direction — position is everything. The forecast above the board always shows exactly what your machine will produce.</p>
        <h3>4 · Meet the quota</h3>
        <p>Each contract demands energy ⚡ in a fixed number of ticks. Clear it, get paid 🪙, buy better gears, expand the chassis. Fail, and the Guild shows you the door. Contracts 3 and 6 carry nasty conditions. Contract 8 is the <b>Grand Commission</b>.</p>
        <p class="dim"><span class="kbd">Drag</span> place · <span class="kbd">Right-click</span> uninstall · <span class="kbd">Drag to red zone</span> sell · <span class="kbd">Space</span> run · <span class="kbd">M</span> mute</p>
      </div>
      <div class="row"><button class="big" id="btn-how-ok">TO THE WORKSHOP</button></div>
    </div></div>

    <div class="screen" id="scr-settings"><div class="panel">
      <h2>Settings</h2>
      <div class="setrow"><span>Master volume</span><input type="range" id="set-master" min="0" max="100"></div>
      <div class="setrow"><span>Sound effects</span><input type="range" id="set-sfx" min="0" max="100"></div>
      <div class="setrow"><span>Music</span><input type="range" id="set-music" min="0" max="100"></div>
      <div class="setrow"><span>Music on</span><input type="checkbox" id="set-musicon"></div>
      <div class="setrow"><span>Reduce motion</span><input type="checkbox" id="set-motion"></div>
      <div class="setrow" id="unlockrow" style="display:none"><span>Unlock code</span><span><input type="text" id="set-code" placeholder="MS-XXXX-0000"><button class="ghost" id="btn-code">APPLY</button></span></div>
      <div class="setrow"><span>Reset all progress</span><button class="danger" id="btn-wipe">RESET</button></div>
      <div class="row"><button id="btn-set-ok">DONE</button></div>
    </div></div>

    <div class="screen" id="scr-comp"><div class="panel">
      <h2>Compendium</h2>
      <p class="dim small" id="comp-count"></p>
      <div id="compgrid"></div>
      <div class="row"><button id="btn-comp-ok">CLOSE</button></div>
    </div></div>

    <div class="screen" id="scr-over"><div class="panel">
      <div class="tag" id="over-tag">contract failed</div>
      <h2 id="over-title" class="red">The Guild is not amused.</h2>
      <p id="over-sub"></p>
      <div class="statgrid" id="over-stats"></div>
      <div class="row">
        <button class="big" id="btn-again">NEW RUN</button>
        <button class="ghost" id="btn-over-menu">MENU</button>
        <button class="ghost" id="btn-share" style="display:none">COPY DAILY RESULT</button>
      </div>
    </div></div>

    <div class="screen" id="scr-won"><div class="panel">
      <div class="tag">contract 8 — grand commission</div>
      <h2 class="gold">The Commission is complete.</h2>
      <p>The Guild engraves your name on the workshop wall. The machine hums on.</p>
      <div class="statgrid" id="won-stats"></div>
      <div class="row">
        <button class="big" id="btn-endless">CONTINUE — ENDLESS ▸</button>
        <button class="ghost" id="btn-won-menu">RETIRE TO MENU</button>
      </div>
    </div></div>

    <div class="screen" id="scr-demo"><div class="panel">
      <div class="tag">demo complete</div>
      <h2 class="gold">The Guild offers a full commission.</h2>
      <p>You cleared the demo's three contracts. The full game has <b>8 contracts + endless mode</b>, all <b>27 gears and 8 charms</b>, boss conditions, and the <b>Daily Gearwork</b> seeded challenge.</p>
      <div class="row"><button class="big" id="btn-buy">GET THE FULL GAME</button><button class="ghost" id="btn-demo-menu">MENU</button></div>
    </div></div>

    <div class="screen" id="scr-overtime"><div class="panel">
      <h2 class="gold">Overtime Permit</h2>
      <p>The shift fell short — but the permit lets you re-run it once. Rearrange the machine first.</p>
      <div class="row"><button class="big" id="btn-ot-yes">WORK OVERTIME</button><button class="ghost danger" id="btn-ot-no">ACCEPT DEFEAT</button></div>
    </div></div>`;
  }

  /* ================= screens ================= */
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
    if (name) { const el = $('scr-' + name); if (el) el.classList.add('on'); }
  }
  function refreshTitle() {
    const run = loadRun();
    $('btn-continue').style.display = run ? '' : 'none';
    const s = meta.stats;
    $('title-stats').textContent = s.runs ? `Runs: ${s.runs} · Commissions won: ${s.wins} · Best contract: ${s.bestContract}${s.endlessBest ? ' · Endless best: ' + s.endlessBest : ''}` : '';
    const today = dailyKey();
    $('title-tip').textContent = meta.daily[today] ? `Daily done — cleared contract ${meta.daily[today].contract}, peak ${meta.daily[today].peak}⚡` : '';
    if (isDemo()) $('btn-daily').disabled = true;
  }
  function dailyKey() { const d = new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }

  function newRun(mode) {
    const seed = mode === 'daily' ? 'MS-daily-' + dailyKey() : 'MS-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    st = E.newRun(seed, mode || 'standard', isDemo());
    meta.stats.runs++; saveMeta(); saveRun();
    gearAngles = {}; floaters = []; sparks = []; anim = null; dirty = true;
    showScreen(null);
    if (!meta.settings.seenHow) { showScreen('how'); meta.settings.seenHow = true; saveMeta(); }
    coachStep = meta.stats.coach >= 3 ? 99 : 0;
    syncAll();
  }

  /* ================= HUD & dock sync ================= */
  function syncAll() {
    if (!st) return;
    $('h-contract').textContent = st.contract;
    $('h-of').textContent = st.endless || st.contract > D.FINAL_CONTRACT ? ' · endless' : '/' + D.FINAL_CONTRACT;
    $('h-gold').textContent = st.gold;
    $('h-ticks').textContent = E.ticksFor(st);
    const bm = E.bossMod(st);
    const bb = $('bossbanner');
    if (bm) { bb.style.display = ''; bb.innerHTML = '☠ ' + esc(D.BOSS_MODS[bm].name) + ' — ' + esc(D.BOSS_MODS[bm].text); }
    else bb.style.display = 'none';
    $('runbtn').style.display = st.phase === 'build' ? '' : 'none';
    $('shoprow').style.display = st.phase === 'shop' ? 'flex' : 'none';
    if (st.phase === 'shop') syncShop();
    syncTray(); syncCharms(); syncQuota(); recompute();
    coach();
    saveRun();
  }
  function syncQuota() {
    const q = E.quota(st);
    const e = anim ? Math.floor(anim.energyShown) : 0;
    $('quotabar').style.width = Math.min(100, 100 * e / q) + '%';
    $('quotatxt').textContent = e + ' / ' + q + ' ⚡';
  }
  function syncTray() {
    const tray = $('tray');
    tray.innerHTML = st.tray.length ? '' : '<span class="hint">Bought gears land here — drag them onto the board.</span>';
    for (const g of st.tray) {
      const chip = document.createElement('div');
      chip.className = 'chip'; chip.dataset.uid = g.uid;
      const cv = document.createElement('canvas');
      drawGearIcon(cv, g.id, 54);
      chip.appendChild(cv);
      chip.addEventListener('mousedown', ev => { if (canEdit()) { startCarry(g.uid, g.id); ev.preventDefault(); } });
      chip.addEventListener('mouseenter', () => tipGear(chip, g.id));
      chip.addEventListener('mouseleave', hideTip);
      tray.appendChild(chip);
    }
  }
  const CHARM_ICONS = { oilcan: '🛢', ledger: '📒', unioncard: '🎫', springwinder: '🔑', overtimepermit: '📜', insurance: '🏦', luckycoin: '🍀', foreman: '📯' };
  function syncCharms() {
    const bar = $('charmbar'); bar.innerHTML = '';
    for (const id of st.charms) {
      const d = document.createElement('div');
      d.className = 'charm'; d.textContent = CHARM_ICONS[id] || '★';
      d.addEventListener('mouseenter', () => tip(d, `<div class="tt-name gold">${esc(D.CHARMS[id].name)}</div><div>${esc(D.CHARMS[id].text)}</div>`));
      d.addEventListener('mouseleave', hideTip);
      bar.appendChild(d);
    }
  }
  function syncShop() {
    const wrap = $('shopoffers'); wrap.innerHTML = '';
    st.shop.offers.forEach((o, i) => {
      if (o.kind === 'gear' || o.kind === 'charm') discover(o.id);
      const div = document.createElement('div');
      const rar = o.kind === 'gear' ? D.GEARS[o.id].rarity : 'rare';
      div.className = `offer k-${o.kind} r-${rar}` + (o.sold ? ' sold' : '');
      let icon = '';
      if (o.kind === 'gear') icon = `<canvas data-gear="${o.id}"></canvas>`;
      else if (o.kind === 'charm') icon = `<div style="font-size:34px;line-height:44px">${CHARM_ICONS[o.id] || '★'}</div>`;
      else icon = `<div style="font-size:34px;line-height:44px">⬡</div>`;
      const nm = o.kind === 'gear' ? D.GEARS[o.id].name : o.kind === 'charm' ? D.CHARMS[o.id].name : 'Chassis Expansion';
      div.innerHTML = `${icon}<div class="nm">${esc(nm)}</div><div class="cost">🪙 ${o.cost}</div>`;
      const cv = div.querySelector('canvas');
      if (cv) drawGearIcon(cv, o.id, 46);
      div.addEventListener('click', () => {
        if (E.buy(st, i)) { AudioSys.sfx('buy'); dirty = true; syncAll(); }
        else AudioSys.sfx('denied');
      });
      div.addEventListener('mouseenter', () => {
        if (o.kind === 'gear') tipGear(div, o.id);
        else if (o.kind === 'charm') tip(div, `<div class="tt-name gold">${esc(D.CHARMS[o.id].name)}</div><div>${esc(D.CHARMS[o.id].text)}</div><div class="tt-sub">Charm — passive. Max ${D.ECON.maxCharms}.</div>`);
        else tip(div, `<div class="tt-name gold">Chassis Expansion</div><div>Grow the board to radius ${st.boardR + 1} (${E.boardCells(st.boardR + 1).length} cells). More room, more trains.</div>`);
      });
      div.addEventListener('mouseleave', hideTip);
      wrap.appendChild(div);
    });
    $('btn-reroll').textContent = 'Reroll 🪙' + st.shop.rerollCost;
  }

  /* ================= tooltip ================= */
  function tip(el, html) {
    const t = $('tooltip');
    t.innerHTML = html; t.style.display = 'block';
    const r = el.getBoundingClientRect();
    let x = r.left + r.width / 2 - 130, y = r.top - t.offsetHeight - 10;
    x = Math.max(8, Math.min(window.innerWidth - t.offsetWidth - 8, x));
    if (y < 8) y = r.bottom + 10;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function tipAt(x, y, html) {
    const t = $('tooltip');
    t.innerHTML = html; t.style.display = 'block';
    let tx = x + 18, ty = y - t.offsetHeight - 8;
    tx = Math.max(8, Math.min(window.innerWidth - t.offsetWidth - 8, tx));
    if (ty < 8) ty = y + 22;
    t.style.left = tx + 'px'; t.style.top = ty + 'px';
  }
  function tipGear(el, id) { tip(el, gearTipHtml(id)); }
  function gearTipHtml(id, extra) {
    const g = D.GEARS[id], rc = D.RARITY[g.rarity];
    return `<div class="tt-name" style="color:${rc.col}">${esc(g.name)}</div>
      <div class="tt-rar" style="color:${rc.col}">${rc.name}${g.wild ? ' · loose mesh' : ''}</div>
      <div style="margin-top:4px">${esc(g.text)}</div>` +
      (extra || '') +
      (g.fixed ? '' : `<div class="tt-sub">Sell for 🪙${Math.max(1, Math.floor(g.cost * D.ECON.sellRatio))} · right-click to uninstall</div>`);
  }
  function hideTip() { $('tooltip').style.display = 'none'; }

  /* ================= board math ================= */
  function cellSize() { return Math.min(46, Math.min(W / (SQ3 * (2 * st.boardR + 2.6)), H / (1.5 * (2 * st.boardR) + 3.4))); }
  function cellXY(k) {
    const [q, r] = E.parseK(k), S = cellSize();
    return { x: W / 2 + S * SQ3 * (q + r / 2), y: H / 2 + S * 1.5 * r, S };
  }
  function pickCell(mx, my) {
    if (!st) return null;
    const S = cellSize();
    for (const k of E.boardCells(st.boardR)) {
      const p = cellXY(k);
      if ((mx - p.x) ** 2 + (my - p.y) ** 2 < (S * 0.86) ** 2) return k;
    }
    return null;
  }
  function canEdit() { return st && (st.phase === 'build' || st.phase === 'shop') && !anim; }

  /* ================= forecast / spin cache ================= */
  function recompute() {
    if (!st) return;
    spinCache = E.computeSpin(st);
    const sim = E.simulateShift(st);
    forecastCache = sim.energy;
    const q = E.quota(st);
    const f = $('forecast');
    const okC = sim.energy >= q;
    f.innerHTML = `Forecast: <b class="${okC ? 'green' : 'gold'}">${sim.energy}⚡</b> <span class="dim">/ ${q} needed</span>` + (sim.goldEarned ? ` <span class="gold">+${sim.goldEarned}🪙</span>` : '');
    f.style.display = (st.phase === 'build' || st.phase === 'shop') ? '' : 'none';
    $('jamwarn').style.display = spinCache.jammed.size ? '' : 'none';
    dirty = false;
  }

  /* ================= carry / place ================= */
  function startCarry(uid, id) { carrying = { uid, id }; AudioSys.sfx('pick'); $('sellzone').classList.add('active'); hideTip(); }
  function endCarry(mx, my, target) {
    if (target === 'sell') {
      const refund = E.sellGear(st, carrying.uid);
      if (refund) AudioSys.sfx('sell');
    } else if (target) {
      if (E.placeGear(st, carrying.uid, target)) AudioSys.sfx('place');
      else AudioSys.sfx('denied');
    }
    carrying = null; $('sellzone').classList.remove('active');
    dirty = true; syncAll();
  }

  /* ================= shift animation ================= */
  function runShift() {
    if (!canEdit() || st.phase !== 'build') return;
    const res = E.runShift(st);
    if (res.err === 'maxGears') {
      AudioSys.sfx('denied');
      flashBanner(`☠ Union Inspection: at most ${res.limit} gears. Uninstall some.`);
      return;
    }
    saveRun();
    AudioSys.sfx('whoosh');
    const spin = E.computeSpin(st);
    if (spin.jammed.size) { AudioSys.sfx('jam'); shake = meta.settings.reduceMotion ? 0 : 14; }
    anim = {
      res, log: res.sim.log, ti: 0, tickDur: meta.settings.reduceMotion ? 0.22 : 0.55,
      clock: 0, energyShown: res.sim.startEnergy, energyTarget: res.sim.startEnergy, done: false,
    };
    $('runbtn').style.display = 'none';
    $('forecast').style.display = 'none';
  }
  function stepAnim(dt) {
    if (!anim) return;
    anim.clock += dt;
    while (anim.ti < anim.log.length && anim.clock >= anim.tickDur) {
      anim.clock -= anim.tickDur;
      const entry = anim.log[anim.ti++];
      AudioSys.sfx('tick', anim.ti);
      for (const it of entry.items) {
        const p = cellXY(it.k);
        if (it.e) floaters.push({ x: p.x, y: p.y - p.S * 0.7, txt: '+' + it.e, col: '#ffe08a', age: 0 });
        if (it.g) floaters.push({ x: p.x + 14, y: p.y - p.S * 0.4, txt: '+' + it.g + '🪙', col: '#8fd18a', age: 0 });
        if (it.e >= 8 && !meta.settings.reduceMotion) spawnSparks(p.x, p.y, Math.min(10, it.e / 3));
        if (it.g) AudioSys.sfx('coin');
      }
      anim.energyTarget = entry.energy; /* log energy is cumulative incl. start bonus */
    }
    anim.energyShown += (anim.energyTarget - anim.energyShown) * Math.min(1, dt * 8);
    syncQuota();
    if (anim.ti >= anim.log.length && !anim.done && Math.abs(anim.energyShown - anim.energyTarget) < 0.6) {
      anim.done = true; anim.energyShown = anim.energyTarget;
      setTimeout(finishShift, 350);
    }
  }
  function finishShift() {
    const res = anim.res; anim = null;
    const q = res.quota, e = res.sim.energy;
    const po = $('payout');
    meta.stats.bestContract = Math.max(meta.stats.bestContract, st.done);
    if (st.endless) meta.stats.endlessBest = Math.max(meta.stats.endlessBest, st.done - D.FINAL_CONTRACT);
    if (st.mode === 'daily') {
      const k = dailyKey(), rec = meta.daily[k] || { contract: 0, peak: 0 };
      meta.daily[k] = { contract: Math.max(rec.contract, st.done), peak: Math.max(rec.peak, e) };
    }
    saveMeta();
    if (res.success) {
      AudioSys.sfx('win');
      po.className = ''; po.style.display = 'block';
      po.innerHTML = `<h2 class="gold">CONTRACT CLEARED</h2>
        <p>${e}⚡ / ${q} needed</p>
        <p class="small dim">Pay ${res.payout.base}🪙 · Interest +${res.payout.interest}🪙</p>`;
      setTimeout(() => {
        po.style.display = 'none';
        if (st.phase === 'won') showWon();
        else if (isDemo() && st.done >= D.DEMO_LAST_CONTRACT) showScreen('demo');
        else { AudioSys.sfx('coin'); syncAll(); }
      }, 1500);
    } else {
      AudioSys.sfx('lose');
      po.className = 'fail'; po.style.display = 'block';
      po.innerHTML = `<h2 class="red">SHIFT FELL SHORT</h2><p>${e}⚡ / ${q} needed</p>`;
      setTimeout(() => {
        po.style.display = 'none';
        if (st.phase === 'overtime') showScreen('overtime');
        else showGameOver();
      }, 1600);
    }
    syncAll();
  }
  function flashBanner(msg) {
    const w = $('jamwarn'); w.textContent = msg; w.style.display = '';
    setTimeout(() => { dirty = true; recompute(); w.textContent = '⚠ JAMMED TRAIN — meshed gears form a tight loop. Break it up or grease it.'; }, 2600);
  }

  function showGameOver() {
    localStorage.removeItem('mainspring_run');
    const s = st.stats;
    $('over-sub').innerHTML = `Contract ${st.contract} demanded ${E.quota(st)}⚡ — the machine delivered ${st.lastShift.energy}⚡.`;
    $('over-stats').innerHTML =
      `<span>Contracts cleared <b>${st.done}</b></span><span>Peak shift <b>${s.peakShift}⚡</b></span>
       <span>Total energy <b>${s.totalEnergy}⚡</b></span><span>Gold earned <b>${s.goldEarned}🪙</b></span>
       <span>Gears bought <b>${s.gearsBought}</b></span><span>Jams caused <b>${s.jamsHit}</b></span>`;
    $('btn-share').style.display = st.mode === 'daily' ? '' : 'none';
    showScreen('over');
  }
  function showWon() {
    meta.stats.wins++; saveMeta();
    const s = st.stats;
    $('won-stats').innerHTML =
      `<span>Peak shift <b>${s.peakShift}⚡</b></span><span>Total energy <b>${s.totalEnergy}⚡</b></span>
       <span>Gold earned <b>${s.goldEarned}🪙</b></span><span>Jams caused <b>${s.jamsHit}</b></span>`;
    showScreen('won');
  }

  /* ================= coach marks ================= */
  function coach() {
    const c = $('coach');
    if (!st || coachStep > 2 || st.contract > 1 || anim) { c.style.display = 'none'; return; }
    const msgs = [
      '⚙ Drag a gear from the tray onto a cell next to the golden Drive.',
      '↻↺ Watch the arrows — every meshed gear flips direction. Avoid tight triangles: they JAM.',
      'When the forecast beats the quota, hit RUN SHIFT.',
    ];
    const placed = Object.keys(st.gears).length - 1;
    let step = placed === 0 ? 0 : (placed === 1 ? 1 : 2);
    if (step < coachStep) step = coachStep;
    coachStep = step;
    c.textContent = msgs[step];
    c.style.display = 'block';
    c.style.left = '30px'; c.style.bottom = '18px'; c.style.top = 'auto';
    if (step === 2 && placed >= 2) { meta.stats.coach = 3; saveMeta(); }
  }

  /* ================= canvas rendering ================= */
  function resize() {
    const r = $('boardwrap').getBoundingClientRect();
    DPR = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.max(1, W * DPR); canvas.height = Math.max(1, H * DPR);
    ctx2.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
    if (st && !document.querySelector('.screen.on')) {
      if (dirty) recompute();
      if (anim) stepAnim(dt);
      draw(dt);
    }
    requestAnimationFrame(frame);
  }
  function hexPath(x, y, S) {
    ctx2.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i + Math.PI / 6;
      const px = x + S * Math.cos(a), py = y + S * Math.sin(a);
      i ? ctx2.lineTo(px, py) : ctx2.moveTo(px, py);
    }
    ctx2.closePath();
  }
  function draw(dt) {
    const rw = $('boardwrap').getBoundingClientRect();
    if (Math.abs(rw.width - W) > 1 || Math.abs(rw.height - H) > 1) resize();
    ctx2.clearRect(0, 0, W, H);
    let ox = 0, oy = 0;
    if (shake > 0) { shake = Math.max(0, shake - dt * 40); ox = (Math.random() - 0.5) * shake; oy = (Math.random() - 0.5) * shake; }
    ctx2.save(); ctx2.translate(ox, oy);
    const S = cellSize();
    /* cells */
    for (const k of E.boardCells(st.boardR)) {
      const p = cellXY(k);
      hexPath(p.x, p.y, S * 0.96);
      const hov = k === hoverKey && canEdit();
      const validDrop = carrying && !st.gears[k];
      ctx2.fillStyle = hov ? (validDrop ? 'rgba(233,195,74,0.14)' : 'rgba(233,195,74,0.07)') : 'rgba(255,255,255,0.025)';
      ctx2.fill();
      ctx2.strokeStyle = hov ? '#e9c34a' : 'rgba(160,135,80,0.28)';
      ctx2.lineWidth = hov ? 1.6 : 1;
      ctx2.stroke();
    }
    /* advance visual angles */
    const speed = anim ? 2.4 : 0.5;
    for (const k of Object.keys(st.gears)) {
      const dir = spinCache ? (spinCache.dir[k] || 0) : 0;
      const spins = spinCache && spinCache.spinning.has(k);
      if (gearAngles[k] === undefined) gearAngles[k] = 0;
      if (spins && !meta.settings.reduceMotion) gearAngles[k] += (dir === 0 ? 0.6 : dir) * speed * dt;
    }
    /* gears */
    for (const k of Object.keys(st.gears).sort()) {
      const p = cellXY(k);
      drawGear(ctx2, p.x, p.y, S * 0.88, st.gears[k].id, gearAngles[k] || 0, gearState(k));
    }
    /* floaters */
    ctx2.textAlign = 'center'; ctx2.font = 'bold 15px Georgia, serif';
    floaters = floaters.filter(f => (f.age += dt) < 1.1);
    for (const f of floaters) {
      ctx2.globalAlpha = Math.max(0, 1 - f.age / 1.1);
      ctx2.fillStyle = f.col;
      ctx2.fillText(f.txt, f.x, f.y - f.age * 34);
    }
    ctx2.globalAlpha = 1;
    /* sparks */
    sparks = sparks.filter(sp => (sp.age += dt) < 0.6);
    for (const sp of sparks) {
      sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy += 220 * dt;
      ctx2.globalAlpha = 1 - sp.age / 0.6;
      ctx2.fillStyle = '#ffd166';
      ctx2.fillRect(sp.x, sp.y, 2.4, 2.4);
    }
    ctx2.globalAlpha = 1;
    /* carried gear ghost */
    if (carrying) drawGear(ctx2, mouse.x, mouse.y, S * 0.8, carrying.id, 0, { ghost: true });
    ctx2.restore();
  }
  function gearState(k) {
    if (!spinCache) return {};
    return {
      jammed: spinCache.jammed.has(k),
      idle: !spinCache.connected.has(k),
      dir: spinCache.dir[k] || 0,
      spinning: spinCache.spinning.has(k),
      drive: st.gears[k].id === 'drive',
    };
  }
  function spawnSparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 90;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, age: 0 });
    }
  }

  /* metal palettes per rarity */
  const METALS = {
    common: ['#d8b45a', '#8a6d24', '#5c4715'],
    rare: ['#b9cdd8', '#6d8b9b', '#3d5560'],
    epic: ['#ffd08a', '#c98a2e', '#7a4d12'],
  };
  function idHash(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return Math.abs(h); }

  function drawGear(g, x, y, R, id, angle, stt) {
    stt = stt || {};
    const def = D.GEARS[id];
    const pal = METALS[def.rarity] || METALS.common;
    const teeth = 10 + (idHash(id) % 3) * 2;
    const rOut = R * 0.92, rBody = R * 0.74, rHub = R * 0.26;
    g.save();
    g.translate(x, y);
    if (stt.jammed) g.translate((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6);
    if (stt.ghost) g.globalAlpha = 0.55;
    if (stt.idle) g.globalAlpha = 0.45;
    g.rotate(angle);
    /* teeth */
    g.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2, aw = Math.PI / teeth;
      const t1 = a0 - aw * 0.42, t2 = a0 - aw * 0.18, t3 = a0 + aw * 0.18, t4 = a0 + aw * 0.42;
      g.lineTo(Math.cos(t1) * rBody, Math.sin(t1) * rBody);
      g.lineTo(Math.cos(t2) * rOut, Math.sin(t2) * rOut);
      g.lineTo(Math.cos(t3) * rOut, Math.sin(t3) * rOut);
      g.lineTo(Math.cos(t4) * rBody, Math.sin(t4) * rBody);
    }
    g.closePath();
    const grad = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
    grad.addColorStop(0, pal[0]); grad.addColorStop(0.7, pal[1]); grad.addColorStop(1, pal[2]);
    g.fillStyle = grad; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1; g.stroke();
    /* body ring */
    g.beginPath(); g.arc(0, 0, rBody * 0.98, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1.2; g.stroke();
    /* spokes */
    const spokes = 3 + (idHash(id) % 3);
    g.strokeStyle = 'rgba(40,28,10,0.55)'; g.lineWidth = R * 0.1;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      g.beginPath(); g.moveTo(Math.cos(a) * rHub, Math.sin(a) * rHub);
      g.lineTo(Math.cos(a) * rBody * 0.82, Math.sin(a) * rBody * 0.82); g.stroke();
    }
    /* hub */
    g.beginPath(); g.arc(0, 0, rHub, 0, Math.PI * 2);
    g.fillStyle = stt.drive ? '#e9c34a' : pal[1]; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke();
    g.rotate(-angle);
    /* wild = greased sheen */
    if (def.wild) { g.beginPath(); g.arc(0, 0, rBody * 0.6, 0, Math.PI * 2); g.strokeStyle = 'rgba(180,240,255,0.5)'; g.setLineDash([4, 5]); g.lineWidth = 2; g.stroke(); g.setLineDash([]); }
    /* monogram */
    g.fillStyle = stt.drive ? '#1d1710' : 'rgba(255,244,214,0.92)';
    g.font = `bold ${Math.round(R * 0.34)}px Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(stt.drive ? '⌂' : def.name[0], 0, 1);
    /* status ring / direction arrow */
    if (!stt.ghost) {
      if (stt.jammed) {
        g.strokeStyle = '#ff5a40'; g.lineWidth = 3; g.beginPath();
        g.arc(0, 0, rOut + 2.5, 0, Math.PI * 2); g.stroke();
        g.font = `bold ${Math.round(R * 0.6)}px sans-serif`; g.fillStyle = '#ff5a40';
        g.fillText('✕', 0, 1);
      } else if (stt.spinning) {
        drawDirArrow(g, rOut + 4, stt.dir);
      } else if (stt.idle) {
        g.font = `${Math.round(R * 0.42)}px sans-serif`; g.fillStyle = 'rgba(200,190,160,0.8)';
        g.fillText('⏾', rOut * 0.62, -rOut * 0.62);
      }
    }
    g.restore();
  }
  function drawDirArrow(g, r, dir) {
    if (dir === 0) { /* free spinner: dashed circle */
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(150,220,255,0.6)'; g.lineWidth = 1.6; g.setLineDash([3, 6]); g.stroke(); g.setLineDash([]);
      return;
    }
    const col = dir === 1 ? 'rgba(255,214,102,0.95)' : 'rgba(122,199,255,0.95)';
    const a0 = -Math.PI / 2, a1 = a0 + (dir === 1 ? 1 : -1) * Math.PI * 0.5;
    g.beginPath(); g.arc(0, 0, r, Math.min(a0, a1), Math.max(a0, a1));
    g.strokeStyle = col; g.lineWidth = 2.2; g.stroke();
    const ax = Math.cos(a1) * r, ay = Math.sin(a1) * r;
    const tang = a1 + (dir === 1 ? Math.PI / 2 : -Math.PI / 2);
    g.beginPath();
    g.moveTo(ax + Math.cos(tang) * 7, ay + Math.sin(tang) * 7);
    g.lineTo(ax + Math.cos(tang + 2.6) * 6, ay + Math.sin(tang + 2.6) * 6);
    g.lineTo(ax + Math.cos(tang - 2.6) * 6, ay + Math.sin(tang - 2.6) * 6);
    g.closePath(); g.fillStyle = col; g.fill();
  }
  function drawGearIcon(cv, id, size) {
    cv.width = size; cv.height = size;
    const g = cv.getContext('2d');
    drawGear(g, size / 2, size / 2, size * 0.46, id, 0.3, {});
  }

  /* ================= events ================= */
  function addEvents() {
    window.addEventListener('resize', resize);
    canvas.addEventListener('mousemove', ev => {
      const r = canvas.getBoundingClientRect();
      mouse.x = ev.clientX - r.left; mouse.y = ev.clientY - r.top;
      const k = pickCell(mouse.x, mouse.y);
      if (k !== hoverKey) hoverKey = k;
      if (!carrying && k && st && st.gears[k]) {
        const stt = gearState(k);
        const extra = stt.jammed ? '<div class="tt-sub red">JAMMED — part of an odd loop.</div>' : (stt.idle ? '<div class="tt-sub">Idle — not connected to the Drive.</div>' : '');
        tipAt(ev.clientX, ev.clientY, gearTipHtml(st.gears[k].id, extra));
      } else if (!carrying) hideTip();
    });
    canvas.addEventListener('mouseleave', () => { hoverKey = null; hideTip(); });
    canvas.addEventListener('mousedown', ev => {
      if (ev.button !== 0 || !canEdit()) return;
      const k = pickCell(mouse.x, mouse.y);
      if (k && st.gears[k] && st.gears[k].id !== 'drive') {
        const gg = st.gears[k];
        E.unplaceGear(st, gg.uid); /* to tray, then carry */
        startCarry(gg.uid, gg.id);
        dirty = true; syncAll();
      }
    });
    window.addEventListener('mouseup', ev => {
      if (!carrying) return;
      const r = canvas.getBoundingClientRect();
      const inCanvas = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      const sz = $('sellzone').getBoundingClientRect();
      const inSell = ev.clientX >= sz.left && ev.clientX <= sz.right && ev.clientY >= sz.top && ev.clientY <= sz.bottom;
      endCarry(mouse.x, mouse.y, inSell ? 'sell' : (inCanvas ? pickCell(ev.clientX - r.left, ev.clientY - r.top) : null));
    });
    canvas.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      if (!canEdit()) return;
      const k = pickCell(mouse.x, mouse.y);
      if (k && st.gears[k] && st.gears[k].id !== 'drive') {
        E.unplaceGear(st, st.gears[k].uid);
        AudioSys.sfx('pick'); dirty = true; syncAll();
      }
    });
    window.addEventListener('mousemove', ev => {
      if (!carrying) return;
      const r = canvas.getBoundingClientRect();
      mouse.x = ev.clientX - r.left; mouse.y = ev.clientY - r.top;
      hoverKey = pickCell(mouse.x, mouse.y);
      const sz = $('sellzone');
      if (sz.classList.contains('active')) {
        const b = sz.getBoundingClientRect();
        const over = ev.clientX >= b.left && ev.clientX <= b.right && ev.clientY >= b.top && ev.clientY <= b.bottom;
        const f = D.GEARS[carrying.id];
        sz.textContent = over ? `SELL +${Math.max(1, Math.floor(f.cost * D.ECON.sellRatio))}🪙` : 'SELL';
      }
    });

    $('runbtn').addEventListener('click', () => { AudioSys.ensure(); runShift(); });
    $('btn-next').addEventListener('click', () => { AudioSys.sfx('click'); E.nextContract(st); dirty = true; syncAll(); });
    $('btn-reroll').addEventListener('click', () => { if (E.reroll(st)) { AudioSys.sfx('click'); syncAll(); } else AudioSys.sfx('denied'); });

    $('btn-new').addEventListener('click', () => { AudioSys.ensure(); AudioSys.sfx('click'); newRun('standard'); });
    $('btn-continue').addEventListener('click', () => {
      AudioSys.ensure();
      const run = loadRun();
      if (run) {
        st = run; gearAngles = {}; anim = null; dirty = true; coachStep = 99;
        showScreen(st.phase === 'overtime' ? 'overtime' : null);
        syncAll();
      }
    });
    $('btn-daily').addEventListener('click', () => { AudioSys.ensure(); AudioSys.sfx('click'); newRun('daily'); });
    $('btn-howto2').addEventListener('click', () => showScreen('how'));
    $('btn-how').addEventListener('click', () => showScreen('how'));
    $('btn-how-ok').addEventListener('click', () => { AudioSys.sfx('click'); showScreen(st ? null : 'title'); if (st) syncAll(); });
    $('btn-comp').addEventListener('click', () => { fillCompendium(); showScreen('comp'); });
    $('btn-comp-ok').addEventListener('click', () => showScreen('title'));
    $('btn-settings').addEventListener('click', openSettings);
    $('btn-set2').addEventListener('click', openSettings);
    $('btn-set-ok').addEventListener('click', () => { AudioSys.sfx('click'); showScreen(st && st.phase !== 'over' ? null : 'title'); if (st) syncAll(); });
    $('btn-menu').addEventListener('click', () => { showScreen('title'); refreshTitle(); });
    $('btn-again').addEventListener('click', () => newRun(st.mode === 'daily' ? 'daily' : 'standard'));
    $('btn-over-menu').addEventListener('click', () => { showScreen('title'); refreshTitle(); });
    $('btn-endless').addEventListener('click', () => { AudioSys.sfx('coin'); E.enterEndless(st); showScreen(null); syncAll(); });
    $('btn-won-menu').addEventListener('click', () => { localStorage.removeItem('mainspring_run'); showScreen('title'); refreshTitle(); });
    $('btn-ot-yes').addEventListener('click', () => { AudioSys.sfx('click'); E.useOvertime(st); showScreen(null); syncAll(); });
    $('btn-ot-no').addEventListener('click', () => { E.declineOvertime(st); showGameOver(); });
    $('btn-buy').addEventListener('click', () => { window.open(ITCH_URL, '_blank'); });
    $('btn-demo-menu').addEventListener('click', () => { localStorage.removeItem('mainspring_run'); showScreen('title'); refreshTitle(); });
    $('btn-share').addEventListener('click', () => {
      const k = dailyKey(), rec = meta.daily[k] || { contract: 0, peak: 0 };
      const txt = `⚙ MAINSPRING Daily ${k} — cleared contract ${rec.contract}, peak shift ${rec.peak}⚡  Play: ${ITCH_URL}`;
      if (navigator.clipboard) navigator.clipboard.writeText(txt);
      $('btn-share').textContent = 'COPIED!';
      setTimeout(() => { $('btn-share').textContent = 'COPY DAILY RESULT'; }, 1400);
    });
    $('btn-wipe').addEventListener('click', () => {
      if (confirm('Erase ALL progress, stats and settings?')) {
        localStorage.removeItem('mainspring_meta'); localStorage.removeItem('mainspring_run');
        location.reload();
      }
    });
    $('btn-code').addEventListener('click', tryUnlock);

    window.addEventListener('keydown', ev => {
      if (ev.key === ' ' && st && !document.querySelector('.screen.on')) {
        ev.preventDefault();
        if (st.phase === 'build') runShift();
        else if (st.phase === 'shop') { E.nextContract(st); syncAll(); }
      }
      if (ev.key === 'Escape') {
        const on = document.querySelector('.screen.on');
        if (on && st && ['scr-how', 'scr-settings', 'scr-comp'].includes(on.id)) { showScreen(null); syncAll(); }
      }
      if (ev.key === 'm' || ev.key === 'M') { meta.settings.musicOn = !meta.settings.musicOn; AudioSys.setMusic(meta.settings.musicOn); saveMeta(); }
      if (ev.key === 'h' || ev.key === 'H') showScreen('how');
    });
  }

  /* ================= settings / compendium / unlock ================= */
  function applySettingsToAudio() {
    AudioSys.setVol('master', meta.settings.master);
    AudioSys.setVol('sfx', meta.settings.sfx);
    AudioSys.setVol('music', meta.settings.music);
    AudioSys.setMusic(meta.settings.musicOn);
  }
  function openSettings() {
    $('set-master').value = meta.settings.master * 100;
    $('set-sfx').value = meta.settings.sfx * 100;
    $('set-music').value = meta.settings.music * 100;
    $('set-musicon').checked = meta.settings.musicOn;
    $('set-motion').checked = meta.settings.reduceMotion;
    $('unlockrow').style.display = isDemo() ? '' : 'none';
    showScreen('settings');
    const bind = (id, key, isCheck) => {
      $(id).oninput = () => {
        meta.settings[key] = isCheck ? $(id).checked : $(id).value / 100;
        applySettingsToAudio(); saveMeta();
      };
    };
    bind('set-master', 'master'); bind('set-sfx', 'sfx'); bind('set-music', 'music');
    bind('set-musicon', 'musicOn', true); bind('set-motion', 'reduceMotion', true);
  }
  /* djb2 — matches codes generated by build.py (see LAUNCH_KIT.md) */
  function djb2(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) + s.charCodeAt(i)) >>> 0; return h; }
  function tryUnlock() {
    const code = ($('set-code').value || '').trim().toUpperCase();
    if (unlockHashes.includes(djb2(code)) && code.length > 5) {
      meta.unlocked = true; saveMeta();
      alert('Unlocked! The full Gearworks is yours. The page will reload.');
      location.reload();
    } else { AudioSys.sfx('denied'); $('set-code').value = ''; $('set-code').placeholder = 'Invalid code'; }
  }
  function fillCompendium() {
    const grid = $('compgrid'); grid.innerHTML = '';
    const all = Object.keys(D.GEARS);
    let found = 0;
    for (const id of all) {
      const has = meta.discovered.includes(id);
      if (has) found++;
      const cell = document.createElement('div');
      cell.className = 'compcell' + (has ? '' : ' locked');
      const cv = document.createElement('canvas');
      drawGearIcon(cv, id, 44);
      cell.appendChild(cv);
      const nm = document.createElement('div');
      nm.textContent = has ? D.GEARS[id].name : '???';
      cell.appendChild(nm);
      if (has) {
        cell.addEventListener('mouseenter', () => tipGear(cell, id));
        cell.addEventListener('mouseleave', hideTip);
      }
      grid.appendChild(cell);
    }
    $('comp-count').textContent = `Discovered ${found} / ${all.length} gears` + (isDemo() ? ' (demo shows a limited set)' : '');
  }

  return { init };
})();
