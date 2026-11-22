'use strict';
// ---------------------------------------------------------------------------
// Input: keyboard, mouse and touch, merged into one simple state object.
// ---------------------------------------------------------------------------

const Input = {
  keys: new Set(),
  pressed: new Set(),
  mouse: { x: 0, y: 0, inside: false, left: false, right: false, wheel: 0, moved: false },
  touch: { left: false, right: false, jump: false, down: false, jumpPressed: false, world: false, isTouch: false },
  blocked: false,

  init(canvas) {
    const gameKeys = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (gameKeys.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
      if (e.pointerType === 'touch') { this.touch.isTouch = true; this.touch.world = true; this.touch.worldPressed = true; }
      else if (e.button === 0) { this.mouse.left = true; this.mouse.leftPress = true; }
      else if (e.button === 2) { this.mouse.right = true; this.mouse.rightPress = true; }
      else if (e.button === 1) { this.pressed.add('MousePick'); e.preventDefault(); }
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; this.mouse.moved = true;
    });
    const up = e => {
      if (e.pointerType === 'touch') this.touch.world = false;
      else if (e.button === 0) this.mouse.left = false;
      else if (e.button === 2) this.mouse.right = false;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', e => { this.touch.world = false; this.mouse.left = this.mouse.right = false; });
    canvas.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') this.mouse.inside = false; });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey) this.pressed.add(e.deltaY > 0 ? 'ZoomOut' : 'ZoomIn');
      else this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    window.addEventListener('touchstart', () => { this.touch.isTouch = true; }, { passive: true, once: true });
  },

  // Bind an on-screen button (touch controls) to a virtual key.
  bindButton(el, name) {
    const set = v => e => {
      e.preventDefault();
      if (v && !this.touch[name]) { if (name === 'jump') this.touch.jumpPressed = true; this.pressed.add('Touch_' + name); }
      this.touch[name] = v;
      el.classList.toggle('held', v);
    };
    el.addEventListener('pointerdown', set(true));
    el.addEventListener('pointerup', set(false));
    el.addEventListener('pointercancel', set(false));
    el.addEventListener('pointerleave', set(false));
  },

  down(...codes) { return codes.some(c => this.keys.has(c)); },
  was(...codes) { return codes.some(c => this.pressed.has(c)); },

  state() {
    if (this.blocked) return { left: false, right: false, up: false, down: false, jumpHeld: false, jumpPressed: false, sprint: false };
    const t = this.touch;
    return {
      left: this.down('KeyA', 'ArrowLeft') || t.left,
      right: this.down('KeyD', 'ArrowRight') || t.right,
      up: this.down('KeyW', 'ArrowUp') || t.jump,
      down: this.down('KeyS', 'ArrowDown') || t.down,
      jumpHeld: this.down('Space', 'KeyW', 'ArrowUp') || t.jump,
      jumpPressed: this.was('Space', 'KeyW', 'ArrowUp') || t.jumpPressed,
      sprint: this.down('ShiftLeft', 'ShiftRight'),
    };
  },
  endFrame() {
    this.pressed.clear();
    this.mouse.wheel = 0;
    this.touch.jumpPressed = false;
    this.touch.worldPressed = false;
    this.mouse.leftPress = false;
    this.mouse.rightPress = false;
  },
};
