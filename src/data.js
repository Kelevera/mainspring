/* MAINSPRING — content data (gears, charms, contracts, boss modifiers)
   Pure data + effect functions. No DOM. Node-compatible for tests. */
'use strict';

const RARITY = { common: { name: 'Common', col: '#c9a227' }, rare: { name: 'Rare', col: '#9ab6c9' }, epic: { name: 'Epic', col: '#ffb757' } };

/* Effect context `c` fields:
   tick, ticks        — current tick (1-based), total ticks this shift
   dir                — 1 = clockwise, -1 = counter-clockwise, 0 = free (wild)
   nbs                — occupied neighbor list: {key, id, def, spinning, dir}
   emptyAdj           — number of empty adjacent cells (on board)
   edge               — true if cell is on the board rim
   gold               — current gold
   done               — contracts completed this run
   spinningCount      — total spinning gears on board (incl. drive)
   bestNbBase         — highest neighbor base output this tick (echo pass)
*/

const GEARS = {
  drive: { name: 'Mainspring Drive', rarity: 'common', cost: 0, fixed: true,
    text: 'The heart of the machine. +1 energy per tick. Everything must connect to it.',
    calc: c => 1 },

  /* ---------- Commons ---------- */
  brass: { name: 'Brass Dynamo', rarity: 'common', cost: 4,
    text: '+2 energy per tick.', calc: c => 2 },
  copper: { name: 'Copper Dynamo', rarity: 'common', cost: 5,
    text: '+3 energy if spinning clockwise, +1 otherwise.',
    calc: c => (c.dir === 1 ? 3 : 1) },
  tin: { name: 'Tin Dynamo', rarity: 'common', cost: 5,
    text: '+3 energy if spinning counter-clockwise, +1 otherwise.',
    calc: c => (c.dir === -1 ? 3 : 1) },
  crowd: { name: 'Crowd Cog', rarity: 'common', cost: 5,
    text: '+1 energy, plus +1 per spinning neighbor.',
    calc: c => 1 + c.nbs.filter(n => n.spinning).length },
  hermit: { name: 'Hermit Wheel', rarity: 'common', cost: 5,
    text: '+5 energy if it has at most 1 neighbor, else +1.',
    calc: c => (c.nbs.length <= 1 ? 5 : 1) },
  rim: { name: 'Rim Runner', rarity: 'common', cost: 5,
    text: '+4 energy on the board rim, +1 elsewhere.',
    calc: c => (c.edge ? 4 : 1) },
  escapement: { name: 'Escapement', rarity: 'common', cost: 6,
    text: 'Every 3rd tick: +8 energy.', calc: c => (c.tick % 3 === 0 ? 8 : 0) },
  flywheel: { name: 'Flywheel', rarity: 'common', cost: 6,
    text: 'Builds momentum: + energy equal to half the tick number.',
    calc: c => Math.floor(c.tick / 2) },
  pendulum: { name: 'Pendulum', rarity: 'common', cost: 5,
    text: 'Odd ticks: +4 energy. Even ticks: nothing.',
    calc: c => (c.tick % 2 === 1 ? 4 : 0) },
  mint: { name: 'Mint Wheel', rarity: 'common', cost: 6,
    text: '+1 energy per tick. Every 4th tick: +1 gold.',
    calc: c => 1, gcalc: c => (c.tick % 4 === 0 ? 1 : 0) },

  /* ---------- Rares ---------- */
  governor: { name: 'Governor', rarity: 'rare', cost: 9,
    text: 'Produces nothing. Adjacent spinning gears: +2 energy each.',
    calc: c => 0, buff: 2 },
  amp: { name: 'Amplifier Drum', rarity: 'rare', cost: 12,
    text: 'Produces nothing. Adjacent gears\' energy x1.5.',
    calc: c => 0, mult: 1.5 },
  ratchet: { name: 'Ratchet', rarity: 'rare', cost: 8,
    text: '+8 energy clockwise. Nothing counter-clockwise.',
    calc: c => (c.dir === 1 ? 8 : 0) },
  counterratchet: { name: 'Counter-Ratchet', rarity: 'rare', cost: 8,
    text: '+8 energy counter-clockwise. Nothing clockwise.',
    calc: c => (c.dir === -1 ? 8 : 0) },
  bushing: { name: 'Greased Bushing', rarity: 'rare', cost: 10, wild: true,
    text: '+1 energy. Meshes loosely: never jams, and neighbors may spin either way. Breaks odd loops.',
    calc: c => 1 },
  gilded: { name: 'Gilded Gear', rarity: 'rare', cost: 10,
    text: '+1 energy per 12 gold you hold.', calc: c => Math.floor(c.gold / 12) },
  echo: { name: 'Echo Wheel', rarity: 'rare', cost: 11,
    text: 'Copies 60% of the best adjacent gear\'s base output.',
    calc: c => Math.floor(c.bestNbBase * 0.6), echo: true },
  whistle: { name: 'Factory Whistle', rarity: 'rare', cost: 9,
    text: 'On the final tick: +22 energy.',
    calc: c => (c.tick === c.ticks ? 22 : 0) },
  twin: { name: 'Twin Gear', rarity: 'rare', cost: 8,
    text: '+3 energy. +3 more if adjacent to another Twin Gear.',
    calc: c => 3 + (c.nbs.some(n => n.id === 'twin') ? 3 : 0) },
  clockspring: { name: 'Clock Spring', rarity: 'rare', cost: 9,
    text: '+1 energy per contract you have completed this run.',
    calc: c => c.done },
  boiler: { name: 'Boiler', rarity: 'rare', cost: 10,
    text: '+7 energy, but adjacent gears -1 energy.',
    calc: c => 7, buff: -1 },

  /* ---------- Epics ---------- */
  grandgov: { name: 'Grand Governor', rarity: 'epic', cost: 16,
    text: 'Produces nothing. ALL spinning gears: +1 energy.',
    calc: c => 0, globalBuff: 1 },
  prime: { name: 'Dynamo Prime', rarity: 'epic', cost: 15,
    text: '+6 energy. +3 more if spinning clockwise.',
    calc: c => 6 + (c.dir === 1 ? 3 : 0) },
  perpetuum: { name: 'Perpetuum', rarity: 'epic', cost: 18,
    text: '+ energy equal to the tick number. Relentless.',
    calc: c => c.tick },
  midas: { name: 'Midas Drum', rarity: 'epic', cost: 16,
    text: '+2 energy per tick. Every 5th tick: +3 gold.',
    calc: c => 2, gcalc: c => (c.tick % 5 === 0 ? 3 : 0) },
  astrolabe: { name: 'Astrolabe', rarity: 'epic', cost: 14,
    text: '+9 energy with exactly 2 spinning neighbors, else +2.',
    calc: c => (c.nbs.filter(n => n.spinning).length === 2 ? 9 : 2) },
  carillon: { name: 'Carillon', rarity: 'epic', cost: 17,
    text: 'Every 5th tick: +2 energy per spinning gear on the board.',
    calc: c => (c.tick % 5 === 0 ? 2 * c.spinningCount : 0) },
  overdrive: { name: 'Overdrive Core', rarity: 'epic', cost: 20,
    text: 'Produces nothing. Adjacent gears\' energy x2.',
    calc: c => 0, mult: 2 },
};

