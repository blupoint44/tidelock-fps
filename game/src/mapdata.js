// TIDELOCK — the Lockyard map as data.
// Coordinates are metres: x runs west(-) to east(+), z runs north(-) to
// south(+). The Breakers start in the west yard, the Wardens hold the east
// works between the two sites. A dredged lock basin cuts the middle of the
// yard; the only crossings are the north and south bridge decks.
//
// boxes: [x, z, width, depth, height, baseY, kind]
//   kind picks the surface treatment in world.js. A box is solid from baseY
//   to baseY+height. Low boxes (height <= 1.15) can be stepped onto.
// nodes: [x, z, tag] — bot navigation graph points; edges are derived at
//   load from distance and line of sight.

export const GROUND = { w: 98, d: 68 };

export const BOXES = [
  // Perimeter walls
  [-47, 0, 2, 68, 5.5, 0, 'wall'], [47, 0, 2, 68, 5.5, 0, 'wall'],
  [0, -33, 98, 2, 5.5, 0, 'wall'], [0, 33, 98, 2, 5.5, 0, 'wall'],

  // Lock basin edge walls (gaps left at the two bridge decks)
  [-7, -21.5, 1.2, 9, 1.0, 0, 'metal'], [-7, 0, 1.2, 22, 1.0, 0, 'metal'], [-7, 21.5, 1.2, 9, 1.0, 0, 'metal'],
  [5, -21.5, 1.2, 9, 1.0, 0, 'metal'], [5, 0, 1.2, 22, 1.0, 0, 'metal'], [5, 21.5, 1.2, 9, 1.0, 0, 'metal'],
  // Bridge decks (step up onto them, top at y=1.0)
  [-1, -14, 15, 6, 1.0, 0, 'deck'], [-1, 14, 15, 6, 1.0, 0, 'deck'],

  // Gantry crane over the basin: two legs and a high beam (beam base y=10)
  [-9.5, -2, 1.6, 3, 11, 0, 'crane'], [7.5, -2, 1.6, 3, 11, 0, 'crane'],
  [-1, -2, 20, 2.2, 1.6, 10, 'crane'], [-1, -2, 2.4, 2.4, 2.2, 7.6, 'crane'],

  // West yard (Breaker side) cover
  [-38, -14, 6, 2.4, 2.6, 0, 'contA'], [-38, 12, 6, 2.4, 2.6, 0, 'contB'],
  [-30, -6, 2.4, 6, 2.6, 0, 'contC'], [-30, 7, 2.4, 6, 2.6, 0, 'contA'],
  [-24, 0, 3.2, 3.2, 1.15, 0, 'crate'], [-18, -16, 6, 2.4, 2.6, 0, 'contB'],
  [-18, 17, 6, 2.4, 2.6, 0, 'contC'], [-13, -4, 2.2, 2.2, 1.15, 0, 'crate'],
  [-13, 5, 2.2, 2.2, 1.15, 0, 'crate'], [-24, -22, 2.2, 2.2, 1.15, 0, 'crate'],
  [-24, 23, 2.2, 2.2, 1.15, 0, 'crate'],

  // North lane
  [-32, -24, 6, 2.4, 2.6, 0, 'contB'], [-12, -21, 2.4, 5, 2.6, 0, 'contA'],
  [10, -22, 6, 2.4, 2.6, 0, 'contC'], [18, -16, 2.2, 2.2, 1.15, 0, 'crate'],
  [2, -27, 3.2, 3.2, 1.15, 0, 'crate'], [-2, -14, 3, 2, 1.15, 0, 'crate'],

  // South lane
  [-32, 24, 6, 2.4, 2.6, 0, 'contA'], [-12, 21, 2.4, 5, 2.6, 0, 'contB'],
  [10, 22, 6, 2.4, 2.6, 0, 'contA'], [18, 16, 2.2, 2.2, 1.15, 0, 'crate'],
  [2, 27, 3.2, 3.2, 1.15, 0, 'crate'], [-2, 14, 3, 2, 1.15, 0, 'crate'],

  // East mid (Warden rotation ground between the sites)
  [14, 0, 6, 2.4, 2.6, 0, 'contB'], [22, -6, 2.4, 6, 2.6, 0, 'contC'],
  [22, 6, 2.4, 6, 2.6, 0, 'contA'], [16, 9, 2.2, 2.2, 1.15, 0, 'crate'],
  [30, 0, 3.2, 3.2, 1.15, 0, 'crate'],

  // Sluice A works (north-east): twin gate towers, beam, machinery cover
  [40, -22, 4, 4, 8, 0, 'tower'], [40, -12, 4, 4, 8, 0, 'tower'],
  [40, -17, 4, 10, 1.8, 6.4, 'tower'],
  [27, -22, 6, 2.4, 2.6, 0, 'contC'], [27, -12, 2.2, 2.2, 1.15, 0, 'crate'],
  [33, -25, 4.5, 2, 1.6, 0, 'machine'], [24, -17, 2.2, 2.2, 1.15, 0, 'crate'],

  // Pump Hall B (south-east): hall block with lit windows, yard cover
  [41, 18, 9, 13, 7, 0, 'hall'],
  [27, 12, 6, 2.4, 2.6, 0, 'contA'], [27, 23, 2.2, 2.2, 1.15, 0, 'crate'],
  [33, 26, 4.5, 2, 1.6, 0, 'machine'], [24, 17, 2.2, 2.2, 1.15, 0, 'crate'],
  [31, 8.5, 5, 1.6, 1.15, 0, 'crate'],
];

