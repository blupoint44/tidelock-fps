// TIDELOCK — world building: turns mapdata into three.js geometry, canvas
// textures, colliders, and the bot navigation graph.

import * as THREE from 'three';
import { BOXES, NODES, SITES, SPAWNS, GROUND } from './mapdata.js';
import { makeRng } from './config.js';

function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function speckle(ctx, w, h, rng, n, alpha) {
  for (let i = 0; i < n; i++) {
    const g = 90 + Math.floor(rng() * 90);
    ctx.fillStyle = `rgba(${g},${g},${g - 8},${alpha})`;
    ctx.fillRect(rng() * w, rng() * h, 2, 2);
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.tickers = [];
    this.buildLights(scene);
    this.buildSky(scene);
    this.buildGround(scene);
    this.buildBoxes(scene);
    this.buildSkyline(scene);
    this.buildNav();
  }

  buildLights(scene) {
    const hemi = new THREE.HemisphereLight(0x8093c4, 0x3a2e24, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb377, 2.4);
    sun.position.set(-60, 38, -18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -62; sun.shadow.camera.right = 62;
    sun.shadow.camera.top = 48; sun.shadow.camera.bottom = -48;
    sun.shadow.camera.far = 180;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    this.sun = sun;
    scene.fog = new THREE.FogExp2(0x33283d, 0.0105);
  }

  buildSky(scene) {
    const geo = new THREE.SphereGeometry(320, 24, 12);
    const colors = [];
    const pos = geo.attributes.position;
    const top = new THREE.Color(0x1b2a4d), mid = new THREE.Color(0x6a5a7d), low = new THREE.Color(0xe8875a);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 320;
      const c = y > 0.25 ? mid.clone().lerp(top, (y - 0.25) / 0.75) : low.clone().lerp(mid, (y + 0.12) / 0.37);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false }));
    scene.add(sky);
  }

  buildGround(scene) {
    const W = GROUND.w, D = GROUND.d;
    const tex = canvasTexture(1024, 768, (ctx, w, h) => {
      const rng = makeRng(7101);
      ctx.fillStyle = '#43403c'; ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, rng, 9000, 0.16);
      // expansion joints
      ctx.strokeStyle = 'rgba(20,18,16,0.5)'; ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      const px = (x) => (x + W / 2) / W * w, pz = (z) => (z + D / 2) / D * h;
      // basin channel
      ctx.fillStyle = '#232830';
      ctx.fillRect(px(-6.4), pz(-27), px(4.4) - px(-6.4), pz(27) - pz(-27));
      // painted lane dashes
      ctx.fillStyle = 'rgba(232,220,180,0.5)';
      for (let x = -44; x < 44; x += 6) { ctx.fillRect(px(x), pz(-19.4), 26, 3); ctx.fillRect(px(x), pz(19.4), 26, 3); }
      // site washes and letters
      for (const s of Object.values(SITES)) {
        ctx.fillStyle = s.id === 'A' ? 'rgba(47,212,196,0.10)' : 'rgba(255,166,61,0.10)';
        ctx.fillRect(px(s.x0), pz(s.z0), px(s.x1) - px(s.x0), pz(s.z1) - pz(s.z0));
        ctx.strokeStyle = s.id === 'A' ? 'rgba(47,212,196,0.65)' : 'rgba(255,166,61,0.65)';
        ctx.lineWidth = 3;
        ctx.strokeRect(px(s.x0), pz(s.z0), px(s.x1) - px(s.x0), pz(s.z1) - pz(s.z0));
        ctx.fillStyle = s.id === 'A' ? 'rgba(47,212,196,0.5)' : 'rgba(255,166,61,0.5)';
        ctx.font = 'bold 90px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.id, px(s.plant[0]), pz(s.plant[1]));
      }
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.94, metalness: 0.02 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // basin water
    const wtex = canvasTexture(128, 256, (ctx, w, h) => {
      const rng = makeRng(331);
      ctx.fillStyle = '#16303f'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = `rgba(140,200,220,${0.05 + rng() * 0.10})`;
        ctx.fillRect(rng() * w, rng() * h, 8 + rng() * 22, 1.4);
      }
    }, [1, 6]);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(10.6, 53),
      new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.22, metalness: 0.55, color: 0x9fc4d4 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(-1, 0.55, 0);
    scene.add(water);
    this.tickers.push((dt, t) => { wtex.offset.y = (t * 0.014) % 1; });
  }

  materials() {
    const rng = makeRng(99);
    const concrete = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#8b8880'; ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, rng, 2600, 0.13);
      ctx.strokeStyle = 'rgba(40,38,34,0.55)'; ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    }, [2, 1]);
    const corrug = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#cfd0cc'; ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) {
        const g = ctx.createLinearGradient(x, 0, x + 32, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.34)'); g.addColorStop(0.45, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.30)');
        ctx.fillStyle = g; ctx.fillRect(x, 0, 32, h);
      }
      ctx.fillStyle = 'rgba(30,26,22,0.85)'; ctx.fillRect(0, 0, w, 10); ctx.fillRect(0, h - 10, w, 10);
      speckle(ctx, w, h, rng, 700, 0.10);
    }, [2, 1]);
    const crateTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#9a7a4e'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(52,36,18,0.8)'; ctx.lineWidth = 5;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
      speckle(ctx, w, h, rng, 500, 0.12);
    });
    const metalTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#5d666e'; ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, rng, 900, 0.14);
      ctx.fillStyle = 'rgba(240,200,90,0.85)';
      for (let x = 0; x < w; x += 32) ctx.fillRect(x, h - 12, 16, 12);
    });
    const std = (opts) => new THREE.MeshStandardMaterial(opts);
    return {
      wall: std({ map: concrete, roughness: 0.95 }),
      tower: std({ map: concrete, color: 0x8f96a3, roughness: 0.9 }),
      contA: std({ map: corrug, color: 0xb4502e, roughness: 0.72, metalness: 0.25 }),
      contB: std({ map: corrug, color: 0x2e6da8, roughness: 0.72, metalness: 0.25 }),
      contC: std({ map: corrug, color: 0x3f8f6d, roughness: 0.72, metalness: 0.25 }),
      crate: std({ map: crateTex, roughness: 0.9 }),
      metal: std({ map: metalTex, roughness: 0.6, metalness: 0.5 }),
      deck: std({ color: 0x707880, roughness: 0.55, metalness: 0.6 }),
      crane: std({ color: 0xc7a23a, roughness: 0.6, metalness: 0.4 }),
      machine: std({ color: 0x77828c, roughness: 0.45, metalness: 0.65 }),
      hall: std({ color: 0x4c5a68, roughness: 0.5, metalness: 0.55 }),
    };
  }

  buildBoxes(scene) {
    const mats = this.materials();
    const geoCache = new Map();
    const geoFor = (w, h, d) => {
      const k = w + 'x' + h + 'x' + d;
      if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
      return geoCache.get(k);
    };
    for (const [x, z, w, d, h, y0, kind] of BOXES) {
      const mesh = new THREE.Mesh(geoFor(w, h, d), mats[kind] || mats.wall);
      mesh.position.set(x, y0 + h / 2, z);
      mesh.castShadow = h > 1.2;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1: y0 + h });
      if (kind === 'hall') this.addHallWindows(scene, x, z, w, d, h);
      if (kind === 'tower') this.addTowerStrip(scene, x, z, y0 + h);
    }
    // site beacons: a pylon and a soft light at each plant point
    for (const s of Object.values(SITES)) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.13, 3.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.6 })
      );
      pole.position.set(s.plant[0], 1.7, s.plant[1]);
      scene.add(pole);
      const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: s.color, emissiveIntensity: 2.2 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), lampMat);
      lamp.position.set(s.plant[0], 3.5, s.plant[1]);
      scene.add(lamp);
      const light = new THREE.PointLight(s.color, 14, 17, 1.8);
      light.position.set(s.plant[0], 3.4, s.plant[1]);
      scene.add(light);
      this.tickers.push((dt, t) => { lampMat.emissiveIntensity = 1.9 + Math.sin(t * 2.2) * 0.55; });
    }
  }

  addHallWindows(scene, x, z, w, d, h) {
    const winMat = new THREE.MeshStandardMaterial({ color: 0x0c0f12, emissive: 0xffc37a, emissiveIntensity: 1.6 });
    for (let i = 0; i < 4; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), winMat);
      win.position.set(x - w / 2 - 0.03, 2.4 + (i % 2) * 2.2, z - 4 + Math.floor(i / 2) * 7.5 + (i % 2) * 1.2);
      win.rotation.y = -Math.PI / 2;
      scene.add(win);
    }
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x0c0f12, emissive: 0x2fd4c4, emissiveIntensity: 1.4 }));
    strip.position.set(x - w / 2 - 0.03, h - 0.7, z);
    strip.rotation.y = -Math.PI / 2;
    scene.add(strip);
  }

  addTowerStrip(scene, x, z, top) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.3, 4.15),
      new THREE.MeshStandardMaterial({ color: 0x0c0f12, emissive: 0xffa63d, emissiveIntensity: 1.3 }));
    strip.position.set(x, top - 0.5, z);
    scene.add(strip);
  }

  buildSkyline(scene) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x241f31 });
    const rng = makeRng(4242);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng() * 0.2;
      const r = 95 + rng() * 55;
      const h = 14 + rng() * 30, w = 10 + rng() * 16;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      m.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
      scene.add(m);
    }
  }

  // ---- collision & sight helpers ----

  groundYAt(x, z, refY) {
    let g = 0;
    for (const c of this.colliders) {
      if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) {
        if (c.y1 - refY <= 1.18 && c.y1 > g) g = c.y1;
      }
    }
    return g;
  }

  // Push a circle (x,z,r) at foot height feetY out of tall colliders.
  collide(pos, r, feetY) {
    for (const c of this.colliders) {
      if (c.y1 <= feetY + 1.18 || c.y0 >= feetY + 1.55) continue;
      const nx = Math.max(c.x0, Math.min(pos.x, c.x1));
      const nz = Math.max(c.z0, Math.min(pos.z, c.z1));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.z = nz + (dz / d) * r;
      } else {
        const left = pos.x - (c.x0 - r), right = (c.x1 + r) - pos.x;
        const back = pos.z - (c.z0 - r), fwd = (c.z1 + r) - pos.z;
        const m = Math.min(left, right, back, fwd);
        if (m === left) pos.x = c.x0 - r; else if (m === right) pos.x = c.x1 + r;
        else if (m === back) pos.z = c.z0 - r; else pos.z = c.z1 + r;
      }
    }
    pos.x = Math.max(-45.4, Math.min(45.4, pos.x));
    pos.z = Math.max(-31.4, Math.min(31.4, pos.z));
  }

  rayHit(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist, hit = null;
    for (const c of this.colliders) {
      let t0 = 0, t1 = best;
      // slab test per axis
      if (Math.abs(dx) < 1e-9) { if (ox < c.x0 || ox > c.x1) continue; }
      else {
        let ta = (c.x0 - ox) / dx, tb = (c.x1 - ox) / dx;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
      }
      if (Math.abs(dy) < 1e-9) { if (oy < c.y0 || oy > c.y1) continue; }
      else {
        let ta = (c.y0 - oy) / dy, tb = (c.y1 - oy) / dy;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) { if (oz < c.z0 || oz > c.z1) continue; }
      else {
        let ta = (c.z0 - oz) / dz, tb = (c.z1 - oz) / dz;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
      }
      if (t0 < best && t0 > 0.01) { best = t0; hit = c; }
    }
    return hit ? { dist: best, box: hit } : null;
  }

  // 2D line of sight at standing eye height: blocked by boxes at least
  // 1.6 m tall whose base is below eye level.
  losClear(ax, az, bx, bz) {
    for (const c of this.colliders) {
      if (c.y1 < 1.6 || c.y0 > 1.7) continue;
      if (segHitsBox(ax, az, bx, bz, c.x0 - 0.2, c.z0 - 0.2, c.x1 + 0.2, c.z1 + 0.2)) return false;
    }
    return true;
  }

  buildNav() {
    this.nodes = NODES.map(([x, z, tag]) => ({ x, z, tag, edges: [] }));
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j];
        const dx = a.x - b.x, dz = a.z - b.z;
        if (dx * dx + dz * dz <= 17 * 17 && this.losClear(a.x, a.z, b.x, b.z)) {
          a.edges.push(j); b.edges.push(i);
        }
      }
    }
  }

  nearestNode(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i], dx = n.x - x, dz = n.z - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Breadth-first path from (sx,sz) to (tx,tz); returns waypoint list of
  // {x,z} ending exactly at the target (empty if already there).
  findPath(sx, sz, tx, tz) {
    if (this.losClear(sx, sz, tx, tz) && Math.hypot(tx - sx, tz - sz) < 18) return [{ x: tx, z: tz }];
    const start = this.nearestNode(sx, sz), goal = this.nearestNode(tx, tz);
    if (start === goal) return [{ x: tx, z: tz }];
    const prev = new Map([[start, -1]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const nb of this.nodes[cur].edges) {
        if (!prev.has(nb)) { prev.set(nb, cur); queue.push(nb); }
      }
    }
    if (!prev.has(goal)) return [{ x: tx, z: tz }];
    const path = [];
    let cur = goal;
    while (cur !== -1) { path.push({ x: this.nodes[cur].x, z: this.nodes[cur].z }); cur = prev.get(cur); }
    path.reverse();
    path.push({ x: tx, z: tz });
    return path;
  }
}

function segHitsBox(ax, az, bx, bz, x0, z0, x1, z1) {
  // Liang–Barsky clip of the segment against the box.
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dz, dz], q = [ax - x0, x1 - ax, az - z0, z1 - az];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; }
    else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return t0 <= t1;
}

export { SITES, SPAWNS };
