/* MAINSPRING — core engine. Pure logic, no DOM. Node-compatible for tests.
   Depends on data.js globals (or require in Node). */
'use strict';

var MSDATA = (typeof module !== 'undefined' && module.exports) ? require('./data.js')
  : { RARITY, GEARS, CHARMS, BOSS_MODS, QUOTAS, BOSS_AT, FINAL_CONTRACT, ENDLESS_GROWTH, ECON, START_TRAY, rarityWeights, DEMO_GEARS, DEMO_CHARMS, DEMO_LAST_CONTRACT };

const Engine = (() => {
  const D = MSDATA;

  /* ---------- RNG (deterministic, seedable) ---------- */
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* advance state's rng; returns float [0,1) */
  function rand(st) {
    st.rngN = (st.rngN + 1) | 0;
    return mulberry32(st.rngSeed + st.rngN * 7919)();
  }
  function randInt(st, n) { return Math.floor(rand(st) * n); }
  function pick(st, arr) { return arr[randInt(st, arr.length)]; }

  /* ---------- Hex board (axial, pointy-top) ---------- */
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const K = (q, r) => q + ',' + r;
  const parseK = k => k.split(',').map(Number);
  function hexDist(q, r) { return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)); }
  function inBoard(q, r, R) { return hexDist(q, r) <= R; }
  function isEdge(q, r, R) { return hexDist(q, r) === R; }
  function boardCells(R) {
    const out = [];
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) if (inBoard(q, r, R)) out.push(K(q, r));
    return out;
  }
  function neighborKeys(k, R) {
    const [q, r] = parseK(k);
    const out = [];
    for (const [dq, dr] of DIRS) { const nq = q + dq, nr = r + dr; if (inBoard(nq, nr, R)) out.push(K(nq, nr)); }
    return out;
  }
  function sortedKeys(obj) { return Object.keys(obj).sort(); }

  /* ---------- Run state ---------- */
  function newRun(seedStr, mode, demo) {
    const st = {
      v: 1, seedStr, mode: mode || 'standard', demo: !!demo,
      rngSeed: hashStr(seedStr), rngN: 0,
      contract: 1, done: 0, gold: D.ECON.startGold, boardR: 1,
      gears: {}, tray: [], charms: [], uid: 1,
      shop: null, phase: 'build',
      overtimeUsed: false, endless: false,
      lastShift: null, canOvertime: false,
      stats: { totalEnergy: 0, peakShift: 0, gearsBought: 0, jamsHit: 0, rerolls: 0, goldEarned: 0, shifts: 0 },
    };
    st.gears[K(0, 0)] = { id: 'drive', uid: 0 };
    for (const id of D.START_TRAY) st.tray.push({ id, uid: st.uid++ });
    return st;
  }

  function quota(st) {
    const c = st.contract;
    if (c <= D.FINAL_CONTRACT) return D.QUOTAS[c - 1];
    const q = D.QUOTAS[D.FINAL_CONTRACT - 1] * Math.pow(D.ENDLESS_GROWTH, c - D.FINAL_CONTRACT);
    return Math.round(q / 5) * 5;
  }
  function isBoss(st) {
    return D.BOSS_AT.includes(st.contract) || (st.contract > D.FINAL_CONTRACT && st.contract % 3 === 0);
  }
  function bossMod(st) {
    if (!isBoss(st)) return null;
    const keys = Object.keys(D.BOSS_MODS).sort();
    const r = mulberry32(hashStr(st.seedStr + '#boss' + st.contract))();
    return keys[Math.floor(r * keys.length)];
  }
  function ticksFor(st) {
    let t = D.ECON.ticksBase;
    if (st.charms.includes('oilcan')) t += 1;
    const bm = bossMod(st);
    if (bm && D.BOSS_MODS[bm].tickPenalty) t -= D.BOSS_MODS[bm].tickPenalty;
    return t;
  }

  /* ---------- Spin solver ----------
     Meshed gears must counter-rotate. Wild gears ("bushing") mesh loosely:
     they impose no parity constraint and never jam.
     Returns { connected:Set, spinning:Set, jammed:Set, dir:{key:1|-1|0} } */
  function computeSpin(st) {
    const R = st.boardR, G = st.gears;
    const drive = K(0, 0);
    const connected = new Set();
    if (G[drive]) {
      const q = [drive]; connected.add(drive);
      while (q.length) {
        const k = q.shift();
        for (const nk of neighborKeys(k, R)) if (G[nk] && !connected.has(nk)) { connected.add(nk); q.push(nk); }
      }
    }
    const isWild = k => !!(D.GEARS[G[k].id].wild);
    const dir = {}, jammed = new Set();
    /* Parity components over connected non-wild gears (edges: both non-wild). */
    const seen = new Set();
    const solids = [...connected].filter(k => !isWild(k)).sort();
    for (const root0 of solids) {
      if (seen.has(root0)) continue;
      /* collect component */
      const comp = [];
      const q = [root0]; seen.add(root0);
      while (q.length) {
        const k = q.shift(); comp.push(k);
        for (const nk of neighborKeys(k, R)) {
          if (G[nk] && connected.has(nk) && !isWild(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
        }
      }
      /* anchor: drive if present, else smallest key */
      const anchor = comp.includes(drive) ? drive : comp.slice().sort()[0];
      dir[anchor] = 1;
      let ok = true;
      const bq = [anchor]; const col = { [anchor]: 1 };
      while (bq.length) {
        const k = bq.shift();
        for (const nk of neighborKeys(k, R)) {
          if (!G[nk] || !connected.has(nk) || isWild(nk)) continue;
          if (col[nk] === undefined) { col[nk] = -col[k]; dir[nk] = col[nk]; bq.push(nk); }
          else if (col[nk] === col[k]) ok = false;
        }
      }
      if (!ok) for (const k of comp) { jammed.add(k); dir[k] = 0; }
    }
    /* spinning: non-wild connected & not jammed; wilds spin (dir 0) if any
       neighbor spins — propagate through wild chains. */
    const spinning = new Set(solids.filter(k => !jammed.has(k)));
    let grew = true;
    while (grew) {
      grew = false;
      for (const k of connected) {
        if (!isWild(k) || spinning.has(k)) continue;
        if (neighborKeys(k, R).some(nk => spinning.has(nk))) { spinning.add(k); dir[k] = 0; grew = true; }
      }
    }
    return { connected, spinning, jammed, dir };
  }

  /* ---------- Shift simulation (fully deterministic) ---------- */
  function simulateShift(st) {
    const R = st.boardR, G = st.gears;
    const spin = computeSpin(st);
    const bmKey = bossMod(st);
    const bm = bmKey ? D.BOSS_MODS[bmKey] : {};
    const T = ticksFor(st);
    const keys = sortedKeys(G);
    const spinKeys = keys.filter(k => spin.spinning.has(k));
    const nbCache = {};
    for (const k of keys) nbCache[k] = neighborKeys(k, R).filter(nk => G[nk]);

    let energy = 0, goldEarned = 0;
    if (st.charms.includes('foreman')) energy += 5 * st.done;
    const startEnergy = energy;
    const log = [];
    const perGear = {};
    const globalBuff = spinKeys.reduce((s, k) => s + (D.GEARS[G[k].id].globalBuff || 0), 0);

    for (let tick = 1; tick <= T; tick++) {
      const dead = (bm.deadTicks && tick <= bm.deadTicks) || (bm.stickyEvery && tick % bm.stickyEvery === 0);
      const items = [];
      if (!dead) {
        const ctxFor = (k, extra) => {
          const [q, r] = parseK(k);
          return Object.assign({
            tick, ticks: T, dir: spin.dir[k] || 0,
            nbs: nbCache[k].map(nk => ({ key: nk, id: G[nk].id, def: D.GEARS[G[nk].id], spinning: spin.spinning.has(nk), dir: spin.dir[nk] || 0 })),
            emptyAdj: neighborKeys(k, R).length - nbCache[k].length,
            edge: isEdge(q, r, R), gold: st.gold, done: st.done,
            spinningCount: spinKeys.length, bestNbBase: 0,
          }, extra || {});
        };
        /* pass A: base output (non-echo) */
        const base = {};
        for (const k of spinKeys) {
          const def = D.GEARS[G[k].id];
          if (def.echo) continue;
          let b = def.calc(ctxFor(k));
          if (G[k].id === 'drive' && st.charms.includes('springwinder')) b += 2;
          base[k] = b;
        }
        /* pass B: echo gears copy best neighbor base */
        for (const k of spinKeys) {
          const def = D.GEARS[G[k].id];
          if (!def.echo) continue;
          const best = Math.max(0, ...nbCache[k].filter(nk => base[nk] !== undefined).map(nk => base[nk]));
          base[k] = def.calc(ctxFor(k, { bestNbBase: best }));
        }
        /* pass C: adjacency + global buffs */
        const val = {};
        for (const k of spinKeys) {
          let v = base[k] || 0;
          for (const nk of nbCache[k]) {
            const nd = D.GEARS[G[nk].id];
            if (nd.buff && spin.spinning.has(nk)) v += nd.buff;
          }
          v += globalBuff - (D.GEARS[G[k].id].globalBuff || 0);
          val[k] = Math.max(0, v);
        }
        /* pass D: multipliers */
        for (const k of spinKeys) {
          if (bm.noMult) break;
          let m = 1;
          for (const nk of nbCache[k]) {
            const nd = D.GEARS[G[nk].id];
            if (nd.mult && spin.spinning.has(nk)) m *= nd.mult;
          }
          if (m !== 1) val[k] = Math.floor(val[k] * m);
        }
        /* rim-dead boss mod */
        for (const k of spinKeys) {
          const [q, r] = parseK(k);
          if (bm.rimDead && isEdge(q, r, R)) val[k] = 0;
        }
        /* gold + collect */
        for (const k of spinKeys) {
          const def = D.GEARS[G[k].id];
          const g = def.gcalc ? def.gcalc(ctxFor(k)) : 0;
          const e = val[k] || 0;
          if (e > 0 || g > 0) {
            items.push({ k, e, g });
            energy += e; goldEarned += g;
            perGear[k] = (perGear[k] || 0) + e;
          }
        }
      }
      log.push({ t: tick, dead: !!dead, items, energy, gold: goldEarned });
    }
    return { energy, goldEarned, ticks: T, log, startEnergy, perGear, jammedCount: spin.jammed.size, bossMod: bmKey };
  }

  /* ---------- Shift resolution ---------- */
  function pay(st, surplus) {
    let p = D.ECON.basePay;
    if (st.charms.includes('ledger')) p += 3;
    p += Math.min(D.ECON.surplusCap, Math.floor(surplus / D.ECON.surplusDiv));
    const cap = st.charms.includes('insurance') ? D.ECON.interestCapInsured : D.ECON.interestCap;
    const interest = Math.min(cap, Math.floor(st.gold / D.ECON.interestDiv));
    return { base: p, interest, total: p + interest };
  }

  /* Runs the shift & applies the outcome. Returns a result object for the UI. */
  function runShift(st) {
    const bmKey = bossMod(st);
    if (bmKey && D.BOSS_MODS[bmKey].maxGears && Object.keys(st.gears).length > D.BOSS_MODS[bmKey].maxGears)
      return { err: 'maxGears', limit: D.BOSS_MODS[bmKey].maxGears };
    const sim = simulateShift(st);
    const q = quota(st);
    st.stats.shifts++;
    st.stats.totalEnergy += sim.energy;
    st.stats.peakShift = Math.max(st.stats.peakShift, sim.energy);
    if (sim.jammedCount > 0) st.stats.jamsHit++;
    st.gold += sim.goldEarned;
    st.stats.goldEarned += sim.goldEarned;
    const success = sim.energy >= q;
    let payout = null;
    if (success) {
      payout = pay(st, sim.energy - q);
      st.gold += payout.total;
      st.stats.goldEarned += payout.total;
      st.done++;
      st.lastShift = { energy: sim.energy, quota: q, success, payout, contract: st.contract, bossMod: sim.bossMod };
      if (st.contract === D.FINAL_CONTRACT && !st.endless) st.phase = 'won';
      else { st.contract++; st.phase = 'shop'; genShop(st); }
    } else {
      st.lastShift = { energy: sim.energy, quota: q, success, payout, contract: st.contract, bossMod: sim.bossMod };
      st.canOvertime = st.charms.includes('overtimepermit') && !st.overtimeUsed;
      st.phase = st.canOvertime ? 'overtime' : 'over';
    }
    return { sim, quota: q, success, payout };
  }
  function useOvertime(st) {
    if (st.phase !== 'overtime' || !st.canOvertime) return false;
    st.overtimeUsed = true; st.canOvertime = false; st.phase = 'build';
    return true;
  }
  function declineOvertime(st) { if (st.phase === 'overtime') st.phase = 'over'; }
  function enterEndless(st) {
    if (st.phase !== 'won') return false;
    st.endless = true; st.contract++; st.phase = 'shop'; genShop(st);
    return true;
  }
  function nextContract(st) { if (st.phase === 'shop') st.phase = 'build'; }

  /* ---------- Shop ---------- */
  function gearPool(st) {
    let ids = Object.keys(D.GEARS).filter(id => id !== 'drive');
    if (st.demo) ids = ids.filter(id => D.DEMO_GEARS.includes(id));
    return ids;
  }
  function charmPool(st) {
    let ids = Object.keys(D.CHARMS).filter(id => !st.charms.includes(id));
    if (st.demo) ids = ids.filter(id => D.DEMO_CHARMS.includes(id));
    return ids;
  }
  function gearPrice(st, id) {
    let c = D.GEARS[id].cost;
    if (st.charms.includes('unioncard')) c = Math.ceil(c * 0.8);
    return c;
  }
  function rollGearId(st) {
    const w = D.rarityWeights(st.contract);
    const r = rand(st);
    const rar = r < w.common ? 'common' : (r < w.common + w.rare ? 'rare' : 'epic');
    let pool = gearPool(st).filter(id => D.GEARS[id].rarity === rar);
    if (!pool.length) pool = gearPool(st);
    return pick(st, pool);
  }
  function genShop(st) {
    const offers = [];
    for (let i = 0; i < D.ECON.shopGears; i++) {
      const id = rollGearId(st);
      offers.push({ kind: 'gear', id, cost: gearPrice(st, id), sold: false });
    }
    const cp = charmPool(st);
    if (cp.length && st.charms.length < D.ECON.maxCharms) {
      const id = cp[randInt(st, cp.length)];
      offers.push({ kind: 'charm', id, cost: D.CHARMS[id].cost, sold: false });
    }
    if (st.boardR < 3)
      offers.push({ kind: 'expand', id: 'expand' + (st.boardR + 1), cost: D.ECON.expandCost[st.boardR + 1], sold: false });
    st.shop = { offers, rerollCost: st.charms.includes('luckycoin') ? 1 : D.ECON.rerollBase };
  }
  function reroll(st) {
    if (!st.shop || st.gold < st.shop.rerollCost) return false;
    st.gold -= st.shop.rerollCost;
    st.stats.rerolls++;
    const keep = st.shop.offers.filter(o => o.kind === 'expand');
    const offers = [];
    for (let i = 0; i < D.ECON.shopGears; i++) {
      const id = rollGearId(st);
      offers.push({ kind: 'gear', id, cost: gearPrice(st, id), sold: false });
    }
    const cp = charmPool(st);
    if (cp.length && st.charms.length < D.ECON.maxCharms) {
      const id = cp[randInt(st, cp.length)];
      offers.push({ kind: 'charm', id, cost: D.CHARMS[id].cost, sold: false });
    }
    st.shop = { offers: offers.concat(keep), rerollCost: st.charms.includes('luckycoin') ? 1 : st.shop.rerollCost + 1 };
    return true;
  }
  function buy(st, idx) {
    const o = st.shop && st.shop.offers[idx];
    if (!o || o.sold || st.gold < o.cost) return false;
    if (o.kind === 'charm' && st.charms.length >= D.ECON.maxCharms) return false;
    st.gold -= o.cost; o.sold = true;
    if (o.kind === 'gear') { st.tray.push({ id: o.id, uid: st.uid++ }); st.stats.gearsBought++; }
    else if (o.kind === 'charm') st.charms.push(o.id);
    else if (o.kind === 'expand') st.boardR++;
    return true;
  }

  /* ---------- Board editing (free during build & shop) ---------- */
  function findGear(st, uid) {
    for (const k of Object.keys(st.gears)) if (st.gears[k].uid === uid) return { where: 'board', key: k, g: st.gears[k] };
    const i = st.tray.findIndex(g => g.uid === uid);
    if (i >= 0) return { where: 'tray', idx: i, g: st.tray[i] };
    return null;
  }
  function placeGear(st, uid, key) {
    const f = findGear(st, uid);
    const [q, r] = parseK(key);
    if (!f || st.gears[key] || !inBoard(q, r, st.boardR)) return false;
    if (f.where === 'tray') { st.tray.splice(f.idx, 1); st.gears[key] = f.g; }
    else { if (f.g.id === 'drive') return false; delete st.gears[f.key]; st.gears[key] = f.g; }
    return true;
  }
  function unplaceGear(st, uid) {
    const f = findGear(st, uid);
    if (!f || f.where !== 'board' || f.g.id === 'drive') return false;
    delete st.gears[f.key]; st.tray.push(f.g);
    return true;
  }
  function sellGear(st, uid) {
    const f = findGear(st, uid);
    if (!f || f.g.id === 'drive') return 0;
    const refund = Math.max(1, Math.floor(D.GEARS[f.g.id].cost * D.ECON.sellRatio));
    if (f.where === 'board') delete st.gears[f.key]; else st.tray.splice(f.idx, 1);
    st.gold += refund;
    return refund;
  }

  /* ---------- Persistence ---------- */
  function toJSON(st) { return JSON.stringify(st); }
  function fromJSON(s) {
    const st = JSON.parse(s);
    if (!st || st.v !== 1 || !st.gears || !st.gears['0,0']) return null;
    return st;
  }

  return {
    DIRS, K, parseK, hexDist, inBoard, isEdge, boardCells, neighborKeys,
    hashStr, mulberry32, rand, randInt, pick,
    newRun, quota, isBoss, bossMod, ticksFor,
    computeSpin, simulateShift, runShift, useOvertime, declineOvertime, enterEndless, nextContract,
    genShop, reroll, buy, gearPrice,
    placeGear, unplaceGear, sellGear, findGear,
    pay, toJSON, fromJSON,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
