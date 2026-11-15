// TIDELOCK — shared tuning, names and helpers.
// A round-based tactical FPS set in a tidal lock yard. Everything here is
// original to this game: names, economy numbers and weapon statistics.

export const TEAMS = {
  wardens: {
    id: 'wardens',
    name: 'Wardens',
    role: 'Defend the lock works',
    color: 0x2fd4c4,
    css: '#2fd4c4',
    dark: 0x14534d,
  },
  breakers: {
    id: 'breakers',
    name: 'Breakers',
    role: 'Plant the Surge Charge',
    color: 0xffa63d,
    css: '#ffa63d',
    dark: 0x6e4514,
  },
};

export const MATCH = {
  teamSize: 4,
  roundsToWin: 7,
  maxRounds: 12,
  buyTime: 12,
  roundTime: 100,
  chargeTime: 35,
  plantTime: 3.2,
  defuseTime: 5,
  endTime: 4.5,
  startMoney: 800,
  maxMoney: 12000,
  killReward: 300,
  winReward: 2400,
  lossReward: 1900,
  plantReward: 300,
  lossStreakStep: 200,
  maxLossBonus: 1000,
};

export const ARMOR_PRICE = 650;
export const HELMET_PRICE = 350;

// Weapon catalogue. damage is per bullet (per pellet for the scattergun),
// headMult multiplies a head hit, falloffStart/falloffEnd bracket the range
// over which damage eases down to falloffMin of its base value.
export const WEAPONS = {
  heron: {
    id: 'heron', name: 'Heron P9', slot: 'sidearm', price: 0,
    damage: 34, headMult: 3.2, pellets: 1, rpm: 330, auto: false,
    mag: 12, reserve: 96, reloadTime: 1.5, spread: 0.010, moveSpread: 0.020,
    falloffStart: 18, falloffEnd: 46, falloffMin: 0.55, zoom: 1.25,
    kick: 0.010, tracer: 0xf5e9c9,
  },
  rook: {
    id: 'rook', name: 'Rook-9', slot: 'primary', price: 1100,
    damage: 26, headMult: 2.8, pellets: 1, rpm: 760, auto: true,
    mag: 30, reserve: 120, reloadTime: 2.1, spread: 0.020, moveSpread: 0.034,
    falloffStart: 14, falloffEnd: 38, falloffMin: 0.5, zoom: 1.3,
    kick: 0.008, tracer: 0xffd9a0,
  },
  scatter: {
    id: 'scatter', name: 'Breaker-12', slot: 'primary', price: 1700,
    damage: 12, headMult: 1.6, pellets: 8, rpm: 68, auto: false,
    mag: 6, reserve: 30, reloadTime: 2.9, spread: 0.052, moveSpread: 0.06,
    falloffStart: 6, falloffEnd: 20, falloffMin: 0.3, zoom: 1.2,
    kick: 0.045, tracer: 0xffc37a,
  },
  longshore: {
    id: 'longshore', name: 'Longshore AR', slot: 'primary', price: 2500,
    damage: 40, headMult: 3.4, pellets: 1, rpm: 600, auto: true,
    mag: 25, reserve: 100, reloadTime: 2.4, spread: 0.013, moveSpread: 0.030,
    falloffStart: 26, falloffEnd: 70, falloffMin: 0.65, zoom: 1.45,
    kick: 0.013, tracer: 0xfff3cf,
  },
  needle: {
    id: 'needle', name: 'Needle DMR', slot: 'primary', price: 3200,
    damage: 96, headMult: 2.2, pellets: 1, rpm: 46, auto: false,
    mag: 5, reserve: 25, reloadTime: 2.8, spread: 0.0022, moveSpread: 0.016,
    falloffStart: 40, falloffEnd: 110, falloffMin: 0.8, zoom: 2.6,
    kick: 0.05, tracer: 0xcfe9ff,
  },
};

export const BUY_ORDER = ['rook', 'scatter', 'longshore', 'needle'];

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2d(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

// Small deterministic PRNG (mulberry32) so screenshot scenes and bot
// behaviour can be reproduced from a seed.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtMoney(n) { return '$' + n.toLocaleString('en-US'); }
export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
