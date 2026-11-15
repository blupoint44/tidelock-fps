// TIDELOCK — bots: low-poly fighters with a small tactical brain.
// A bot perceives enemies by sight (line of sight + view cone) and by
// noise (recent gunfire), follows the nav graph to its objective, stops
// to shoot in bursts, strafes between bursts, plants or vents the Surge
// Charge when its intent says so, and falls over when it dies.

import * as THREE from 'three';
import { TEAMS, makeRng, clamp, dist2d } from './config.js';
import { WeaponState } from './weapons.js';

const BOT_NAMES = {
  wardens: ['Vigil', 'Tarn', 'Ostrom', 'Beck'],
  breakers: ['Sable', 'Grift', 'Havoc', 'Lumen'],
};

const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.85 });
const teamMats = {};
function teamMat(team, dark) {
  const key = team + (dark ? 'd' : '');
  if (!teamMats[key]) {
    teamMats[key] = new THREE.MeshStandardMaterial({
      color: dark ? TEAMS[team].dark : TEAMS[team].color, roughness: 0.7, metalness: 0.08,
    });
  }
  return teamMats[key];
}

let botSeq = 0;

export class Bot {
  constructor(scene, team, name, rng) {
    this.id = botSeq++;
    this.isPlayer = false;
    this.team = team;
    this.name = name || BOT_NAMES[team][this.id % 4];
    this.rng = rng || makeRng(1000 + this.id * 77);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.hp = 100;
    this.armor = 0;
    this.helmet = false;
    this.alive = true;
    this.money = 0;
    this.kills = 0;
    this.deaths = 0;
    this.weapon = new WeaponState('heron');
    this.primary = null; // WeaponState once bought
    this.intent = { type: 'push', site: 'A' };
    this.path = [];
    this.pathI = 0;
    this.target = null;
    this.lastSeenPos = null;
    this.lastSeenT = -9;
    this.reactT = 0;
    this.burstLeft = 0;
    this.burstPauseT = 0;
    this.shotCool = 0;
    this.strafeT = 0;
    this.strafeDir = 1;
    this.repathT = 0;
    this.perceptT = this.rng() * 0.12;
    this.walkPhase = this.rng() * 6;
    this.deadT = 0;
    this.channel = null; // 'plant' | 'defuse' while the game runs a channel
    this.reaction = 0.34 + this.rng() * 0.3;
    this.aimErr = 0.55 + this.rng() * 0.5;
    this.buildMesh(scene);
  }

