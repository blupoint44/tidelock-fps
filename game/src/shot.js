// TIDELOCK — screenshot scenes. The game ships with a `?shot=<name>&seed=1`
// mode that poses deterministic scenes for the maker's screenshots: real
// renders of the game's own code, HUD included, no gameplay input needed.

import * as THREE from 'three';
import { WeaponState } from './weapons.js';
import { SITES } from './world.js';

function poseBot(bot, x, z, yaw, opts = {}) {
  bot.pos.set(x, botWorldY(bot, x, z), z);
  bot.yaw = yaw;
  bot.channel = opts.channel || null;
  if (opts.walk) { bot.walkPhase = opts.walk; bot.updateVisual(0.016, 3.2); }
  else bot.updateVisual(0.016, 0);
  bot.mesh.position.y = bot.pos.y + (opts.walk ? Math.abs(Math.sin(bot.walkPhase)) * 0.045 : 0);
}

function botWorldY(bot, x, z) { return 0; } // all posed spots are on the flat yard

export function setupShot(game, name) {
  const hud = game.hud;
  const breakers = game.bots.filter((b) => b.team === 'breakers');
  const wardens = game.bots.filter((b) => b.team === 'wardens');
  hud.el.cross.style.display = 'none';

  if (name === 'start') {
    // Down the north lane from the Breaker yard: the squad advances.
    game.shotCamera = { pos: new THREE.Vector3(-43, 3.4, -8.5), look: new THREE.Vector3(6, 0.8, -17) };
    poseBot(breakers[0], -33, -13, -Math.PI / 2, { walk: 1.2 });
    poseBot(breakers[1], -30.5, -17.5, -Math.PI / 2, { walk: 3.9 });
    poseBot(breakers[2], -27, -10.5, -Math.PI / 2, { walk: 5.6 });
    poseBot(wardens[0], 9, -22.5, Math.PI / 2, { walk: 2.2 });
    poseBot(wardens[1], 30, -21, Math.PI / 2);
    poseBot(wardens[2], 24, -12, Math.PI / 2);
    poseBot(wardens[3], 36, 3, Math.PI / 2);
    hud.setScore(0, 0, 1);
    hud.setClock(96, 'live');
    hud.setVitals(100, 0);
    hud.setMoney(800);
    hud.setAmmo(12, 96, 'HERON P9');
    hud.setCarry(true);
  } else if (name === 'play') {
    // Player POV on the north bridge, mid-fight with the Longshore AR.
    hud.el.cross.style.display = 'block';
    const p = game.player;
    p.weapons.primary = new WeaponState('longshore');
    p.weapons.primary.mag = 18; p.weapons.primary.reserve = 75;
    p.slot = 'primary';
    p.armor = 40;
    p.reset([-1, -14], -Math.PI / 2);
    p.pos.y = 1.0; // on the bridge deck
    p.pitch = 0.02;
    game.refreshViewmodel();
    game.staticScene = true;
    poseBot(wardens[0], 11, -15.5, Math.PI / 2, { walk: 2.8 });
    poseBot(wardens[1], 16, -20, Math.PI / 2);
    poseBot(wardens[2], 30, 21, Math.PI / 2);
    poseBot(wardens[3], 33, 14, Math.PI / 2);
    poseBot(breakers[0], -12, -20, -Math.PI / 2, { walk: 0.7 });
    poseBot(breakers[1], -16, 14, -Math.PI / 2);
    poseBot(breakers[2], -9, 18, -Math.PI / 2);
    hud.setScore(2, 3, 6);
    hud.setClock(47, 'live');
    hud.setVitals(72, 40);
    hud.setMoney(3400);
    hud.setAmmo(18, 75, 'LONGSHORE AR');
    hud.killfeed('<span class="kb">You</span> <span class="wpn">Longshore AR</span> <span class="kw">Tarn</span> <span class="hs">HEADSHOT</span>');
    hud.killfeed('<span class="kw">Vigil</span> <span class="wpn">Rook-9</span> <span class="kb">Grift</span>');
    game.shotIgnite = () => {
      game.camera.updateMatrixWorld();
      const eye = p.eyePos(new THREE.Vector3());
      const muzzle = game.vmMuzzle.getWorldPosition(new THREE.Vector3());
      const target = new THREE.Vector3(11, 2.15, -15.5);
      game.effects.tracer(muzzle, target, 0xfff3cf);
      game.effects.impact(target, false);
      game.effects.flash(muzzle);
      hud.hitmarker(true);
    };
  } else if (name === 'plant') {
    // The plant at Sluice A, covered by two teammates.
    const s = SITES.A;
    game.shotCamera = { pos: new THREE.Vector3(26.5, 2.4, -25.5), look: new THREE.Vector3(s.plant[0], 1, s.plant[1]) };
    poseBot(breakers[0], s.plant[0], s.plant[1], -Math.PI / 2, { channel: 'plant' });
    breakers[0].channelPos = { x: s.plant[0], z: s.plant[1] };
    game.charge = { state: 'planted', carrier: null, pos: { x: s.plant[0] + 0.4, z: s.plant[1] + 0.3 }, site: 'A' };
    poseBot(breakers[1], 29, -24.5, -Math.PI / 2);
    poseBot(breakers[2], 30, -11.5, -Math.PI / 2, { walk: 4.4 });
    poseBot(wardens[0], 19, -10, Math.PI / 2, { walk: 1.5 });
    poseBot(wardens[1], 36, 0, Math.PI / 2);
    poseBot(wardens[2], 30, 21, Math.PI / 2);
    poseBot(wardens[3], 33, 14, Math.PI / 2);
    hud.setScore(3, 4, 8);
    hud.setClock(31, 'live');
    hud.setVitals(88, 65);
    hud.setMoney(1250);
    hud.setAmmo(22, 60, 'LONGSHORE AR');
    hud.channel('PLANTING THE SURGE CHARGE', 0.62);
    hud.setCarry(true);
  } else if (name === 'end') {
    // Round won at Pump Hall B: the charge sits planted, Breakers hold.
    const s = SITES.B;
    game.shotCamera = { pos: new THREE.Vector3(20.5, 2.8, 27.5), look: new THREE.Vector3(s.plant[0], 0.8, s.plant[1]) };
    game.charge = { state: 'planted', carrier: null, pos: { x: s.plant[0], z: s.plant[1] }, site: 'B' };
    poseBot(breakers[0], 28, 15, -Math.PI / 2);
    poseBot(breakers[1], 26, 22, -Math.PI / 2, { walk: 2.4 });
    poseBot(breakers[2], 33, 24.5, Math.PI / 2);
    poseBot(wardens[0], 24, 12, Math.PI / 2);
    poseBot(wardens[1], 36, -3, Math.PI / 2);
    poseBot(wardens[2], 30, -21, Math.PI / 2);
    poseBot(wardens[3], 36, -17, Math.PI / 2);
    hud.setScore(3, 6, 10);
    hud.setClock(0, 'charge');
    hud.setVitals(54, 20);
    hud.setMoney(5850);
    hud.setAmmo(9, 41, 'LONGSHORE AR');
    hud.banner('ROUND WON', 'The Surge Charge detonated — Breakers +$2,400', '#ffa63d', 999);
  }
}
