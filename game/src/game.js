// TIDELOCK — game orchestration: match and round flow, the economy, bot
// plans, shared combat resolution for the player and the bots, the Surge
// Charge (plant / vent / detonate), and the first-person camera.

import * as THREE from 'three';
import { World, SITES, SPAWNS } from './world.js';
import { Bot, rayHitFighter } from './bots.js';
import { Player } from './player.js';
import { WeaponState, buildViewmodel, damageAt, spreadDir, Effects } from './weapons.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import {
  TEAMS, MATCH, WEAPONS, BUY_ORDER, ARMOR_PRICE, HELMET_PRICE,
  makeRng, clamp, dist2d, fmtMoney,
} from './config.js';
import { HOLD_POINTS } from './mapdata.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _t = new THREE.Vector3();

export class Game {
  constructor(container, opts = {}) {
    this.opts = opts;
    this.rng = makeRng(opts.seed || 20261115);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = !opts.lowGfx;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, container.clientWidth / container.clientHeight, 0.08, 420);
    this.camera.rotation.order = 'YXZ';
    this.world = new World(this.scene);
    if (opts.lowGfx) this.world.sun.castShadow = false;
    this.effects = new Effects(this.scene);
    this.audio = new AudioSys();
    this.input = new Input(this.renderer.domElement);
    this.hud = new HUD();

    this.player = new Player();
    this.player.money = MATCH.startMoney;
    this.bots = [];
    for (let i = 0; i < MATCH.teamSize - 1; i++) {
      const b = new Bot(this.scene, 'breakers', null, makeRng(500 + i * 131));
      b.money = MATCH.startMoney; this.bots.push(b);
    }
    for (let i = 0; i < MATCH.teamSize; i++) {
      const b = new Bot(this.scene, 'wardens', null, makeRng(900 + i * 173));
      b.money = MATCH.startMoney; this.bots.push(b);
    }
    this.fighters = [this.player, ...this.bots];
    // park everyone at their spawns so the title backdrop shows the yard held, not a pile at origin
    {
      let bi = 1, wi = 0;
      for (const b of this.bots) {
        if (b.team === 'breakers') b.reset(SPAWNS.breakers[bi++ % SPAWNS.breakers.length], -Math.PI / 2);
        else b.reset(SPAWNS.wardens[wi++ % SPAWNS.wardens.length], Math.PI / 2);
      }
    }

    this.mode = 'title'; // title | playing | paused | end
    this.phase = 'buy'; // buy | live | planted | over
    this.phaseT = 0;
    this.now = 0;
    this.round = 0;
    this.score = { wardens: 0, breakers: 0 };
    this.lossStreak = { wardens: 0, breakers: 0 };
    this.charge = null; // {state:'carried'|'dropped'|'planted', carrier, pos, site}
    this.channel = null; // {fighter, kind:'plant'|'defuse', t, need, site}
    this.lastShot = { wardens: null, breakers: null }; // noise per team
    this.recoil = 0;
    this.buyOpen = false;
    this.prevFiring = false;
    this.beepT = 0;
    this.boomT = 0;
    this.shotCamera = null;
    this.deathCamT = 0;

