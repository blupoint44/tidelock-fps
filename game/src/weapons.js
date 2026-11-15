// TIDELOCK — weapon handling: per-fighter weapon state, first-person
// viewmodels built from boxes, and the pooled visual effects (tracers,
// impact puffs, muzzle flash) that sell every shot.

import * as THREE from 'three';
import { WEAPONS } from './config.js';

export class WeaponState {
  constructor(id) {
    this.def = WEAPONS[id];
    this.id = id;
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
    this.reloadT = 0;
    this.cool = 0;
  }
  get reloading() { return this.reloadT > 0; }
  startReload() {
    if (this.reloading || this.mag >= this.def.mag || this.reserve <= 0) return false;
    this.reloadT = this.def.reloadTime;
    return true;
  }
  finishReload() {
    const take = Math.min(this.def.mag - this.mag, this.reserve);
    this.mag += take; this.reserve -= take;
    this.reloadT = 0;
  }
}

export function damageAt(def, dist) {
  if (dist <= def.falloffStart) return def.damage;
  if (dist >= def.falloffEnd) return def.damage * def.falloffMin;
  const t = (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return def.damage * (1 - t * (1 - def.falloffMin));
}

const _v = new THREE.Vector3();
export function spreadDir(dir, spread, rng) {
  _v.set(dir.x + (rng() * 2 - 1) * spread, dir.y + (rng() * 2 - 1) * spread, dir.z + (rng() * 2 - 1) * spread);
  return _v.normalize().clone();
}

// ---------- viewmodels ----------

const gunmetal = new THREE.MeshStandardMaterial({ color: 0x2e3134, roughness: 0.42, metalness: 0.72 });
const polymer = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.8, metalness: 0.1 });
const tanMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.85, metalness: 0.05 });

function box(parent, mat, w, h, d, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rx) m.rotation.x = rx;
  parent.add(m);
  return m;
}
function tube(parent, mat, r, len, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Builds a right-handed viewmodel group; the barrel points down -Z and
// `muzzle` marks the barrel tip for flash placement.
export function buildViewmodel(id, accentColor) {
  const g = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5, metalness: 0.3, emissive: accentColor, emissiveIntensity: 0.25 });
  const muzzle = new THREE.Object3D();
  if (id === 'heron') {
    box(g, gunmetal, 0.055, 0.075, 0.21, 0, 0.02, -0.06);
    box(g, polymer, 0.05, 0.13, 0.07, 0, -0.075, 0.045, 0.25);
    box(g, gunmetal, 0.012, 0.03, 0.012, 0, 0.075, -0.15);
    box(g, accent, 0.057, 0.016, 0.05, 0, -0.005, -0.1);
    muzzle.position.set(0, 0.035, -0.18);
  } else if (id === 'rook') {
    box(g, gunmetal, 0.06, 0.09, 0.34, 0, 0.01, -0.1);
    tube(g, gunmetal, 0.026, 0.16, 0, 0.02, -0.36);
    box(g, polymer, 0.045, 0.15, 0.055, 0, -0.1, -0.05, 0.12);
    box(g, polymer, 0.05, 0.07, 0.14, 0, -0.01, 0.14);
    box(g, accent, 0.062, 0.018, 0.07, 0, 0.045, -0.2);
    muzzle.position.set(0, 0.02, -0.45);
  } else if (id === 'scatter') {
    tube(g, gunmetal, 0.032, 0.52, 0, 0.015, -0.22);
    box(g, tanMat, 0.055, 0.06, 0.16, 0, -0.015, -0.2);
    box(g, polymer, 0.06, 0.085, 0.2, 0, 0, 0.1);
    box(g, polymer, 0.052, 0.11, 0.07, 0, -0.06, 0.2, 0.2);
    muzzle.position.set(0, 0.015, -0.5);
  } else if (id === 'needle') {
    box(g, gunmetal, 0.055, 0.08, 0.4, 0, 0, -0.08);
    tube(g, gunmetal, 0.016, 0.5, 0, 0.025, -0.5);
    tube(g, polymer, 0.026, 0.17, 0, 0.085, -0.12);
    box(g, polymer, 0.045, 0.1, 0.05, 0, -0.085, -0.02, 0.1);
    box(g, polymer, 0.05, 0.07, 0.2, 0, -0.01, 0.22);
    box(g, accent, 0.057, 0.014, 0.06, 0, -0.02, -0.26);
    muzzle.position.set(0, 0.025, -0.76);
  } else { // longshore
    box(g, gunmetal, 0.06, 0.085, 0.36, 0, 0.005, -0.1);
    box(g, polymer, 0.052, 0.05, 0.24, 0, -0.005, -0.34);
    tube(g, gunmetal, 0.014, 0.2, 0, 0.02, -0.5);
    box(g, polymer, 0.042, 0.14, 0.05, 0, -0.1, -0.04, 0.1);
    box(g, polymer, 0.05, 0.07, 0.16, 0, -0.005, 0.17);
    box(g, gunmetal, 0.01, 0.045, 0.01, 0, 0.075, -0.42);
    box(g, accent, 0.062, 0.016, 0.06, 0, 0.03, -0.16);
    muzzle.position.set(0, 0.02, -0.6);
  }
  g.add(muzzle);
  return { group: g, muzzle };
}