// Site zones: the Surge Charge can be planted anywhere inside the rect.
export const SITES = {
  A: { id: 'A', name: 'Sluice A', x0: 23, x1: 44, z0: -27, z1: -8, plant: [34, -18], color: 0x2fd4c4 },
  B: { id: 'B', name: 'Pump Hall B', x0: 23, x1: 36.5, z0: 8, z1: 27, plant: [31, 18], color: 0xffa63d },
};

export const SPAWNS = {
  breakers: [[-40, -4], [-40, 1], [-38, -7], [-38, 5]],
  wardens: [[36, -3], [36, 3], [39, 0], [33, 0]],
};

// Navigation graph points. Tags steer bot plans: lanes, bridges, sites,
// rotation ground.
export const NODES = [
  [-40, -1, 'bspawn'], [-35, -8, 'west'], [-35, 7, 'west'],
  [-28, -13, 'laneN'], [-28, 13, 'laneS'], [-27, 0, 'west'],
  [-20, -20, 'laneN'], [-20, 20, 'laneS'], [-16, -8, 'west'], [-16, 8, 'west'],
  [-11, -14, 'bridgeN'], [-11, 14, 'bridgeS'],
  [-1, -14, 'bridgeN'], [-1, 14, 'bridgeS'],
  [9, -14, 'bridgeN'], [9, 14, 'bridgeS'],
  [-4, -21, 'laneN'], [-4, 21, 'laneS'],
  [8, -24, 'laneN'], [8, 24, 'laneS'],
  [15, -19, 'laneN'], [15, 19, 'laneS'],
  [19, -10, 'midE'], [19, 10, 'midE'], [14, 0, 'midE'], [26, 0, 'wspawn'],
  [36, 0, 'wspawn'],
  [24, -13, 'siteA'], [30, -21, 'siteA'], [36, -17, 'siteA'], [29, -25, 'siteA'], [42, -17, 'siteA'],
  [24, 13, 'siteB'], [30, 21, 'siteB'], [33, 14, 'siteB'], [29, 25, 'siteB'], [25, 18, 'siteB'],
  [-20, -27, 'laneN'], [-20, 27, 'laneS'], [44, -17, 'siteA'],
];

// Defender hold points per site (bots pick from these at round start).
export const HOLD_POINTS = {
  A: [[30, -21], [36, -17], [24, -13], [29, -25]],
  B: [[30, 21], [33, 14], [24, 13], [25, 18]],
  mid: [[19, -10], [19, 10]],
};
