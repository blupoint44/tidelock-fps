// TIDELOCK — procedural audio. Every sound is synthesised with WebAudio:
// no audio files, nothing fetched. The context is created lazily on the
// first user gesture, as browsers require.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambient = null;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.ctx.destination);
    this.startAmbient();
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  noiseBuffer(dur) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  startAmbient() {
    // Low yard hum: filtered brown-ish noise plus a slow swell.
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(2.5);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 220;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.ambient = src;
  }

  // A gunshot. `dist` (metres) dulls and quiets shots from other fighters.
  shot(kind, dist = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const att = Math.max(0.05, 1 - dist / 90);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const base = kind === 'scatter' ? 900 : kind === 'needle' ? 1600 : 2300;
    lp.frequency.setValueAtTime(base * att + 300, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.13);
    const g = ctx.createGain();
    const vol = (kind === 'scatter' ? 0.75 : 0.5) * att;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'needle' ? 0.3 : 0.16));
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.32);
    // body thump
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(kind === 'scatter' ? 120 : 150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.35 * att, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(og); og.connect(this.master);
    osc.start(t); osc.stop(t + 0.12);
  }

  dryFire() { this.blip(1900, 0.05, 0.12, 'square'); }
  reloadStart() { this.blip(700, 0.04, 0.10, 'square'); setTimeout(() => this.blip(480, 0.04, 0.10, 'square'), 130); }
  reloadEnd() { this.blip(950, 0.05, 0.14, 'square'); setTimeout(() => this.blip(1250, 0.05, 0.12, 'square'), 90); }
  hit(head) { this.blip(head ? 2650 : 1750, 0.055, 0.16, 'sine'); if (head) setTimeout(() => this.blip(3300, 0.07, 0.12, 'sine'), 45); }
  hurt() { this.blip(180, 0.12, 0.2, 'sawtooth'); }
  kill() { this.blip(880, 0.07, 0.14, 'triangle'); setTimeout(() => this.blip(1318, 0.1, 0.14, 'triangle'), 70); }
  beep(final) { this.blip(final ? 1560 : 1040, final ? 0.22 : 0.09, 0.16, 'square'); }
  denied() { this.blip(220, 0.09, 0.14, 'square'); }
  buy() { this.blip(1174, 0.06, 0.12, 'triangle'); setTimeout(() => this.blip(1568, 0.08, 0.12, 'triangle'), 60); }
  step(run) { if (this.ctx) { const t = this.now(); this.noiseTap(t, run ? 0.05 : 0.028); } }

  noiseTap(t, vol) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.06);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.07);
  }

  blip(freq, dur, vol, type) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  sting(win) {
    if (!this.ctx) return;
    const notes = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.24, 0.13, 'triangle'), i * 105));
  }

  explosion() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(1.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(60, t + 1.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.95, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 1.4);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(88, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.9);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 1.05);
  }
}
