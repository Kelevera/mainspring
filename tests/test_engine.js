/* MAINSPRING engine tests + balance simulation. Run: node tests/test_engine.js */
'use strict';
const E = require('../src/engine.js');
const D = require('../src/data.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL: ' + name); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

/* ---------- hex & board ---------- */
eq(E.boardCells(1).length, 7, 'radius-1 board has 7 cells');
eq(E.boardCells(2).length, 19, 'radius-2 board has 19 cells');
eq(E.boardCells(3).length, 37, 'radius-3 board has 37 cells');
eq(E.neighborKeys('0,0', 1).length, 6, 'center has 6 neighbors');
ok(E.isEdge(1, 0, 1), '1,0 is rim on r1');
ok(!E.isEdge(1, 0, 2), '1,0 not rim on r2');

/* helper to build a state with gears at keys */
function mk(places, R) {
  const st = E.newRun('test', 'standard', false);
  st.boardR = R || 2;
  st.tray = [];
  for (const [key, id] of places) st.gears[key] = { id, uid: st.uid++ };
  return st;
}

/* ---------- spin solver ---------- */
{ /* straight line alternates */
  const st = mk([['1,0', 'brass'], ['2,0', 'brass']]);
  const s = E.computeSpin(st);
  eq(s.dir['0,0'], 1, 'drive spins CW');
  eq(s.dir['1,0'], -1, 'line neighbor counter-rotates');
  eq(s.dir['2,0'], 1, 'next in line rotates CW again');
  eq(s.jammed.size, 0, 'line does not jam');
  eq(s.spinning.size, 3, 'all three spin');
}
{ /* triangle jams the whole train */
  const st = mk([['1,0', 'brass'], ['0,1', 'brass']]); /* 1,0 and 0,1 are adjacent (diff -1,1) */
  const s = E.computeSpin(st);
  eq(s.jammed.size, 3, 'triangle jams all three gears incl. drive');
  eq(s.spinning.size, 0, 'nothing spins when the drive train jams');
}
{ /* 120-degree bend is safe */
  const st = mk([['1,0', 'brass'], ['1,1', 'brass']]); /* 1,1 adj to 1,0 (diff 0,1), NOT adj to 0,0 */
  const s = E.computeSpin(st);
  eq(s.jammed.size, 0, '120-degree bend does not jam');
  eq(s.dir['1,1'], 1, 'bend end alternates back to CW');
}
{ /* wild bushing breaks the triangle */
  const st = mk([['1,0', 'brass'], ['0,1', 'bushing']]);
  const s = E.computeSpin(st);
  eq(s.jammed.size, 0, 'bushing prevents jam');
  eq(s.dir['0,1'], 0, 'bushing spins free (dir 0)');
  ok(s.spinning.has('0,1'), 'bushing spins');
  eq(s.dir['1,0'], -1, 'solid neighbor still alternates vs drive');
}
{ /* full ring around drive jams */
  const st = mk(E.DIRS.map(([q, r]) => [E.K(q, r), 'brass']));
  const s = E.computeSpin(st);
  eq(s.spinning.size, 0, 'full ring around drive jams everything');
}
{ /* disconnected gear does not spin */
  const st = mk([['2,0', 'brass']]);
  const s = E.computeSpin(st);
  ok(!s.spinning.has('2,0'), 'disconnected gear idle');
  eq(s.spinning.size, 1, 'only drive spins');
}
{ /* wild chain propagates spin */
  const st = mk([['1,0', 'bushing'], ['2,0', 'bushing'], ['3,0', 'brass']], 3);
  const s = E.computeSpin(st);
  ok(s.spinning.has('3,0'), 'gear behind two bushings spins');
}

