// TIDELOCK — bootstrap: build the game, run the frame loop, and support
// the maker's modes (?shot=<scene> for screenshots, ?test=1 for a headless
// bot-vs-bot smoke run).

import { Game } from './game.js';
import { setupShot } from './shot.js';

const params = new URLSearchParams(location.search);
const container = document.getElementById('app');
const game = new Game(container, { seed: Number(params.get('seed') || 1), lowGfx: !!params.get('test') });
window.__game = game;

const shotName = params.get('shot');
let frames = 0;
if (shotName) {
  document.getElementById('menu-title').classList.remove('on');
  game.hud.showHud(true);
  game.mode = 'shot';
  setupShot(game, shotName);
}
if (params.get('test')) {
  document.getElementById('menu-title').classList.remove('on');
  game.hud.showHud(true);
  game.startMatch();
  window.__TEST__ = {
    state: () => ({
      mode: game.mode, phase: game.phase, phaseT: Math.round(game.phaseT), round: game.round,
      score: { ...game.score },
      alive: game.fighters.filter((f) => f.alive).length,
      kills: game.fighters.reduce((s, f) => s + f.kills, 0),
      charge: game.charge ? game.charge.state : null,
    }),
  };
}

let last = performance.now();
const subSteps = params.get('test') ? 3 : 1; // headless smoke runs accelerate game time
function loop(nowMs) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (nowMs - last) / 1000 || 0.016);
  last = nowMs;
  for (let i = 0; i < subSteps; i++) game.update(dt);
  if (shotName) {
    frames++;
    if (frames === 11 && game.shotIgnite) game.shotIgnite();
    if (frames === 13) window.__shotReady = true;
  }
}
requestAnimationFrame(loop);
