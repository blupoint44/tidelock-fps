// TIDELOCK — keyboard, mouse and pointer-lock handling.

export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.firing = false;
    this.adsHeld = false;
    this.locked = false;
    this.onLockChange = null;
    this.onKey = null; // (code) => void, for edge-triggered keys
    this.dom = dom;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat) { this.keys.add(e.code); if (this.onKey) this.onKey(e.code); }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.firing = false; });

    dom.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.adsHeld = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.adsHeld = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked) { this.firing = false; this.adsHeld = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() { this.dom.requestPointerLock(); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }

  // Consume the accumulated mouse movement for this frame.
  takeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return [dx, dy];
  }
}