/* ---------- simulation ---------- */
{ /* drive(+1) + brass(+2) over 10 ticks = 30 */
  const st = mk([['1,0', 'brass']]);
  const sim = E.simulateShift(st);
  eq(sim.energy, 30, 'drive+brass = 30 energy over 10 ticks');
  eq(sim.ticks, 10, 'base 10 ticks');
}
{ /* copper direction bonus: at 1,0 it spins CCW -> +1; at 2,0 CW -> +3 */
  const a = E.simulateShift(mk([['1,0', 'copper']]));
  eq(a.energy, 10 + 10, 'copper CCW gives +1/tick');
  const b = E.simulateShift(mk([['1,0', 'brass'], ['2,0', 'copper']]));
  eq(b.energy, 10 + 20 + 30, 'copper CW gives +3/tick');
}
{ /* governor buffs neighbors; amp multiplies */
  const g = E.simulateShift(mk([['1,0', 'brass'], ['1,1', 'governor']]));
  /* brass 2+2=4/t, drive 1 (not adjacent to governor at 1,1? drive 0,0 vs 1,1 not adjacent) */
  eq(g.energy, 10 + 40, 'governor +2 to adjacent brass');
  const m = E.simulateShift(mk([['1,0', 'brass'], ['1,1', 'amp']]));
  eq(m.energy, 10 + 30, 'amp x1.5 on brass (floor 3/t)');
}
{ /* jammed board produces zero */
  const st = mk([['1,0', 'brass'], ['0,1', 'brass']]);
  const sim = E.simulateShift(st);
  eq(sim.energy, 0, 'jammed train produces 0');
  ok(sim.jammedCount === 3, 'jam reported');
}
{ /* determinism: same state -> same result */
  const st = mk([['1,0', 'crowd'], ['1,1', 'flywheel'], ['2,0', 'escapement']], 2);
  const a = E.simulateShift(st), b = E.simulateShift(st);
  eq(a.energy, b.energy, 'simulation is deterministic');
}

/* ---------- economy & flow ---------- */
{
  const st = E.newRun('flow', 'standard', false);
  eq(st.gold, D.ECON.startGold, 'start gold');
  eq(st.tray.length, 3, 'start tray 3 gears');
  eq(E.quota(st), 25, 'contract 1 quota 25');
  /* place starting gears in a line */
  E.placeGear(st, st.tray[0].uid, '1,0');
  E.placeGear(st, st.tray[0].uid, '1,1');   /* tray shrinks */
  E.placeGear(st, st.tray[0].uid, '0,-1');  /* NOT adjacent to 1,0? 0,-1 vs 1,0 diff (1,1)-> not a dir? diff = 1-0, 0-(-1) = (1,1) not adjacent. ok */
  const res = E.runShift(st);
  ok(res.success, 'starter line beats contract 1 (' + res.sim.energy + '/25)');
  eq(st.phase, 'shop', 'phase moves to shop');
  ok(st.shop.offers.length >= 5, 'shop has offers');
  ok(st.gold > D.ECON.startGold, 'paid out');
}
{ /* save roundtrip */
  const st = E.newRun('rt', 'daily', false);
  E.placeGear(st, st.tray[0].uid, '1,0');
  const j = E.toJSON(st);
  const st2 = E.fromJSON(j);
  eq(E.toJSON(st2), j, 'save roundtrip identical');
  const sim1 = E.simulateShift(st), sim2 = E.simulateShift(st2);
  eq(sim1.energy, sim2.energy, 'sim equal after roundtrip');
}
{ /* seeded shop determinism (daily fairness) */
  const a = E.newRun('2026-07-02', 'daily', false); E.genShop(a);
  const b = E.newRun('2026-07-02', 'daily', false); E.genShop(b);
  eq(a.shop.offers.map(o => o.id), b.shop.offers.map(o => o.id), 'same seed -> same shop');
}
{ /* demo pool excludes epics */
  const st = E.newRun('demo', 'standard', true);
  for (let i = 0; i < 40; i++) {
    E.genShop(st);
    for (const o of st.shop.offers) if (o.kind === 'gear') ok(D.DEMO_GEARS.includes(o.id), 'demo shop only demo gears: ' + o.id);
  }
}
{ /* boss mods deterministic per seed+contract */
  const st = E.newRun('boss', 'standard', false);
  st.contract = 3;
  const m1 = E.bossMod(st), m2 = E.bossMod(st);
  eq(m1, m2, 'boss mod stable');
  ok(Object.keys(D.BOSS_MODS).includes(m1), 'boss mod valid');
  st.contract = 4;
  eq(E.bossMod(st), null, 'no boss mod on contract 4');
}

