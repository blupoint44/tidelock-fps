// TIDELOCK — HUD: DOM overlays for vitals, money, ammunition, the round
// clock, kill feed, banners, the buy menu and channel progress bars.

import { fmtMoney, fmtTime } from './config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), timer: $('timer'), timerLabel: $('timer-label'),
      scoreW: $('score-w'), scoreB: $('score-b'), roundNum: $('round-num'),
      hpFill: $('hp-fill'), hpNum: $('hp-num'), apFill: $('ap-fill'), apNum: $('ap-num'),
      money: $('money'), ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), weaponName: $('weapon-name'),
      feed: $('killfeed'), banner: $('banner'), bannerMain: $('banner-main'), bannerSub: $('banner-sub'),
      channel: $('channel'), channelLabel: $('channel-label'), channelFill: $('channel-fill'),
      cross: $('crosshair'), hitmark: $('hitmarker'), vignette: $('vignette'),
      hint: $('hint'), carry: $('carry'), buy: $('buy-menu'), buyItems: $('buy-items'), buyMoney: $('buy-money'),
      hitDir: $('hit-dir'),
    };
    this.bannerT = 0;
    this.hitT = 0;
    this.vigT = 0;
  }

  showHud(v) { this.el.hud.style.display = v ? 'block' : 'none'; }

  setClock(sec, mode) {
    this.el.timer.textContent = fmtTime(sec);
    this.el.timerLabel.textContent = mode === 'charge' ? 'CHARGE LIVE' : mode === 'buy' ? 'BUY PHASE' : 'ROUND';
    this.el.timer.classList.toggle('urgent', mode === 'charge' || sec <= 10.5);
    this.el.timer.classList.toggle('charge', mode === 'charge');
  }

  setScore(w, b, round) {
    this.el.scoreW.textContent = w;
    this.el.scoreB.textContent = b;
    this.el.roundNum.textContent = 'ROUND ' + round;
  }

  setVitals(hp, armor) {
    this.el.hpFill.style.width = Math.max(0, hp) + '%';
    this.el.hpNum.textContent = Math.max(0, Math.ceil(hp));
    this.el.apFill.style.width = Math.max(0, armor) + '%';
    this.el.apNum.textContent = Math.max(0, Math.ceil(armor));
    this.el.hpFill.classList.toggle('low', hp <= 30);
  }

  setMoney(n) { this.el.money.textContent = fmtMoney(n); }
  setAmmo(mag, reserve, name) {
    this.el.ammoMag.textContent = mag;
    this.el.ammoRes.textContent = reserve;
    this.el.weaponName.textContent = name;
  }
  setCarry(v) { this.el.carry.style.display = v ? 'block' : 'none'; }
  setHint(t) { this.el.hint.textContent = t || ''; }

  setCrossSpread(px) {
    this.el.cross.style.setProperty('--gap', px.toFixed(0) + 'px');
  }

  hitmarker(head) {
    this.el.hitmark.classList.remove('show', 'head');
    void this.el.hitmark.offsetWidth;
    this.el.hitmark.classList.add('show');
    if (head) this.el.hitmark.classList.add('head');
    this.hitT = 0.16;
  }

  damageFlash() { this.vigT = 0.55; }

  killfeed(html) {
    const div = document.createElement('div');
    div.className = 'feed-item';
    div.innerHTML = html;
    this.el.feed.prepend(div);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => { div.classList.add('fade'); setTimeout(() => div.remove(), 600); }, 4200);
  }

  banner(main, sub, cssColor, dur = 2.6) {
    this.el.bannerMain.textContent = main;
    this.el.bannerSub.textContent = sub || '';
    this.el.bannerMain.style.color = cssColor || '#fff';
    this.el.banner.style.opacity = '1';
    this.bannerT = dur;
  }

  channel(label, frac) {
    if (frac === null || frac === undefined) { this.el.channel.style.display = 'none'; return; }
    this.el.channel.style.display = 'block';
    this.el.channelLabel.textContent = label;
    this.el.channelFill.style.width = (frac * 100).toFixed(1) + '%';
  }

  renderBuy(entries, money, open) {
    this.el.buy.style.display = open ? 'block' : 'none';
    if (!open) return;
    this.el.buyMoney.textContent = fmtMoney(money);
    this.el.buyItems.innerHTML = entries.map((e) =>
      `<div class="buy-item ${e.state}">
         <span class="buy-key">${e.key}</span>
         <span class="buy-name">${e.label}</span>
         <span class="buy-price">${e.price}</span>
       </div>`).join('');
  }

  update(dt) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.style.opacity = '0';
    }
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) this.el.hitmark.classList.remove('show');
    }
    if (this.vigT > 0) {
      this.vigT -= dt;
      this.el.vignette.style.opacity = String(Math.max(0, this.vigT / 0.55) * 0.75);
    }
  }
}
