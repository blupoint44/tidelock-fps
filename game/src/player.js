// TIDELOCK — the player's body: pointer-lock look, WASD movement with
// acceleration, stepping up onto low cover, jumping, crouching, and the
// movement values the gunplay reads (spread grows while you move).

import * as THREE from 'three';
import { clamp } from './config.js';
import { WeaponState } from './weapons.js';

export class Player {
  constructor() {
    this.isPlayer = true;
    this.team = 'breakers';
    this.name = 'You';
    this.pos = new THREE.Vector3(-40, 0, 0);
    this.velY = 0;
    this.yaw = Math.PI / 2; // face east, into the yard
    this.pitch = 0;
    this.hp = 100;
    this.armor = 0;
    this.helmet = false;
    this.alive = true;
    this.money = 0;
    this.kills = 0;
    this.deaths = 0;
    this.weapons = { sidearm: new WeaponState('heron'), primary: null };
    this.slot = 'sidearm';
    this.switchT = 0;
    this.crouching = false;
    this.adsT = 0;
    this.grounded = true;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.speed2d = 0;
    this.stepAcc = 0;
    this.channel = null;
    this.channelPos = null;
  }

  get weapon() { return this.weapons[this.slot]; }
  eyeHeight() { return this.crouching ? 1.12 : 1.62; }
  eyePos(out) { return out.set(this.pos.x, this.pos.y + this.eyeHeight(), this.pos.z); }
  chestPos(out) { return out.set(this.pos.x, this.pos.y + 1.1, this.pos.z); }

  reset(spawn, yaw) {
    this.pos.set(spawn[0], 0, spawn[1]);
    this.yaw = yaw; this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.velY = 0;
    this.channel = null;
    if (this.weapon && this.weapon.reloading) this.weapon.reloadT = 0;
  }

  update(dt, input, world, opts) {
    const frozen = opts && opts.frozen;
    // look
    const [mdx, mdy] = input.takeMouse();
    const sens = 0.0021 * (this.adsT > 0.5 ? 0.55 : 1);
    this.yaw -= mdx * sens;
    this.pitch = clamp(this.pitch - mdy * sens, -1.45, 1.45);

    this.crouching = input.down('ControlLeft') || input.down('KeyC');
    const adsWant = input.adsHeld && this.alive && !frozen ? 1 : 0;
    this.adsT += (adsWant - this.adsT) * Math.min(1, dt * 11);

    // wish direction in world space
    let ix = 0, iz = 0;
    if (!frozen && this.alive) {
      if (input.down('KeyW')) iz -= 1;
      if (input.down('KeyS')) iz += 1;
      if (input.down('KeyA')) ix -= 1;
      if (input.down('KeyD')) ix += 1;
    }
    // wish direction: forward is (-sin yaw, -cos yaw), right is its perpendicular
    const fwd = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    const f = -iz, r = ix;
    let wx = fwd.x * f + right.x * r;
    let wz = fwd.z * f + right.z * r;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    let maxSpeed = 4.45;
    if (this.crouching) maxSpeed = 2.1;
    else if (this.adsT > 0.4) maxSpeed = 2.5;
    else if (input.down('ShiftLeft')) maxSpeed = 2.4; // walk: quiet, accurate

    const accel = this.grounded ? 26 : 4;
    this.vx = (this.vx || 0) + wx * accel * dt;
    this.vz = (this.vz || 0) + wz * accel * dt;
    // friction / clamp
    const sp = Math.hypot(this.vx, this.vz);
    if (wl === 0 && this.grounded) {
      const drop = Math.max(0, sp - 30 * dt);
      if (sp > 0) { this.vx *= drop / sp; this.vz *= drop / sp; }
    } else if (sp > maxSpeed) { this.vx *= maxSpeed / sp; this.vz *= maxSpeed / sp; }
    this.speed2d = Math.hypot(this.vx, this.vz);

    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;
    world.collide(this.pos, 0.42, this.pos.y);

    // vertical: ground height, gravity, jump
    const gy = world.groundYAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.grounded && input.down('Space') && !frozen && this.alive && !this.crouching) {
      this.velY = 6.4; this.grounded = false;
    }
    if (!this.grounded || this.pos.y > gy + 0.001) {
      this.velY -= 17.5 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= gy) { this.pos.y = gy; this.velY = 0; this.grounded = true; }
    } else {
      this.pos.y = gy;
      this.grounded = true;
    }

    // head bob + footsteps
    if (this.grounded && this.speed2d > 0.4) {
      this.bobPhase += dt * this.speed2d * 1.9;
      this.bobAmt = Math.min(1, this.bobAmt + dt * 6);
      this.stepAcc += this.speed2d * dt;
      if (this.stepAcc > 2.3) { this.stepAcc = 0; if (opts && opts.onStep) opts.onStep(maxSpeed > 3); }
    } else {
      this.bobAmt = Math.max(0, this.bobAmt - dt * 6);
    }

    if (this.switchT > 0) this.switchT -= dt;
    const w = this.weapon;
    if (w && w.reloading) { w.reloadT -= dt; if (w.reloadT <= 0) { w.finishReload(); this.justReloaded = true; } }
  }

  // Spread multiplier from movement: 0 standing, 1 at full run.
  moveFactor() { return clamp(this.speed2d / 4.45, 0, 1) * (this.grounded ? 1 : 1.6); }
}