/* ---------- balance simulation (greedy bot) ---------- */
function botValue(st, id) {
  /* crude per-tick value estimate for shopping */
  const v = { brass: 2, copper: 2.6, tin: 2.6, crowd: 2.2, hermit: 2.6, rim: 3.2, escapement: 2.6, flywheel: 2.5, pendulum: 2, mint: 1.6, governor: 3.4, amp: 4.2, ratchet: 4, counterratchet: 4, bushing: 1.2, gilded: 1.5, echo: 3, whistle: 2.2, twin: 3.4, clockspring: st.done * 0.9, boiler: 4.5, grandgov: 4, prime: 7.5, perpetuum: 5.5, midas: 2.4, astrolabe: 5, carillon: 4.5, overdrive: 6 };
  return (v[id] || 2) / Math.max(1, E.gearPrice(st, id));
}
function botPlaceAll(st) {
  /* place every tray gear at the cell that maximizes simulated energy */
  let guard = 0;
  while (st.tray.length && guard++ < 40) {
    const g = st.tray[0];
    const free = E.boardCells(st.boardR).filter(k => !st.gears[k]);
    let best = null, bestE = -1;
    const baseE = E.simulateShift(st).energy;
    for (const k of free) {
      st.gears[k] = g;
      const e = E.simulateShift(st).energy;
      delete st.gears[k];
      if (e > bestE) { bestE = e; best = k; }
    }
    if (best && bestE > baseE) { E.placeGear(st, g.uid, best); }
    else break; /* placing helps nothing (e.g., would jam everywhere) */
  }
}
function botShop(st) {
  let guard = 0;
  while (guard++ < 20) {
    if (!st.shop) break;
    const offers = st.shop.offers;
    /* expansion when board pressure */
    const freeCells = E.boardCells(st.boardR).length - Object.keys(st.gears).length;
    const exp = offers.findIndex(o => o.kind === 'expand' && !o.sold && st.gold >= o.cost);
    if (exp >= 0 && (freeCells < 8 || st.contract >= 3)) { E.buy(st, exp); continue; }
    /* charm if comfortably affordable */
    const ch = offers.findIndex(o => o.kind === 'charm' && !o.sold && st.gold >= o.cost + 6);
    if (ch >= 0) { E.buy(st, ch); continue; }
    /* best-value gear */
    let bi = -1, bv = 0.25; /* value floor: don't buy junk */
    offers.forEach((o, i) => {
      if (o.kind !== 'gear' || o.sold || st.gold < o.cost) return;
      const v = botValue(st, o.id);
      if (v > bv) { bv = v; bi = i; }
    });
    if (bi >= 0) { E.buy(st, bi); continue; }
    break;
  }
}
function botRun(seed, maxContract) {
  const st = E.newRun('bot' + seed, 'standard', false);
  for (let safety = 0; safety < 60; safety++) {
    if (st.phase === 'build') {
      botPlaceAll(st);
      const res = E.runShift(st);
      if (res.err) { /* too many gears for inspection: pull one off */
        const uids = Object.values(st.gears).filter(g => g.id !== 'drive').map(g => g.uid);
        if (uids.length) E.unplaceGear(st, uids[uids.length - 1]);
        continue;
      }
    } else if (st.phase === 'shop') { botShop(st); E.nextContract(st); botPlaceAll(st); }
    else if (st.phase === 'overtime') { E.useOvertime(st); }
    else if (st.phase === 'won') return { reached: 9, won: true };
    else if (st.phase === 'over') return { reached: st.contract, won: false };
    if (maxContract && st.contract > maxContract) return { reached: st.contract, won: false };
  }
  return { reached: st.contract, won: false };
}

const N = 80;
const reach = {};
let wins = 0;
for (let i = 0; i < N; i++) {
  const r = botRun(i);
  if (r.won) wins++;
  reach[r.won ? 'WIN' : r.reached] = (reach[r.won ? 'WIN' : r.reached] || 0) + 1;
}
console.log('\n--- balance: greedy bot over ' + N + ' seeds ---');
console.log('failed at contract:', Object.keys(reach).sort((a, b) => (a === 'WIN') - (b === 'WIN') || a - b).map(k => k + ':' + reach[k]).join('  '));
console.log('win rate: ' + Math.round(100 * wins / N) + '%');
const c1fails = (reach[1] || 0) + (reach[2] || 0);
ok(c1fails <= N * 0.05, 'contracts 1-2 nearly always clearable (fails: ' + c1fails + ')');
ok(wins / N >= 0.10 && wins / N <= 0.70, 'win rate in target band 10-70% for a simple bot (got ' + Math.round(100 * wins / N) + '%)');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