// ---------- effects ----------

function glowTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const puffTex = glowTexture((ctx) => {
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(255,240,210,0.9)');
      g.addColorStop(0.5, 'rgba(200,180,150,0.35)');
      g.addColorStop(1, 'rgba(160,150,140,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    });
    const flashTex = glowTexture((ctx) => {
      ctx.translate(32, 32);
      ctx.fillStyle = 'rgba(255,210,120,0.95)';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, r = i % 2 ? 9 : 30;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 16);
      g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill();
    });
    this.puffTex = puffTex;
    this.flashTex = flashTex;

    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(tracerGeo, mat);
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.puffs = [];
    for (let i = 0; i < 36; i++) {
      const mat = new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.puffs.push({ sprite: s, life: 0, max: 1 });
    }
    this.flashLight = new THREE.PointLight(0xffc37a, 0, 13, 1.6);
    scene.add(this.flashLight);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flashSprite.scale.set(0.55, 0.55, 1);
    scene.add(this.flashSprite);
    this.flashLife = 0;
    this.ti = 0; this.pi = 0;
  }

  tracer(from, to, color) {
    const tr = this.tracers[this.ti++ % this.tracers.length];
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    tr.mesh.visible = true;
    tr.mesh.material.color.setHex(color);
    tr.mesh.material.opacity = 0.85;
    tr.mesh.position.copy(from).lerp(to, 0.5);
    tr.mesh.scale.set(1, 1, len);
    tr.mesh.lookAt(to);
    tr.life = 0.07;
  }

  impact(point, big = false) {
    const p = this.puffs[this.pi++ % this.puffs.length];
    p.sprite.visible = true;
    p.sprite.position.copy(point);
    p.max = big ? 0.4 : 0.26;
    p.life = p.max;
    p.sprite.material.opacity = 0.85;
    const s = big ? 0.85 : 0.45;
    p.sprite.scale.set(s, s, 1);
  }

  flash(worldPos) {
    this.flashSprite.position.copy(worldPos);
    this.flashSprite.material.rotation = Math.random() * Math.PI;
    this.flashSprite.material.opacity = 0.95;
    this.flashLight.position.copy(worldPos);
    this.flashLight.intensity = 26;
    this.flashLife = 0.045;
  }

  update(dt) {
    for (const tr of this.tracers) {
      if (!tr.mesh.visible) continue;
      tr.life -= dt;
      tr.mesh.material.opacity = Math.max(0, tr.life / 0.07) * 0.85;
      if (tr.life <= 0) tr.mesh.visible = false;
    }
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      const t = Math.max(0, p.life / p.max);
      p.sprite.material.opacity = t * 0.85;
      const s = p.sprite.scale.x + dt * 1.6;
      p.sprite.scale.set(s, s, 1);
      p.sprite.position.y += dt * 0.7;
      if (p.life <= 0) p.sprite.visible = false;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) {
        this.flashSprite.material.opacity = 0;
        this.flashLight.intensity = 0;
      }
    }
  }
}
