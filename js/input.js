'use strict';
// ---------------------------------------------------------------------------
// Input: keyboard + mouse look (pointer lock, with a fallback), and touch:
// a joystick on the left, drag to look on the right, tap to place, hold to mine.
// ---------------------------------------------------------------------------

const Input = {
  keys: new Set(), pressed: new Set(),
  mouse: { left: false, right: false, leftPress: false, rightPress: false, wheel: 0 },
  lookDX: 0, lookDY: 0, sens: 1, locked: false, freeLook: false, isTouch: false, enabled: false,
  joy: null, lookT: null, touchJump: false, touchJumpPress: false, touchDown: false, touchUp: false,
  tapPlace: false, holdMine: false,

  init(canvas) {
    this.canvas = canvas;
    const gameKeys = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (gameKeys.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
    document.addEventListener('pointerlockerror', () => { this.freeLook = true; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousedown', e => {
      if (this.isTouch || !this.enabled) return;
      if (!this.locked && !this.freeLook) { this.requestLock(); return; }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPress = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPress = true; }
      if (e.button === 1) { this.pressed.add('MousePick'); e.preventDefault(); }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; });
    window.addEventListener('mousemove', e => {
      if (this.isTouch || !this.enabled) return;
      if (this.locked || this.freeLook) { this.lookDX += e.movementX || 0; this.lookDY += e.movementY || 0; }
    });
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.mouse.wheel += Math.sign(e.deltaY); }, { passive: false });

    // touch
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      this.isTouch = true;
      const w = window.innerWidth;
      if (e.clientX < w * 0.42 && !this.joy) {
        this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
        if (this.onJoy) this.onJoy(this.joy);
      } else if (!this.lookT) {
        this.lookT = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
      }
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType !== 'touch') return;
      if (this.joy && e.pointerId === this.joy.id) { this.joy.x = e.clientX; this.joy.y = e.clientY; if (this.onJoy) this.onJoy(this.joy); }
      else if (this.lookT && e.pointerId === this.lookT.id) {
        const dx = e.clientX - this.lookT.x, dy = e.clientY - this.lookT.y;
        this.lookDX += dx * 2.2; this.lookDY += dy * 2.2;
        this.lookT.x = e.clientX; this.lookT.y = e.clientY;
        this.lookT.moved = Math.max(this.lookT.moved, Math.hypot(e.clientX - this.lookT.sx, e.clientY - this.lookT.sy));
      }
    });
    const end = e => {
      if (e.pointerType !== 'touch') return;
      if (this.joy && e.pointerId === this.joy.id) { this.joy = null; if (this.onJoy) this.onJoy(null); }
      else if (this.lookT && e.pointerId === this.lookT.id) {
        const quick = performance.now() - this.lookT.t < 260 && this.lookT.moved < 12;
        if (quick && !this.holdMine) this.tapPlace = true;
        this.holdMine = false;
        this.lookT = null;
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  },
  requestLock() {
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.freeLook = true; });
    } catch (e) { this.freeLook = true; }
  },
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
  bindButton(el, name) {
    const set = v => e => {
      e.preventDefault(); e.stopPropagation();
      if (name === 'jump') { if (v && !this.touchJump) this.touchJumpPress = true; this.touchJump = v; }
      else if (name === 'down') this.touchDown = v;
      else if (name === 'up') this.touchUp = v;
      el.classList.toggle('held', v);
    };
    el.addEventListener('pointerdown', set(true));
    el.addEventListener('pointerup', set(false));
    el.addEventListener('pointercancel', set(false));
    el.addEventListener('pointerleave', set(false));
  },
  update() {
    // a touch held still on the right side becomes "mine"
    if (this.lookT && !this.holdMine && this.lookT.moved < 12 && performance.now() - this.lookT.t > 330) this.holdMine = true;
  },
  down(...c) { return c.some(k => this.keys.has(k)); },
  was(...c) { return c.some(k => this.pressed.has(k)); },
  takeLook() { const d = [this.lookDX * this.sens, this.lookDY * this.sens]; this.lookDX = this.lookDY = 0; return d; },
  state() {
    let mx = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let mz = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
    if (this.joy) {
      const R = 55;
      let jx = (this.joy.x - this.joy.x0) / R, jy = (this.joy.y - this.joy.y0) / R;
      const l = Math.hypot(jx, jy);
      if (l > 1) { jx /= l; jy /= l; }
      if (l > 0.15) { mx = jx; mz = -jy; }
    }
    return {
      mx, mz,
      jump: this.was('Space') || this.touchJumpPress,
      jumpHeld: this.down('Space') || this.touchJump,
      sprint: this.down('ShiftLeft', 'ShiftRight', 'ControlLeft') || (this.joy && Math.hypot(this.joy.x - this.joy.x0, this.joy.y - this.joy.y0) > 50),
      down: this.down('ShiftLeft', 'ShiftRight') || this.touchDown,
      up: this.touchUp,
    };
  },
  endFrame() {
    this.pressed.clear(); this.mouse.wheel = 0; this.mouse.leftPress = this.mouse.rightPress = false;
    this.touchJumpPress = false; this.tapPlace = false;
  },
};