/* Charms — global passive artifacts. Max 5 per run. */
const CHARMS = {
  oilcan: { name: 'Oil Can', cost: 12, text: '+1 tick every shift.' },
  ledger: { name: 'Ledger', cost: 8, text: '+3 gold base pay per contract.' },
  unioncard: { name: 'Union Card', cost: 10, text: 'Gears in the shop cost 20% less.' },
  springwinder: { name: 'Spring Winder', cost: 9, text: 'The Mainspring Drive produces +2 energy.' },
  overtimepermit: { name: 'Overtime Permit', cost: 11, text: 'Once per run: retry a failed shift.' },
  insurance: { name: 'Insurance Bond', cost: 9, text: 'Interest cap raised to 10 gold (from 5).' },
  luckycoin: { name: 'Lucky Coin', cost: 7, text: 'Shop rerolls always cost 1 gold.' },
  foreman: { name: 'Foreman\'s Whistle', cost: 13, text: 'Start each shift with +5 energy per contract completed.' },
};

/* Boss modifiers — applied on contracts 3 and 6 (seeded pick). */
const BOSS_MODS = {
  inspection: { name: 'Union Inspection', text: 'At most 10 gears may be installed.', maxGears: 10 },
  coldstart: { name: 'Cold Morning', text: 'The first 2 ticks produce nothing.', deadTicks: 2 },
  powercut: { name: 'Power Ration', text: 'This shift has 1 fewer tick.', tickPenalty: 1 },
  stickyvalves: { name: 'Sticky Valves', text: 'Every 4th tick produces nothing.', stickyEvery: 4 },
  heavyload: { name: 'Heavy Load', text: 'Multipliers are disabled.', noMult: true },
  offaxis: { name: 'Warped Chassis', text: 'Gears on the board rim produce nothing.', rimDead: true },
};

/* Contract quotas. Contracts 3 & 6 are bosses; 8 is the Grand Commission. */
const QUOTAS = [25, 45, 70, 105, 155, 225, 320, 450];
const BOSS_AT = [3, 6];
const FINAL_CONTRACT = 8;
const ENDLESS_GROWTH = 1.45;

const ECON = {
  startGold: 4,
  basePay: 9,
  surplusDiv: 3, surplusCap: 12,
  interestDiv: 10, interestCap: 5, interestCapInsured: 10,
  rerollBase: 2,
  ticksBase: 10,
  sellRatio: 0.5,
  expandCost: { 2: 10, 3: 22 },
  maxCharms: 5,
  shopGears: 4,
};

/* Starting tray. Drive is auto-placed at the center. */
const START_TRAY = ['brass', 'brass', 'copper'];

/* Rarity weights by contract number. */
function rarityWeights(contract) {
  if (contract >= 6) return { common: 0.40, rare: 0.42, epic: 0.18 };
  if (contract >= 4) return { common: 0.52, rare: 0.36, epic: 0.12 };
  if (contract >= 2) return { common: 0.68, rare: 0.28, epic: 0.04 };
  return { common: 0.85, rare: 0.15, epic: 0.0 };
}

/* Demo build: which gears/charms are available (epics + some rares held back). */
const DEMO_GEARS = ['brass', 'copper', 'tin', 'crowd', 'hermit', 'rim', 'escapement', 'flywheel', 'pendulum', 'mint', 'governor', 'ratchet', 'bushing'];
const DEMO_CHARMS = ['ledger', 'luckycoin', 'springwinder'];
const DEMO_LAST_CONTRACT = 3;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RARITY, GEARS, CHARMS, BOSS_MODS, QUOTAS, BOSS_AT, FINAL_CONTRACT, ENDLESS_GROWTH, ECON, START_TRAY, rarityWeights, DEMO_GEARS, DEMO_CHARMS, DEMO_LAST_CONTRACT };
}