  buildMesh(scene) {
    const g = new THREE.Group();
    const suit = teamMat(this.team, false), dark = teamMat(this.team, true);
    const legGeo = new THREE.BoxGeometry(0.17, 0.78, 0.21);
    this.legL = new THREE.Group(); this.legL.position.set(-0.12, 0.8, 0);
    const ll = new THREE.Mesh(legGeo, darkMat); ll.position.y = -0.39; this.legL.add(ll); g.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.12, 0.8, 0);
    const lr = new THREE.Mesh(legGeo, darkMat); lr.position.y = -0.39; this.legR.add(lr); g.add(this.legR);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.62, 0.3), suit);
    torso.position.y = 1.11; torso.castShadow = true; g.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.34), dark);
    vest.position.y = 1.13; g.add(vest);
    this.headG = new THREE.Group(); this.headG.position.y = 1.42;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.27, 0.25), skinMat);
    head.position.y = 0.15; head.castShadow = true; this.headG.add(head);
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.13, 0.29), dark);
    helm.position.y = 0.3; this.headG.add(helm);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x0a0c0e, emissive: TEAMS[this.team].color, emissiveIntensity: 0.7 }));
    visor.position.set(0, 0.16, -0.13); this.headG.add(visor);
    g.add(this.headG);
    this.armG = new THREE.Group(); this.armG.position.set(0.24, 1.3, -0.05);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.42), suit);
    arm.position.z = -0.16; this.armG.add(arm);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.52), darkMat);
    gun.position.set(0.02, 0.02, -0.42); this.armG.add(gun);
    this.muzzleRef = new THREE.Object3D(); this.muzzleRef.position.set(0.02, 0.05, -0.7);
    this.armG.add(this.muzzleRef);
    g.add(this.armG);
    scene.add(g);
    this.mesh = g;
  }

  reset(spawn, yaw) {
    this.pos.set(spawn[0], 0, spawn[1]);
    this.yaw = yaw;
    this.hp = 100;
    this.alive = true;
    this.target = null;
    this.lastSeenPos = null;
    this.lastSeenT = -9;
    this.path = []; this.pathI = 0;
    this.channel = null;
    this.deadT = 0;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, yaw, 0);
    this.mesh.position.copy(this.pos);
    if (this.weapon.reloading) this.weapon.reloadT = 0;
  }

  eyePos(out) { return out.set(this.pos.x, this.pos.y + 1.52, this.pos.z); }
  chestPos(out) { return out.set(this.pos.x, this.pos.y + 1.12, this.pos.z); }

  // ---- brain ----
  // ctx: { world, dt, now, enemies, noisePos, noiseT, fire(bot, targetPos), objectiveDone }
  update(ctx) {
    if (!this.alive) { this.updateVisual(ctx.dt, 0); return; }
    const { world, dt, now } = ctx;
    this.shotCool -= dt;
    if (this.weapon.reloading) {
      this.weapon.reloadT -= dt;
      if (this.weapon.reloadT <= 0) this.weapon.finishReload();
    }
    if (this.channel) { this.faceAlong(ctx, dt); this.updateVisual(dt, 0); return; }

    this.perceptT -= dt;
    if (this.perceptT <= 0) { this.perceptT = 0.12; this.perceive(ctx); }

    const seenNow = this.target && this.target.alive && (now - this.lastSeenT < 0.25);
    let moveTarget = null, wantSpeed = 3.35, facePos = null;

    if (seenNow) {
      facePos = this.target.pos;
      const d = dist2d(this.pos.x, this.pos.z, this.target.pos.x, this.target.pos.z);
      this.reactT += dt;
      // shooting: bursts with pauses, only after the reaction delay
      if (this.reactT > this.reaction && this.shotCool <= 0) this.runBurst(ctx, d);
      if (d > 17) { moveTarget = this.target.pos; wantSpeed = 3.5; }
      else {
        // strafe between bursts
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 0.7 + this.rng() * 0.9; this.strafeDir = this.rng() < 0.5 ? -1 : 1; }
        if (this.burstPauseT > 0) {
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          moveTarget = { x: this.pos.x + fz * this.strafeDir * 2.2, z: this.pos.z - fx * this.strafeDir * 2.2 };
          wantSpeed = 1.7;
        }
      }
    } else {
      this.reactT = 0;
      if (this.lastSeenPos && now - this.lastSeenT < 3.2) {
        moveTarget = this.lastSeenPos; wantSpeed = 3.5;
        facePos = this.lastSeenPos;
        if (dist2d(this.pos.x, this.pos.z, this.lastSeenPos.x, this.lastSeenPos.z) < 1.6) this.lastSeenPos = null;
      } else if (this.intent) {
        const obj = ctx.objectiveFor(this);
        if (obj) {
          moveTarget = obj.point; facePos = obj.face || null;
          if (obj.arrive && dist2d(this.pos.x, this.pos.z, obj.point.x, obj.point.z) < obj.arrive) {
            moveTarget = null;
            if (obj.face) facePos = obj.face;
          }
        }
      }
    }

    let speed = 0;
    if (moveTarget) speed = this.followPath(ctx, moveTarget, wantSpeed, dt);
    if (facePos) this.turnToward(facePos, dt, seenNow ? 10 : 4.5);
    else if (speed > 0.1 && this.path.length) {
      const wp = this.path[Math.min(this.pathI, this.path.length - 1)];
      this.turnToward(wp, dt, 5);
    }
    this.updateVisual(dt, speed);
  }

  perceive(ctx) {
    const { world, now, enemies } = ctx;
    const eye = this.eyePos(new THREE.Vector3());
    let best = null, bd = 65;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = dist2d(this.pos.x, this.pos.z, e.pos.x, e.pos.z);
      if (d > bd) continue;
      // view cone: 150 degrees, or point-blank awareness
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const dx = (e.pos.x - this.pos.x) / (d || 1), dz = (e.pos.z - this.pos.z) / (d || 1);
      if (d > 5 && fx * dx + fz * dz < -0.25) continue;
      if (!world.losClear(this.pos.x, this.pos.z, e.pos.x, e.pos.z)) continue;
      best = e; bd = d;
    }
    if (best) {
      this.target = best;
      this.lastSeenPos = { x: best.pos.x, z: best.pos.z };
      this.lastSeenT = now;
    } else if (ctx.noisePos && now - ctx.noiseT < 1.4 && !this.target) {
      const d = dist2d(this.pos.x, this.pos.z, ctx.noisePos.x, ctx.noisePos.z);
      if (d < 30) { this.lastSeenPos = { x: ctx.noisePos.x, z: ctx.noisePos.z }; this.lastSeenT = now - 1.2; }
    }
    if (this.target && !this.target.alive) this.target = null;
  }

  runBurst(ctx, d) {
    if (this.burstPauseT > 0) { this.burstPauseT -= 0.016; return; }
    if (this.weapon.mag <= 0) {
      if (this.weapon.startReload()) ctx.onReload(this);
      this.burstPauseT = 0.5;
      return;
    }
    if (this.burstLeft <= 0) this.burstLeft = 3 + Math.floor(this.rng() * 3);
    ctx.fire(this, this.target);
    this.burstLeft--;
    this.shotCool = 60 / this.weapon.def.rpm * (this.weapon.def.auto ? 1 : 1.7);
    if (this.burstLeft <= 0) this.burstPauseT = 0.45 + this.rng() * 0.5;
    if (this.weapon.mag <= 0 && this.weapon.startReload()) ctx.onReload(this);
  }

  followPath(ctx, target, speed, dt) {
    const { world } = ctx;
    this.repathT -= dt;
    const last = this.path[this.path.length - 1];
    if (!last || this.repathT <= 0 || Math.hypot(last.x - target.x, last.z - target.z) > 2.5) {
      this.path = world.findPath(this.pos.x, this.pos.z, target.x, target.z);
      this.pathI = 0;
      this.repathT = 1.6 + this.rng() * 0.8;
    }
    let wp = this.path[Math.min(this.pathI, this.path.length - 1)];
    if (!wp) return 0;
    let dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    let d = Math.hypot(dx, dz);
    if (d < 0.8 && this.pathI < this.path.length - 1) {
      this.pathI++;
      wp = this.path[this.pathI];
      dx = wp.x - this.pos.x; dz = wp.z - this.pos.z; d = Math.hypot(dx, dz);
    }
    if (d < 0.35) return 0;
    const vx = (dx / d) * speed, vz = (dz / d) * speed;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    const gy = world.groundYAt(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 10);
    world.collide(this.pos, 0.42, this.pos.y);
    return speed;
  }

  turnToward(p, dt, rate) {
    const want = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    let diff = want - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += clamp(diff, -rate * dt, rate * dt);
  }

  faceAlong(ctx, dt) {
    // While planting/venting, face the charge point.
    if (this.channelPos) this.turnToward(this.channelPos, dt, 3);
  }

  updateVisual(dt, speed) {
    const m = this.mesh;
    if (!this.alive) {
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.4);
      m.rotation.x = -t * Math.PI * 0.5;
      m.position.copy(this.pos);
      m.position.y = this.pos.y + t * 0.12;
      return;
    }
    m.rotation.set(0, this.yaw, 0);
    m.position.copy(this.pos);
    if (this.channel) {
      // kneel: sink the whole figure and still the legs
      m.position.y = this.pos.y - 0.34;
      this.legL.rotation.x = -1.9; this.legR.rotation.x = 0.4;
      return;
    }
    this.walkPhase += dt * (speed > 0.1 ? speed * 2.4 : 0);
    const swing = speed > 0.1 ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    m.position.y = this.pos.y + (speed > 0.1 ? Math.abs(Math.sin(this.walkPhase)) * 0.045 : 0);
  }
}

// Ray vs a fighter's hit volumes. Fighters are capsules approximated by a
// head sphere and two body spheres; returns {dist, head} or null.
const _o = new THREE.Vector3(), _c = new THREE.Vector3();
export function rayHitFighter(f, origin, dir, maxDist) {
  if (!f.alive) return null;
  const crouch = f.channel ? 0.34 : 0;
  const parts = [
    { y: 1.56 - crouch, r: 0.21, head: true },
    { y: 1.12 - crouch, r: 0.37, head: false },
    { y: 0.55 - crouch * 0.5, r: 0.34, head: false },
  ];
  let best = null;
  for (const p of parts) {
    _c.set(f.pos.x, f.pos.y + p.y, f.pos.z);
    _o.copy(_c).sub(origin);
    const tca = _o.dot(dir);
    if (tca < 0 || tca > maxDist) continue;
    const d2 = _o.lengthSq() - tca * tca;
    const r2 = p.r * p.r;
    if (d2 > r2) continue;
    const t = tca - Math.sqrt(r2 - d2);
    if (t > 0 && (!best || t < best.dist)) best = { dist: t, head: p.head };
  }
  return best;
}