    this.buildViewmodelAnchor();
    this.buildChargeProp();
    this.bindUi();
    window.addEventListener('resize', () => this.onResize(container));
  }

  // ---------- setup helpers ----------

  buildViewmodelAnchor() {
    this.vmAnchor = new THREE.Group();
    this.camera.add(this.vmAnchor);
    // a soft warm light riding the camera keeps the viewmodel readable
    const vmLight = new THREE.PointLight(0xffd9b0, 0.55, 4.5);
    vmLight.position.set(0.15, 0.05, -0.25);
    this.camera.add(vmLight);
    this.scene.add(this.camera);
    this.vm = null; this.vmMuzzle = null; this.vmFor = null;
  }

  buildChargeProp() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x35383c, roughness: 0.5, metalness: 0.5 }));
    body.position.y = 0.11; g.add(body);
    this.chargeLampMat = new THREE.MeshStandardMaterial({ color: 0x110b06, emissive: 0xffa63d, emissiveIntensity: 2.4 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), this.chargeLampMat);
    lamp.position.y = 0.25; g.add(lamp);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.25),
      new THREE.MeshStandardMaterial({ color: 0xffa63d, roughness: 0.6 }));
    stripe.position.y = 0.05; g.add(stripe);
    g.visible = false;
    this.scene.add(g);
    this.chargeProp = g;
  }

  bindUi() {
    const start = () => { this.audio.ensure(); this.startMatch(); this.input.lock(); };
    document.getElementById('btn-play').addEventListener('click', start);
    document.getElementById('btn-again').addEventListener('click', start);
    document.getElementById('btn-restart').addEventListener('click', start);
    document.getElementById('btn-resume').addEventListener('click', () => { this.audio.ensure(); this.input.lock(); });
    this.input.onLockChange = (locked) => {
      if (!locked && this.mode === 'playing') {
        this.mode = 'paused';
        document.getElementById('menu-pause').classList.add('on');
      } else if (locked && this.mode === 'paused') {
        this.mode = 'playing';
        document.getElementById('menu-pause').classList.remove('on');
      }
    };
    this.input.onKey = (code) => this.onKey(code);
  }

  onResize(container) {
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  onKey(code) {
    if (this.mode !== 'playing') return;
    if (this.phase === 'buy' && this.buyOpen) {
      const buys = { Digit1: 'rook', Digit2: 'scatter', Digit3: 'longshore', Digit4: 'needle' };
      if (buys[code]) { this.buyWeapon(buys[code]); return; }
      if (code === 'Digit5') { this.buyArmor(); return; }
      if (code === 'Digit6') { this.buyHelmet(); return; }
    }
    if (code === 'KeyB' && this.phase === 'buy') { this.buyOpen = !this.buyOpen; return; }
    if (code === 'Digit1' && this.player.weapons.sidearm) this.switchSlot('sidearm');
    if (code === 'Digit2' && this.player.weapons.primary) this.switchSlot('primary');
    if (code === 'KeyR') { if (this.player.weapon.startReload()) this.audio.reloadStart(); }
  }

  switchSlot(slot) {
    if (this.player.slot === slot || this.player.switchT > 0) return;
    this.player.slot = slot;
    this.player.switchT = 0.32;
    this.refreshViewmodel();
  }

  refreshViewmodel() {
    if (this.vm) { this.vmAnchor.remove(this.vm); }
    const w = this.player.weapon;
    const built = buildViewmodel(w.id, TEAMS.breakers.color);
    built.group.scale.setScalar(0.7);
    this.vm = built.group; this.vmMuzzle = built.muzzle;
    this.vmAnchor.add(this.vm);
  }

  // ---------- match / round flow ----------

  startMatch() {
    this.score = { wardens: 0, breakers: 0 };
    this.lossStreak = { wardens: 0, breakers: 0 };
    this.round = 0;
    for (const f of this.fighters) {
      f.money = MATCH.startMoney; f.kills = 0; f.deaths = 0;
      f.armor = 0; f.helmet = false;
      if (f.isPlayer) { f.weapons.primary = null; f.weapons.sidearm = new WeaponState('heron'); f.slot = 'sidearm'; }
      else { f.primary = null; f.weapon = new WeaponState('heron'); }
    }
    document.getElementById('menu-title').classList.remove('on');
    document.getElementById('menu-end').classList.remove('on');
    document.getElementById('menu-pause').classList.remove('on');
    this.hud.showHud(true);
    this.mode = 'playing';
    this.startRound();
  }

  startRound() {
    this.round++;
    this.phase = 'buy';
    this.phaseT = MATCH.buyTime;
    this.channel = null;
    this.sitePlan = this.rng() < 0.5 ? 'A' : 'B';
    // spawns
    const bs = SPAWNS.breakers, ws = SPAWNS.wardens;
    this.player.reset(bs[0], -Math.PI / 2);
    let bi = 1, wi = 0;
    for (const b of this.bots) {
      if (b.team === 'breakers') b.reset(bs[bi++ % bs.length], -Math.PI / 2);
      else b.reset(ws[wi++ % ws.length], Math.PI / 2);
      refill(b.weapon); if (b.primary) refill(b.primary);
    }
    refill(this.player.weapons.sidearm); if (this.player.weapons.primary) refill(this.player.weapons.primary);
    this.refreshViewmodel();
    // the player carries the Surge Charge
    this.charge = { state: 'carried', carrier: this.player, pos: null, site: null };
    this.assignIntents();
    this.botBuyPhase();
    this.buyOpen = true;
    this.hud.setScore(this.score.wardens, this.score.breakers, this.round);
    this.hud.banner('ROUND ' + this.round, 'Breakers make for ' + (this.sitePlan === 'A' ? 'Sluice A' : 'Pump Hall B') + ' — supply up', '#ffffff', 2.4);
  }

  assignIntents() {
    const plan = this.sitePlan;
    const other = plan === 'A' ? 'B' : 'A';
    let pushers = 0;
    for (const b of this.bots) {
      if (b.team !== 'breakers') continue;
      if (pushers < 2) b.intent = { type: 'push', site: plan };
      else b.intent = { type: 'push', site: other };
      pushers++;
    }
    const holds = [...HOLD_POINTS.A, ...HOLD_POINTS.B];
    let hi = 0;
    for (const b of this.bots) {
      if (b.team !== 'wardens') continue;
      const site = hi < 2 ? 'A' : 'B';
      b.intent = { type: 'hold', site, point: holds[hi] };
      hi++;
    }
  }

  botBuyPhase() {
    for (const b of this.bots) {
      if (!b.alive) continue;
      if (b.armor < 100 && b.money >= ARMOR_PRICE) { b.money -= ARMOR_PRICE; b.armor = 100; }
      if (!b.primary) {
        const afford = BUY_ORDER.filter((id) => WEAPONS[id].price <= b.money);
        if (afford.length) {
          let pick = afford[afford.length - 1];
          if (this.rng() < 0.3) pick = afford[Math.floor(this.rng() * afford.length)];
          b.money -= WEAPONS[pick].price;
          b.primary = new WeaponState(pick);
          b.weapon = b.primary;
        }
      }
      if (!b.helmet && b.money >= HELMET_PRICE + 200) { b.money -= HELMET_PRICE; b.helmet = true; }
    }
  }

  buyWeapon(id) {
    const p = this.player;
    if (p.weapons.primary && p.weapons.primary.id === id) { this.audio.denied(); return; }
    if (p.money < WEAPONS[id].price) { this.audio.denied(); return; }
    p.money -= WEAPONS[id].price;
    p.weapons.primary = new WeaponState(id);
    p.slot = 'primary';
    p.switchT = 0.3;
    this.refreshViewmodel();
    this.audio.buy();
  }
  buyArmor() {
    const p = this.player;
    if (p.armor >= 100 || p.money < ARMOR_PRICE) { this.audio.denied(); return; }
    p.money -= ARMOR_PRICE; p.armor = 100; this.audio.buy();
  }
  buyHelmet() {
    const p = this.player;
    if (p.helmet || p.money < HELMET_PRICE) { this.audio.denied(); return; }
    p.money -= HELMET_PRICE; p.helmet = true; this.audio.buy();
  }

  endRound(winner, reason) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.phaseT = MATCH.endTime;
    this.channel = null;
    this.score[winner]++;
    const loser = winner === 'wardens' ? 'breakers' : 'wardens';
    this.lossStreak[winner] = 0;
    this.lossStreak[loser]++;
    const lossPay = MATCH.lossReward + Math.min(MATCH.maxLossBonus, (this.lossStreak[loser] - 1) * MATCH.lossStreakStep);
    for (const f of this.fighters) {
      f.money = Math.min(MATCH.maxMoney, f.money + (f.team === winner ? MATCH.winReward : lossPay));
    }
    const won = winner === 'breakers';
    this.hud.banner(won ? 'ROUND WON' : 'ROUND LOST', TEAMS[winner].name + ' — ' + reason, won ? TEAMS.breakers.css : TEAMS.wardens.css, 3.4);
    this.hud.setScore(this.score.wardens, this.score.breakers, this.round);
    this.audio.sting(won);
    this.buyOpen = false;
  }

  endMatch() {
    this.mode = 'end';
    this.input.unlock();
    const won = this.score.breakers > this.score.wardens;
    document.getElementById('end-title').textContent = won ? 'THE LOCK IS YOURS' : 'THE LOCK HOLDS';
    document.getElementById('end-title').style.color = won ? TEAMS.breakers.css : TEAMS.wardens.css;
    document.getElementById('end-sub').textContent =
      'Breakers ' + this.score.breakers + ' — ' + this.score.wardens + ' Wardens';
    document.getElementById('end-stats').innerHTML =
      'Your kills: <b>' + this.player.kills + '</b> · deaths: <b>' + this.player.deaths + '</b><br>' +
      'Rounds played: ' + this.round;
    document.getElementById('menu-end').classList.add('on');
    this.hud.showHud(false);
  }

  // ---------- charge ----------

  dropCharge(pos) {
    this.charge = { state: 'dropped', carrier: null, pos: { x: pos.x, z: pos.z }, site: null };
    // nearest pushing breaker bot goes to recover it
    let best = null, bd = Infinity;
    for (const b of this.bots) {
      if (b.team !== 'breakers' || !b.alive) continue;
      const d = dist2d(b.pos.x, b.pos.z, pos.x, pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) best.intent = { type: 'recover' };
  }

  plantCharge(site, planter) {
    const s = SITES[site];
    this.charge = { state: 'planted', carrier: null, pos: { x: s.plant[0], z: s.plant[1] }, site };
    this.phase = 'planted';
    this.phaseT = MATCH.chargeTime;
    this.beepT = 0;
    planter.money = Math.min(MATCH.maxMoney, planter.money + MATCH.plantReward);
    this.hud.banner('SURGE CHARGE PLANTED', 'Site ' + site + ' — Wardens must vent it', TEAMS.breakers.css, 2.6);
    this.audio.beep(true);
    // wardens converge: nearest vents, the rest rotate in
    let vent = null, bd = Infinity;
    for (const b of this.bots) {
      if (b.team !== 'wardens' || !b.alive) continue;
      const d = dist2d(b.pos.x, b.pos.z, s.plant[0], s.plant[1]);
      if (d < bd) { bd = d; vent = b; }
    }
    for (const b of this.bots) {
      if (b.team !== 'wardens' || !b.alive) continue;
      b.intent = b === vent ? { type: 'defuse', site } : { type: 'rotate', site };
    }
    for (const b of this.bots) {
      if (b.team === 'breakers' && b.alive) b.intent = { type: 'guard', site };
    }
  }

  // ---------- bot objectives ----------

  objectiveFor(bot) {
    const it = bot.intent || { type: 'push', site: 'A' };
    if (it.type === 'push') {
      const s = SITES[it.site];
      return { point: { x: s.plant[0], z: s.plant[1] }, arrive: 2.6, face: { x: 60, z: s.plant[1] } };
    }
    if (it.type === 'plant') {
      const s = SITES[it.site];
      return { point: { x: s.plant[0], z: s.plant[1] }, arrive: 1.15 };
    }
    if (it.type === 'hold') return { point: { x: it.point[0], z: it.point[1] }, arrive: 1.1, face: { x: -40, z: it.point[1] } };
    if (it.type === 'recover' && this.charge && this.charge.state === 'dropped') {
      return { point: this.charge.pos, arrive: 1.15 };
    }
    if (it.type === 'defuse' && this.charge) return { point: this.charge.pos, arrive: 1.1 };
    if (it.type === 'rotate' && this.charge) {
      const s = SITES[it.site];
      return { point: { x: s.plant[0] - 6, z: s.plant[1] }, arrive: 2.4, face: this.charge.pos };
    }
    if (it.type === 'guard') {
      const pts = HOLD_POINTS[it.site];
      const p = pts[bot.id % pts.length];
      return { point: { x: p[0], z: p[1] }, arrive: 1.4, face: { x: -40, z: p[1] } };
    }
    return null;
  }

  // ---------- combat ----------

  fireWeapon(f, origin, dir, spreadRad, muzzlePos) {
    const w = f.weapon;
    if (!w || w.reloading || w.cool > 0) return false;
    if (w.mag <= 0) { if (f.isPlayer) this.audio.dryFire(); w.cool = 0.32; return false; }
    w.mag--;
    w.cool = 60 / w.def.rpm;
    const def = w.def;
    for (let p = 0; p < def.pellets; p++) {
      const d = spreadDir(dir, spreadRad, Math.random);
      const wall = this.world.rayHit(origin.x, origin.y, origin.z, d.x, d.y, d.z, 240);
      let bestT = wall ? wall.dist : 240;
      let victim = null, head = false;
      for (const e of this.fighters) {
        if (e === f || e.team === f.team || !e.alive) continue;
        const h = rayHitFighter(e, origin, d, bestT);
        if (h) { bestT = h.dist; victim = e; head = h.head; }
      }
      _t.copy(origin).addScaledVector(d, bestT);
      this.effects.tracer(muzzlePos, _t, def.tracer);
      if (victim) {
        this.applyDamage(victim, damageAt(def, bestT), head, f, def);
        this.effects.impact(_t, head);
      } else if (wall) {
        this.effects.impact(_t, false);
      }
    }
    this.effects.flash(muzzlePos);
    const dMe = f.isPlayer ? 0 : dist2d(f.pos.x, f.pos.z, this.player.pos.x, this.player.pos.z);
    this.audio.shot(def.id, dMe);
    this.lastShot[f.team] = { pos: { x: f.pos.x, z: f.pos.z }, t: this.now };
    if (f.isPlayer) {
      this.recoil = Math.min(0.09, this.recoil + def.kick * (this.player.adsT > 0.5 ? 0.55 : 1));
      if (w.mag === 0) this.hud.setHint('R — RELOAD');
    }
    return true;
  }

  applyDamage(target, dmg, head, attacker, def) {
    if (!target.alive) return;
    if (head && target.helmet) dmg *= 0.55;
    let hpDmg = dmg;
    if (target.armor > 0) {
      const absorbed = Math.min(target.armor, dmg * 0.55);
      target.armor -= absorbed;
      hpDmg = dmg - absorbed;
    }
    target.hp -= hpDmg;
    if (target.isPlayer) { this.hud.damageFlash(); this.audio.hurt(); }
    if (attacker.isPlayer) { this.hud.hitmarker(head); this.audio.hit(head); }
    if (target.hp <= 0) this.kill(target, attacker, head, def);
  }

  kill(target, attacker, head, def) {
    target.alive = false;
    target.hp = 0;
    target.deaths++;
    target.channel = null;
    if (this.channel && this.channel.fighter === target) this.channel = null;
    // the dead drop their gear and the charge
    if (!target.isPlayer) { target.primary = null; target.weapon = target.weapon.def.slot === 'primary' ? new WeaponState('heron') : target.weapon; }
    else if (target.weapons.primary) { target.weapons.primary = null; target.slot = 'sidearm'; this.refreshViewmodel(); }
    target.armor = 0; target.helmet = false;
    if (attacker && attacker !== target) {
      attacker.kills++;
      attacker.money = Math.min(MATCH.maxMoney, attacker.money + MATCH.killReward);
      if (attacker.isPlayer) this.audio.kill();
      const kc = attacker.team === 'wardens' ? 'kw' : 'kb';
      const vc = target.team === 'wardens' ? 'kw' : 'kb';
      this.hud.killfeed(
        `<span class="${kc}">${attacker.name}</span> <span class="wpn">${def ? def.name : ''}</span> ` +
        `<span class="${vc}">${target.name}</span>${head ? ' <span class="hs">HEADSHOT</span>' : ''}`);
    }
    if (this.charge && this.charge.state === 'carried' && this.charge.carrier === target) {
      this.dropCharge(target.pos);
    }
    if (target.isPlayer) this.deathCamT = 0.001;
    this.checkTeamWipe();
  }

  aliveCount(team) { return this.fighters.filter((f) => f.team === team && f.alive).length; }

  checkTeamWipe() {
    if (this.phase === 'live') {
      if (this.aliveCount('wardens') === 0) this.endRound('breakers', 'Wardens eliminated');
      else if (this.aliveCount('breakers') === 0) this.endRound('wardens', 'Breakers eliminated');
    } else if (this.phase === 'planted') {
      if (this.aliveCount('wardens') === 0) this.endRound('breakers', 'No Wardens left to vent the charge');
    }
  }

  // ---------- per-frame ----------

  update(dt) {
    const t = performance.now() / 1000;
    for (const fn of this.world.tickers) fn(dt, t);
    this.effects.update(this.staticScene ? 0.004 : dt);
    this.hud.update(dt);
    this.chargeLampMat.emissiveIntensity = 1.8 + Math.sin(t * (this.charge && this.charge.state === 'planted' ? 9 : 3)) * 1.1;
    this.updateChargeProp();

    if (this.shotCamera) {
      this.camera.position.copy(this.shotCamera.pos);
      this.camera.lookAt(this.shotCamera.look);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.staticScene) {
      // posed first-person screenshot scene: camera and effects only
      this.updateCamera(0.016);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.mode !== 'playing') {
      // title backdrop: slow orbit over the yard
      const a = t * 0.05;
      this.camera.position.set(Math.cos(a) * 30, 16 + Math.sin(t * 0.13) * 2, Math.sin(a) * 30);
      this.camera.lookAt(0, 1, 0);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.now += dt;
    this.phaseLogic(dt);
    this.updateFighters(dt);
    this.updatePlayerCombat(dt);
    this.updateCamera(dt);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
  }

  phaseLogic(dt) {
    if (this.phase === 'buy') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'live';
        this.phaseT = MATCH.roundTime;
        this.buyOpen = false;
        this.hud.banner('ROUND LIVE', '', '#ffffff', 1.1);
      }
    } else if (this.phase === 'live') {
      this.phaseT -= dt;
      this.updateChannels(dt);
      if (this.phaseT <= 0 && this.phase !== 'planted') {
        this.endRound('wardens', 'Time expired — the sites held');
      }
    } else if (this.phase === 'planted') {
      this.phaseT -= dt;
      this.updateChannels(dt);
      this.beepT -= dt;
      if (this.beepT <= 0) {
        this.beepT = this.phaseT < 6 ? 0.28 : 0.85;
        this.audio.beep(this.phaseT < 6);
      }
      if (this.phaseT <= 0) {
        this.boom();
        this.endRound('breakers', 'The Surge Charge detonated');
      }
    } else if (this.phase === 'over') {
      this.phaseT -= dt;
      if (this.boomT > 0) this.boomT -= dt;
      if (this.phaseT <= 0) {
        if (this.score.wardens >= MATCH.roundsToWin || this.score.breakers >= MATCH.roundsToWin || this.round >= MATCH.maxRounds) this.endMatch();
        else this.startRound();
      }
    }
  }

  boom() {
    if (!this.charge || !this.charge.pos) return;
    const p = this.charge.pos;
    _t.set(p.x, 1, p.z);
    for (let i = 0; i < 9; i++) {
      _m.set(p.x + (Math.random() - 0.5) * 3.4, 0.8 + Math.random() * 2.2, p.z + (Math.random() - 0.5) * 3.4);
      this.effects.impact(_m, true);
    }
    this.effects.flash(_t);
    this.audio.explosion();
    this.boomT = 0.7;
    const d = dist2d(p.x, p.z, this.player.pos.x, this.player.pos.z);
    if (d < 16) this.recoil = Math.min(0.12, this.recoil + (16 - d) * 0.008);
  }

  updateChannels(dt) {
    // start channels for bots whose intent is fulfilled at the objective
    if (!this.channel && (this.phase === 'live' || this.phase === 'planted')) {
      for (const b of this.bots) {
        if (!b.alive) continue;
        if (this.phase === 'live' && this.charge && this.charge.state === 'carried' && this.charge.carrier === b) {
          const s = SITES[b.intent.site || this.sitePlan];
          if (dist2d(b.pos.x, b.pos.z, s.plant[0], s.plant[1]) < 1.25) {
            this.channel = { fighter: b, kind: 'plant', t: 0, need: MATCH.plantTime, site: b.intent.site || this.sitePlan };
            b.channel = 'plant'; b.channelPos = { x: s.plant[0], z: s.plant[1] };
          }
        }
        if (this.phase === 'planted' && b.intent.type === 'defuse' && this.charge) {
          if (dist2d(b.pos.x, b.pos.z, this.charge.pos.x, this.charge.pos.z) < 1.25) {
            this.channel = { fighter: b, kind: 'defuse', t: 0, need: MATCH.defuseTime, site: this.charge.site };
            b.channel = 'defuse'; b.channelPos = this.charge.pos;
          }
        }
      }
    }
    // player channel (planting) via E key
    const p = this.player;
    if (!this.channel && this.phase === 'live' && p.alive && this.charge && this.charge.state === 'carried' && this.charge.carrier === p) {
      const site = this.siteAt(p.pos.x, p.pos.z);
      if (site && this.input.down('KeyE') && p.speed2d < 0.6) {
        this.channel = { fighter: p, kind: 'plant', t: 0, need: MATCH.plantTime, site };
        p.channel = 'plant';
      }
    }
    if (!this.channel) return;
    const ch = this.channel;
    const f = ch.fighter;
    // interruption: death handled in kill(); bots break off to fight
    if (!f.isPlayer && f.target && this.now - f.lastSeenT < 0.3) { this.cancelChannel(); return; }
    if (f.isPlayer && (p.speed2d > 0.9 || !this.input.down('KeyE') || this.input.firing)) { this.cancelChannel(); return; }
    ch.t += dt;
    if (Math.floor(ch.t * 2) !== Math.floor((ch.t - dt) * 2)) this.audio.beep(false);
    if (ch.t >= ch.need) {
      const kind = ch.kind, site = ch.site;
      this.cancelChannel();
      if (kind === 'plant') this.plantCharge(site, f);
      else { this.audio.beep(true); this.endRound('wardens', 'The charge was vented in time'); }
    }
  }

  cancelChannel() {
    if (this.channel) {
      this.channel.fighter.channel = null;
      this.channel = null;
    }
  }

  siteAt(x, z) {
    for (const s of Object.values(SITES)) {
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s.id;
    }
    return null;
  }

  updateFighters(dt) {
    const frozen = this.phase === 'buy' || this.phase === 'over';
    // player
    this.player.update(dt, this.input, this.world, {
      frozen: frozen || !this.player.alive,
      onStep: (run) => this.audio.step(run),
    });
    // weapon cooldowns for everyone
    for (const f of this.fighters) {
      if (f.weapon && f.weapon.cool > 0) f.weapon.cool -= dt;
    }
    if (this.player.justReloaded) { this.player.justReloaded = false; this.audio.reloadEnd(); }

    // charge pickup by walking over a dropped charge
    if (this.charge && this.charge.state === 'dropped') {
      for (const f of this.fighters) {
        if (f.team !== 'breakers' || !f.alive) continue;
        if (dist2d(f.pos.x, f.pos.z, this.charge.pos.x, this.charge.pos.z) < 1.35) {
          this.charge = { state: 'carried', carrier: f, pos: null, site: null };
          if (!f.isPlayer) f.intent = { type: 'plant', site: this.sitePlan };
          break;
        }
      }
    }

    // bots
    for (const b of this.bots) {
      if (frozen) { b.updateVisual(dt, 0); continue; }
      const enemyTeam = b.team === 'wardens' ? 'breakers' : 'wardens';
      const noise = this.lastShot[enemyTeam];
      const ctx = {
        world: this.world, dt, now: this.now,
        enemies: this.fighters.filter((f) => f.team === enemyTeam),
        noisePos: noise ? noise.pos : null, noiseT: noise ? noise.t : -9,
        objectiveFor: (bot) => this.objectiveFor(bot),
        fire: (bot, target) => this.botFire(bot, target),
        onReload: () => {},
      };
      b.update(ctx);
    }
  }

  botFire(bot, target) {
    const muzzle = bot.muzzleRef.getWorldPosition(_m);
    const eye = bot.eyePos(_o);
    const aimY = this.rng() < 0.22 ? 1.5 : 1.08;
    _t.set(
      target.pos.x + (this.rng() * 2 - 1) * 0.3 * bot.aimErr * (1 + dist2d(bot.pos.x, bot.pos.z, target.pos.x, target.pos.z) * 0.05),
      target.pos.y + aimY + (this.rng() * 2 - 1) * 0.16 * bot.aimErr,
      target.pos.z + (this.rng() * 2 - 1) * 0.3 * bot.aimErr
    );
    _d.copy(_t).sub(eye).normalize();
    this.fireWeapon(bot, eye.clone(), _d, bot.weapon.def.spread * 0.9, muzzle.clone());
  }

  updatePlayerCombat(dt) {
    const p = this.player;
    if (!p.alive || this.phase === 'buy' || this.phase === 'over' || this.buyOpen) { this.prevFiring = this.input.firing; return; }
    const w = p.weapon;
    const wantFire = this.input.firing && (w.def.auto || !this.prevFiring);
    this.prevFiring = this.input.firing;
    if (wantFire && p.switchT <= 0 && !p.channel) {
      const eye = p.eyePos(_o);
      _d.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)).normalize();
      const spread = (w.def.spread * (1 - p.adsT * 0.55) + w.def.moveSpread * p.moveFactor()) * (p.crouching ? 0.8 : 1);
      this.camera.updateMatrixWorld();
      const muzzle = this.vmMuzzle ? this.vmMuzzle.getWorldPosition(_m) : eye;
      this.fireWeapon(p, eye.clone(), _d.clone(), spread, muzzle.clone());
    }
  }

  updateCamera(dt) {
    const p = this.player;
    this.recoil *= Math.pow(0.0001, dt); // fast recovery
    if (this.recoil < 0.0005) this.recoil = 0;
    if (!p.alive) {
      this.deathCamT += dt;
      const drop = Math.min(1, this.deathCamT / 0.8);
      this.camera.position.set(p.pos.x, p.pos.y + 1.6 - drop * 1.25, p.pos.z);
      this.camera.rotation.set(-0.4 * drop, p.yaw, 0.5 * drop);
      this.vmAnchor.visible = false;
      return;
    }
    this.vmAnchor.visible = true;
    const bobY = Math.sin(p.bobPhase * 2) * 0.021 * p.bobAmt;
    const eye = p.eyePos(_o);
    this.camera.position.set(eye.x, eye.y + bobY, eye.z);
    this.camera.rotation.set(p.pitch + this.recoil, p.yaw, 0);
    // viewmodel placement: hip vs aimed
    const ads = p.adsT;
    const vm = this.vmAnchor;
    const bobX = Math.sin(p.bobPhase) * 0.011 * p.bobAmt;
    let dip = 0;
    if (p.switchT > 0) dip = -Math.sin((p.switchT / 0.32) * Math.PI) * 0.17;
    if (p.weapon && p.weapon.reloading) dip = -Math.sin(Math.min(1, 1 - p.weapon.reloadT / p.weapon.def.reloadTime) * Math.PI) * 0.22;
    vm.position.set(
      0.25 * (1 - ads) + bobX * (1 - ads),
      -0.235 + ads * 0.1825 + Math.abs(Math.cos(p.bobPhase)) * 0.008 * p.bobAmt + dip,
      -0.5 - this.recoil * 0.7
    );
    vm.rotation.set(this.recoil * 1.4 + (dip ? -dip * 1.1 : 0), 0, 0);
    const fov = 74 - ads * (p.weapon.def.zoom > 2 ? 34 : 13);
    if (Math.abs(this.camera.fov - fov) > 0.1) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 12); this.camera.updateProjectionMatrix(); }
  }

  updateChargeProp() {
    const c = this.charge;
    if (!c) { this.chargeProp.visible = false; return; }
    if (c.state === 'carried') {
      const carrier = c.carrier;
      if (carrier && carrier.isPlayer) { this.chargeProp.visible = false; return; }
      if (carrier && carrier.alive) {
        this.chargeProp.visible = true;
        this.chargeProp.position.set(
          carrier.pos.x + Math.sin(carrier.yaw) * 0.3,
          carrier.pos.y + 1.18,
          carrier.pos.z + Math.cos(carrier.yaw) * 0.3
        );
        this.chargeProp.rotation.y = carrier.yaw;
        return;
      }
      this.chargeProp.visible = false;
      return;
    }
    this.chargeProp.visible = true;
    this.chargeProp.position.set(c.pos.x, this.world.groundYAt(c.pos.x, c.pos.z, 0), c.pos.z);
    this.chargeProp.rotation.y = 0.6;
  }

  updateHud() {
    const p = this.player;
    const mode = this.phase === 'planted' ? 'charge' : this.phase === 'buy' ? 'buy' : 'live';
    this.hud.setClock(Math.max(0, this.phaseT), mode);
    this.hud.setVitals(p.hp, p.armor);
    this.hud.setMoney(p.money);
    const w = p.weapon;
    this.hud.setAmmo(w.mag, w.reserve, w.def.name.toUpperCase());
    this.hud.setCarry(!!(this.charge && this.charge.state === 'carried' && this.charge.carrier === p && p.alive));
    const spreadPx = 6 + (w.def.spread + w.def.moveSpread * p.moveFactor()) * 620;
    this.hud.setCrossSpread(spreadPx);
    // channel bar
    if (this.channel && this.channel.fighter === p) {
      this.hud.channel(this.channel.kind === 'plant' ? 'PLANTING THE SURGE CHARGE' : 'VENTING', this.channel.t / this.channel.need);
    } else if (this.channel) {
      this.hud.channel(null);
    } else {
      this.hud.channel(null);
    }
    // contextual hints
    if (this.phase === 'buy') this.hud.setHint(this.buyOpen ? '' : 'B — SUPPLY MENU');
    else if (this.channel && this.channel.fighter !== p) this.hud.setHint('');
    else if (this.phase === 'live' && this.charge && this.charge.state === 'carried' && this.charge.carrier === p) {
      this.hud.setHint(this.siteAt(p.pos.x, p.pos.z) ? 'HOLD E — PLANT THE SURGE CHARGE' : 'Reach Sluice A or Pump Hall B');
    } else if (this.phase === 'live' && p.weapon.mag === 0) this.hud.setHint('R — RELOAD');
    else this.hud.setHint('');
    // buy menu
    if (this.phase === 'buy' && this.buyOpen) {
      const entries = BUY_ORDER.map((id, i) => {
        const owned = p.weapons.primary && p.weapons.primary.id === id;
        return {
          key: String(i + 1), label: WEAPONS[id].name,
          price: owned ? 'OWNED' : fmtMoney(WEAPONS[id].price),
          state: owned ? 'owned' : p.money >= WEAPONS[id].price ? 'avail' : 'cant',
        };
      });
      entries.push({ key: '5', label: 'Kevlar Vest', price: p.armor >= 100 ? 'OWNED' : fmtMoney(ARMOR_PRICE), state: p.armor >= 100 ? 'owned' : p.money >= ARMOR_PRICE ? 'avail' : 'cant' });
      entries.push({ key: '6', label: 'Helmet', price: p.helmet ? 'OWNED' : fmtMoney(HELMET_PRICE), state: p.helmet ? 'owned' : p.money >= HELMET_PRICE ? 'avail' : 'cant' });
      this.hud.renderBuy(entries, p.money, true);
    } else {
      this.hud.renderBuy([], 0, false);
    }
  }
}

function refill(w) { w.mag = w.def.mag; w.reserve = w.def.reserve; w.reloadT = 0; w.cool = 0; }
