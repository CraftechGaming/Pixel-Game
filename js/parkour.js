'use strict';
// ---------------------------------------------------------------------------
// Parkour party mode: obstacle courses floating in the sky, raced against
// eleven bots. Moving obstacles are not blocks; they push racers around.
// Courses run along +z. Floors are built from blocks with feet at cb.y.
// ---------------------------------------------------------------------------

const STRIPES = [[1, 0.35, 0.35], [1, 1, 1]];
const hit = (b, x0, x1, y0, y1, z0, z1) => b.x + b.hw > x0 && b.x - b.hw < x1 && b.y + b.h > y0 && b.y < y1 && b.z + b.hw > z0 && b.z - b.hw < z1;

class Sweeper {
  constructor(cx, y, cz, len, speed, phase = 0, color = [1, 0.35, 0.35], arms = 1) {
    Object.assign(this, { cx, y, cz, len, speed, phase, color, arms, a: phase });
  }
  update(t) { this.a = this.phase + t * this.speed; }
  collide(b, dt) {
    const dx = b.x - this.cx, dz = b.z - this.cz;
    for (let k = 0; k < this.arms; k++) {
      const a = this.a + k * Math.PI / this.arms, ca = Math.cos(a), sa = Math.sin(a);
      const u = dx * ca + dz * sa, v = -dx * sa + dz * ca, ht = 0.3 + b.hw;
      if (Math.abs(u) < this.len / 2 + b.hw && Math.abs(v) < ht && b.y < this.y + 0.3 && b.y + b.h > this.y - 0.3) {
        const push = Math.sign(this.speed * u) || 1;
        const dv = push * (ht + 0.02) - v;
        b.x += -sa * dv; b.z += ca * dv;
        const tv = Math.abs(this.speed * u) + 5;
        b.vx = -sa * push * tv; b.vz = ca * push * tv; b.vy = Math.max(b.vy, 6.5);
        b.stun = 0.55; b.onGround = false; b.hitBy = 'sweeper';
      }
    }
    const d = Math.hypot(dx, dz);
    if (d < 0.55 + b.hw && b.y < this.y + 0.4) { const k = (0.56 + b.hw) / (d || 1); b.x = this.cx + dx * k; b.z = this.cz + dz * k; }
  }
  draw(r, light) {
    r.boxAt(this.cx, this.y - 0.5, this.cz, 0.9, 1.4, 0.9, [0.95, 0.85, 0.3], light);
    for (let k = 0; k < this.arms; k++) {
      const a = this.a + k * Math.PI / this.arms, n = 8, seg = this.len / n;
      for (let i = 0; i < n; i++) {
        const u = -this.len / 2 + seg * (i + 0.5);
        r.boxAt(this.cx + Math.cos(a) * u, this.y, this.cz + Math.sin(a) * u, seg + 0.01, 0.5, 0.5, i % 2 ? STRIPES[1] : this.color, light, -a);
      }
    }
  }
  danger(b) { // how soon a sweeper arm reaches this racer (for bots)
    const dx = b.x - this.cx, dz = b.z - this.cz, d = Math.hypot(dx, dz);
    if (d > this.len / 2 + 0.5) return 9;
    const ang = Math.atan2(dz, dx);
    let best = 9;
    for (let k = 0; k < this.arms * 2; k++) {
      let diff = ang - (this.a + k * Math.PI / this.arms);
      diff = ((diff % TAU) + TAU) % TAU;
      const t = this.speed > 0 ? diff / this.speed : (TAU - diff) / -this.speed;
      best = Math.min(best, t);
    }
    return best;
  }
}

class Hammer {
  constructor(px, py, pz, len, amp, speed, phase) { Object.assign(this, { px, py, pz, len, amp, speed, phase, th: 0, w: 0 }); }
  update(t) { this.th = this.amp * Math.sin(t * this.speed + this.phase); this.w = this.amp * this.speed * Math.cos(t * this.speed + this.phase); }
  head() { return [this.px + Math.sin(this.th) * this.len, this.py - Math.cos(this.th) * this.len]; }
  collide(b) {
    const [hx, hy] = this.head();
    if (hit(b, hx - 0.75, hx + 0.75, hy - 0.75, hy + 0.75, this.pz - 1, this.pz + 1)) {
      const dir = Math.sign(this.w) || 1;
      b.x = dir > 0 ? Math.max(b.x, hx + 0.76 + b.hw) : Math.min(b.x, hx - 0.76 - b.hw);
      b.vx = dir * (8 + Math.abs(this.w) * 3); b.vy = 7; b.vz *= 0.3;
      b.stun = 0.8; b.onGround = false; b.hitBy = 'hammer';
    }
  }
  draw(r, light) {
    const [hx, hy] = this.head(), mid = this.len / 2;
    r.boxAt(this.px + Math.sin(this.th) * mid, this.py - Math.cos(this.th) * mid, this.pz, 0.18, this.len, 0.18, [0.4, 0.3, 0.2], light, 0, 0, this.th);
    r.boxAt(hx, hy, this.pz, 1.5, 1.5, 2, [0.95, 0.42, 0.25], light, 0, 0, this.th);
    r.boxAt(hx, hy, this.pz, 1.56, 0.4, 2.06, [1, 1, 1], light, 0, 0, this.th);
  }
}

class Pusher {
  constructor(side, y, z, speed, phase, reach) { Object.assign(this, { side, y, z, speed, phase, reach, x: side * 6, v: 0 }); }
  update(t) {
    const out = Math.max(0, Math.sin(t * this.speed + this.phase));
    const nx = this.side * (5.6 - this.reach * out);
    this.v = nx - this.x; this.x = nx;
  }
  collide(b) {
    if (hit(b, this.x - 1.1, this.x + 1.1, this.y, this.y + 1.6, this.z - 1, this.z + 1)) {
      const dir = -this.side;
      b.x = dir > 0 ? this.x + 1.12 + b.hw : this.x - 1.12 - b.hw;
      if (this.v * dir > 0) { b.vx = dir * 11; b.vy = 5.5; b.stun = 0.5; b.onGround = false; b.hitBy = 'pusher'; }
    }
  }
  draw(r, light) {
    r.boxAt(this.x, this.y + 0.8, this.z, 2.2, 1.6, 2, [0.35, 0.55, 1], light);
    r.boxAt(this.x - this.side * 1.12, this.y + 1, this.z - 0.4, 0.04, 0.3, 0.3, [1, 1, 1], light);
    r.boxAt(this.x - this.side * 1.12, this.y + 1, this.z + 0.4, 0.04, 0.3, 0.3, [1, 1, 1], light);
  }
}

class Mover {
  constructor(cx, y, cz, sx, sz, ax, speed, phase, color) { Object.assign(this, { cx, y, cz, sx, sz, ax, speed, phase, color, px: cx, dx: 0 }); }
  update(t) { const nx = this.posAt(t); this.dx = nx - this.px; this.px = nx; this.t = t; }
  posAt(t) { return this.cx + this.ax * Math.sin(t * this.speed + this.phase); }
  collide(b) {
    const x0 = this.px - this.sx / 2, x1 = this.px + this.sx / 2, z0 = this.cz - this.sz / 2, z1 = this.cz + this.sz / 2, top = this.y;
    const over = b.x + b.hw > x0 && b.x - b.hw < x1 && b.z + b.hw > z0 && b.z - b.hw < z1;
    if (!over) return;
    if (b.vy <= 0.5 && b.y <= top + 0.05 && (b.prevY === undefined || b.prevY >= top - 0.12)) {
      b.y = top; b.vy = 0; b.onGround = true; b.x += this.dx; b.landV = b.landV || 0; b.onMover = this;
    } else if (b.y < top - 0.1 && b.y + b.h > top - 0.6) {
      // bumped into the side
      const pushL = b.x + b.hw - x0, pushR = x1 - (b.x - b.hw);
      if (pushL < pushR) b.x -= pushL; else b.x += pushR;
    }
  }
  draw(r, light) {
    r.boxAt(this.px, this.y - 0.3, this.cz, this.sx, 0.6, this.sz, this.color, light);
    r.boxAt(this.px, this.y - 0.62, this.cz, this.sx * 0.9, 0.1, this.sz * 0.9, [0.2, 0.2, 0.25], light);
  }
}

// --- course building --------------------------------------------------------------------
const COURSES = [
  { id: 'rush', name: 'Block Rush', desc: 'Hop the gaps, dodge the sweeper, bounce to the top.', segs: ['start', 'bridge', 'gaps', 'sweeper', 'bounce', 'tiles', 'finish'], pal: ['cloth_pink', 'cloth_white'] },
  { id: 'hammer', name: 'Hammer Hall', desc: 'Swinging hammers and sneaky pushers.', segs: ['start', 'bridge', 'hammers', 'pushers', 'gaps', 'hammers', 'finish'], pal: ['cloth_orange', 'cloth_yellow'] },
  { id: 'belts', name: 'Conveyor Chaos', desc: 'Belts, moving platforms and a bounce climb.', segs: ['start', 'conveyor', 'movers', 'bounce', 'conveyor', 'sweeper2', 'finish'], pal: ['cloth_blue', 'cloth_white'] },
  { id: 'tower', name: 'Tumble Tower', desc: 'Climb stairs and bounce pads into the sky.', segs: ['start', 'stairs', 'sweeper', 'bounce', 'stairs', 'tiles', 'bounce', 'finish'], pal: ['cloth_purple', 'cloth_pink'] },
  { id: 'mix', name: 'Lucky Mix', desc: 'A brand new random course every time.', random: true, pal: ['cloth_green', 'cloth_yellow'] },
];

class CourseBuilder {
  constructor(world, rng, pal) {
    this.w = world; this.rng = rng; this.pal = pal.map(k => B[k]);
    this.z = 0; this.y = 40; this.minY = 40;
    this.obstacles = []; this.checks = []; this.wps = []; this.spawns = [];
  }
  set(x, y, z, id, meta = 0) {
    const c = this.w.ensureChunk(x >> 4, z >> 4);
    const i = cidx(x & 15, y, z & 15);
    c.blocks[i] = id; c.meta[i] = meta;
    if (LIGHT[id]) c.lights.add(i);
  }
  floor(x0, x1, z0, z1, y, id) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      this.set(x, y - 1, z, typeof id === 'function' ? id(x, z) : id);
    }
    this.minY = Math.min(this.minY, y);
  }
  stripe(x, z) { return this.pal[((x >> 1) + (z >> 1)) & 1 ? 1 : 0]; }
  wp(x, z, extra = {}) { this.wps.push(Object.assign({ x: x + 0.5, y: this.y, z: z + 0.5, spread: 1.5 }, extra)); }
  check() { this.checks.push({ z: this.z, y: this.y }); }

  start() {
    this.floor(-7, 7, 0, 13, this.y, (x, z) => this.stripe(x, z));
    for (let z = 0; z <= 13; z++) for (const x of [-8, 8]) { this.set(x, this.y, z, B.fence); }
    for (let x = -7; x <= 7; x++) for (let y = this.y; y < this.y + 3; y++) this.set(x, y, 13, B.gate);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) this.spawns.push({ x: -4.5 + c * 3 + (r % 2) * 1.2, y: this.y, z: 3 + r * 3 });
    this.gate = { z: 13, y: this.y, x0: -7, x1: 7 };
    this.z = 14; this.check(); this.wp(0, 15);
  }
  bridge(len = 8) {
    this.floor(-3, 3, this.z, this.z + len - 1, this.y, (x, z) => this.stripe(x, z));
    this.z += len; this.wp(0, this.z - 1);
  }
  gaps() {
    this.check();
    const rows = 5;
    let z = this.z + 2;
    for (let r = 0; r < rows; r++) {
      const dy = r === 2 ? 1 : 0;
      this.y += dy;
      for (const lx of [-4, 0, 4]) {
        const w = this.rng.int(2, 3);
        this.floor(lx - 1, lx - 1 + w - 1, z, z + 1, this.y, this.pal[r % 2]);
      }
      this.wp(0, z + 1, { lanes: [-4, 0, 4] });
      z += 2 + (r === 1 ? 2 : this.rng.int(2, 3)); // the step up (row 2) always has a short gap
    }
    this.z = z;
    this.floor(-3, 3, this.z, this.z + 2, this.y, (x, zz) => this.stripe(x, zz));
    this.z += 3; this.wp(0, this.z - 1);
  }
  sweeper(arms = 1) {
    this.check();
    const cz = this.z + 8, R = 7;
    this.floor(-3, 3, this.z, this.z + 1, this.y, (x, z) => this.stripe(x, z));
    for (let z = cz - R; z <= cz + R; z++) for (let x = -R; x <= R; x++) if (x * x + (z - cz) ** 2 <= R * R + 2) this.set(x, this.y - 1, z, this.pal[(x * x + (z - cz) ** 2) < 20 ? 1 : 0]);
    this.obstacles.push(new Sweeper(0.5, this.y + 0.55, cz + 0.5, R * 2 - 0.5, (this.rng.chance(0.5) ? 1 : -1) * (arms > 1 ? 1.15 : 1.45), this.rng.range(0, TAU), [1, 0.35, 0.35], arms));
    this.wp(0, cz - 4, { spread: 2 }); this.wp(this.rng.chance(0.5) ? 3 : -3, cz, { spread: 1, sweeper: this.obstacles[this.obstacles.length - 1] }); this.wp(0, cz + 5, { spread: 2 });
    this.z = cz + R + 1;
    this.floor(-3, 3, this.z, this.z + 2, this.y, (x, z) => this.stripe(x, z));
    this.z += 3; this.wp(0, this.z - 1);
  }
  hammers() {
    this.check();
    const len = 26;
    this.floor(-2, 2, this.z, this.z + len - 1, this.y, (x, z) => this.stripe(x, z));
    for (let k = 0; k < 4; k++) {
      const z = this.z + 4 + k * 6;
      for (let y = this.y; y < this.y + 7; y++) { this.set(-4, y, z, B.planks_dark); this.set(4, y, z, B.planks_dark); }
      for (let x = -4; x <= 4; x++) this.set(x, this.y + 7, z, B.planks_dark);
      this.obstacles.push(new Hammer(0.5, this.y + 6.6, z + 0.5, 5.0, 1.05, 1.9 + this.rng.range(-0.2, 0.3), k * 1.7 + this.rng.range(0, 1)));
      this.wp(0, z - 2, { spread: 0.6 }); this.wp(0, z + 1, { spread: 0.6, hammer: this.obstacles[this.obstacles.length - 1] });
    }
    this.z += len; this.wp(0, this.z - 1);
  }
  pushers() {
    this.check();
    const len = 24;
    this.floor(-4, 4, this.z, this.z + len - 1, this.y, (x, z) => this.stripe(x, z));
    for (let k = 0; k < 4; k++) {
      const z = this.z + 4 + k * 5;
      const side = k % 2 ? 1 : -1;
      this.obstacles.push(new Pusher(side, this.y, z + 0.5, 1.8 + this.rng.range(0, 0.6), this.rng.range(0, TAU), 4.2));
      this.wp(-side * 2.5, z + 0.5, { spread: 0.8 });
    }
    this.z += len; this.wp(0, this.z - 1);
  }
  bounce() {
    this.check();
    this.floor(-3, 3, this.z, this.z + 3, this.y, (x, z) => this.stripe(x, z));
    this.floor(-3, 3, this.z + 4, this.z + 5, this.y, B.bounce);
    this.wp(0, this.z + 4, { spread: 2 });
    this.z += 8;
    this.y += 4;
    this.floor(-4, 4, this.z, this.z + 5, this.y, (x, z) => this.stripe(x, z));
    this.wp(0, this.z + 2, { spread: 2 });
    this.z += 6; this.wp(0, this.z - 1);
  }
  tiles() {
    this.check();
    const len = 12;
    this.floor(-3, 3, this.z, this.z + len - 1, this.y, B.crumble);
    this.wp(0, this.z + 6, { spread: 2.5 });
    this.z += len; this.wp(0, this.z - 1);
    this.floor(-3, 3, this.z, this.z + 2, this.y, (x, z) => this.stripe(x, z));
    this.z += 3;
  }
  conveyor() {
    this.check();
    const len = 16;
    for (let z = this.z; z < this.z + len; z++) {
      if (z === this.z + 6 || z === this.z + 11) continue;
      for (let x = -2; x <= 2; x++) this.set(x, this.y - 1, z, B.conveyor, 0);
    }
    this.wp(0, this.z + 7, { spread: 1 }); this.wp(0, this.z + 12, { spread: 1 });
    this.z += len; this.wp(0, this.z - 1);
    this.floor(-3, 3, this.z, this.z + 2, this.y, (x, z) => this.stripe(x, z));
    this.z += 3;
  }
  movers() {
    this.check();
    const n = 3;
    const cols = [[0.35, 0.8, 0.45], [1, 0.75, 0.3], [0.45, 0.6, 1]];
    for (let k = 0; k < n; k++) {
      const cz = this.z + 2.5 + k * 4;
      const m = new Mover(0.5, this.y, cz, 3, 3, 3, 1.3, k * 2.1 + this.rng.range(0, 1), cols[k % 3]);
      this.obstacles.push(m);
      this.wp(0, cz - 0.5, { mover: m, spread: 0.5 });
    }
    this.z += 2.5 + n * 4 - 1;
    this.z = Math.ceil(this.z);
    this.floor(-3, 3, this.z, this.z + 3, this.y, (x, z) => this.stripe(x, z));
    this.z += 4; this.wp(0, this.z - 1);
  }
  stairs() {
    this.check();
    for (let k = 0; k < 6; k++) {
      this.floor(-3, 3, this.z, this.z + 1, this.y, (x, z) => this.stripe(x, z));
      for (let y = this.minY; y < this.y - 1; y++) for (let x = -3; x <= 3; x++) for (let z = this.z; z <= this.z + 1; z++) this.set(x, y, z, this.pal[1]);
      this.wp(0, this.z + 1, { spread: 2 });
      this.z += 2; this.y += 1;
    }
    this.y -= 1;
    this.floor(-3, 3, this.z, this.z + 2, this.y, (x, z) => this.stripe(x, z));
    this.z += 3;
  }
  finish() {
    this.check();
    this.floor(-6, 6, this.z, this.z + 9, this.y, (x, z) => (z === this.z + 2 ? B.finish_pad : this.stripe(x, z)));
    for (let y = this.y; y < this.y + 6; y++) { this.set(-6, y, this.z + 2, B.gold_block); this.set(6, y, this.z + 2, B.gold_block); }
    for (let x = -6; x <= 6; x++) this.set(x, this.y + 6, this.z + 2, x % 2 ? B.gold_block : B.glowblock);
    for (const x of [-7, 7]) for (let z = this.z; z <= this.z + 9; z++) this.set(x, this.y, z, B.fence);
    this.finishZ = this.z + 2; this.finishY = this.y;
    this.wp(0, this.z + 5, { spread: 3 });
    this.z += 10;
  }
}

function buildCourse(world, def, seed) {
  const rng = new RNG(hashString('course:' + def.id + ':' + seed));
  const cb = new CourseBuilder(world, rng, def.pal);
  let segs = def.segs;
  if (def.random) {
    const pool = ['gaps', 'sweeper', 'hammers', 'pushers', 'bounce', 'tiles', 'conveyor', 'movers', 'stairs', 'sweeper2'];
    segs = ['start', 'bridge', ...rng.shuffle(pool.slice()).slice(0, 5), 'finish'];
  }
  for (const s of segs) {
    if (s === 'sweeper2') cb.sweeper(2); else cb[s]();
  }
  return { name: def.name, def, obstacles: cb.obstacles, checks: cb.checks, wps: cb.wps, spawns: cb.spawns, gate: cb.gate, finishZ: cb.finishZ, finishY: cb.finishY, minY: cb.minY, length: cb.z };
}

// --- racers ---------------------------------------------------------------------------------
const BOT_NAMES = ['Pip', 'Nova', 'Bolt', 'Mochi', 'Ziggy', 'Blip', 'Rook', 'Tess', 'Kiwi', 'Juno', 'Dash', 'Pebble', 'Fizz', 'Taro', 'Loop', 'Sprout', 'Echo', 'Waffle'];
class Racer extends Body {
  constructor(name, look, skill, isPlayer) {
    super(0, 40, 0, 0.32, 1.45);
    this.name = name; this.look = look; this.skill = skill; this.isPlayer = isPlayer;
    this.wi = 0; this.cp = 0; this.finished = false; this.place = 0; this.time = 0;
    this.lane = (Math.random() - 0.5) * 2; this.think = 0; this.wait = 0;
  }
  ai(dt, course) {
    const wps = course.wps;
    let wp = wps[this.wi];
    const laneX = w => (w.lanes ? w.lanes[this.lane < -0.33 ? 0 : this.lane > 0.33 ? 2 : 1] + 0.5 : w.x + this.lane * w.spread);
    while (wp && (this.z > wp.z + 0.4 || (wp.mover ? this.onMover === wp.mover : Math.hypot(this.x - laneX(wp), this.z - wp.z) < 0.9))) { this.wi++; wp = wps[this.wi]; }
    if (!wp) wp = { x: 0.5, z: course.finishZ + 3, spread: 2 };
    let tx = laneX(wp);
    const tz = wp.z;
    if (wp.mover && Math.abs(wp.mover.px - this.x) < 1.1) tx = wp.mover.px;
    if (this.onMover && !(wp.mover && Math.abs(wp.mover.px - this.x) < 1.1)) tx = this.onMover.px;
    let dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const ctl = { mx: dx, mz: dz, jump: false, jumpHeld: true };
    this.think -= dt;
    // moving platforms: wait near the edge, jump when the next one will be underneath on landing
    if (wp.mover && this.onGround && this.z < wp.mover.cz - 1.6) {
      const m = wp.mover;
      const here = this.onMover ? this.onMover.px : this.x;
      const edgeZ = m.cz - m.sz / 2 - 1.2;
      const future = m.posAt((m.t || 0) + 0.5 + (1 - this.skill) * 0.15);
      if (Math.abs(future - this.x) < 0.75 && this.z > edgeZ - 1.5) { ctl.mx = 0; ctl.mz = 1; ctl.jump = true; }
      else {
        const dz = edgeZ - this.z;
        ctl.mx = clamp((here - this.x) * 2, -1, 1); ctl.mz = clamp(dz * 2, -1, 1);
      }
    }
    if (this.onGround) {
      // jump over gaps
      const ax = this.x + dx * 0.55, az = this.z + dz * 0.55;
      const gw = course.world;
      const floorAhead = gw.solidAt(Math.floor(ax), Math.floor(this.y - 0.5), Math.floor(az)) || gw.solidAt(Math.floor(ax), Math.floor(this.y - 1.5), Math.floor(az));
      const moverAhead = course.obstacles.some(o => o instanceof Mover && Math.abs(o.px - ax) < o.sx / 2 && Math.abs(o.cz - az) < o.sz / 2);
      if (!floorAhead && !moverAhead && !wp.mover) ctl.jump = true;
      if (this.hitWall) ctl.jump = true;
      if (wp.sweeper && this.think <= 0) {
        const t = wp.sweeper.danger(this);
        const when = 0.24 + (Math.random() - 0.5) * (1 - this.skill) * 0.3;
        if (t < when && t > 0.05 && Math.random() < 0.6 + this.skill * 0.4) ctl.jump = true;
        this.think = 0.05;
      }
    }
    // a bit of hesitation for weaker bots
    const sp = 0.86 + this.skill * 0.14;
    ctl.mx *= sp; ctl.mz *= sp;
    return ctl;
  }
}

class Race {
  constructor(game, def, opts) {
    this.game = game; this.def = def; this.opts = opts;
    this.world = new World('parkour:' + def.id + ':' + opts.seed, 'parkour', null);
    this.course = buildCourse(this.world, def, opts.seed);
    this.course.world = this.world;
    this.t = 0; this.state = 'intro'; this.timer = 0; this.finishers = [];
    const rng = new RNG(hashString('racers' + opts.seed + opts.round));
    this.racers = [];
    const names = opts.entrants;
    const spawns = rng.shuffle(this.course.spawns.slice());
    names.forEach((n, i) => {
      const r = new Racer(n.name, n.look, n.skill, n.isPlayer);
      const s = spawns[i % spawns.length];
      r.x = s.x + 0.5; r.y = s.y; r.z = s.z + 0.5; r.yaw = Math.PI; r.yawVis = Math.PI;
      r.cpPos = { x: r.x, y: r.y, z: r.z };
      this.racers.push(r);
    });
    this.player = this.racers.find(r => r.isPlayer);
    this.qualify = opts.qualify;
  }
  get obstacles() { return this.course.obstacles; }
  openGate() {
    const g = this.course.gate;
    for (let x = g.x0; x <= g.x1; x++) for (let y = g.y; y < g.y + 3; y++) this.world.set(x, y, g.z, 0, 0, { quiet: true });
  }
  update(dt, input) {
    const g = this.game;
    this.t += dt;
    for (const o of this.obstacles) o.update(this.t);
    if (this.state === 'run') this.timer += dt;
    const P = { speed: 6.4, sprint: 6.4, jump: 9.6, accel: 14, air: 6 };
    const env = {
      obstacles: this.obstacles,
      onJump: b => { if (b.isPlayer) g.sound.play('jump'); },
      onBounce: b => { if (g.near(b, 20)) g.sound.play('bounce'); g.particles.burst(b.x, b.y, b.z, [0.6, 1, 0.55], 8, 3); },
      onLand: (b, fall) => { if (b.isPlayer && fall > 1.2) g.sound.play('land', { vol: Math.min(1, fall / 6) }); },
    };
    for (const r of this.racers) {
      if (r.out) continue;
      let ctl;
      if (this.state === 'countdown' || this.state === 'intro') ctl = { mx: 0, mz: 0 };
      else if (r.isPlayer) ctl = r.finished ? { mx: 0, mz: 0 } : input;
      else ctl = r.finished ? { mx: (r.danceX || 0), mz: 0 } : r.ai(dt, this.course);
      const wasStun = r.stun;
      r.prevY = r.y; r.onMover = null;
      controlBody(r, ctl, P, this.world, dt, env);
      if (!wasStun && r.stun > 0 && g.near(r, 18)) { g.sound.play('whoosh'); g.particles.burst(r.x, r.y + 1, r.z, [1, 1, 1], 6, 2.5); }
      r.yaw = r.yawTarget !== undefined ? r.yawTarget : r.yaw;
      r.yawVis = r.yawVis + angleDiff(r.yaw, r.yawVis) * Math.min(1, dt * 12);
      // checkpoints
      const cks = this.course.checks;
      while (r.cp + 1 < cks.length && r.z > cks[r.cp + 1].z + 0.5 && r.onGround) { r.cp++; r.cpPos = { x: clamp(r.x, -2, 3), y: r.y, z: r.z }; if (r.isPlayer) g.ui.toast('Checkpoint!'); }
      // fell off
      if (r.y < this.course.minY - 14) this.respawn(r);
      // finish line
      if (!r.finished && this.state === 'run' && r.z >= this.course.finishZ && r.y >= this.course.finishY - 1) this.finishRacer(r);
    }
    if (this.state === 'run') this.checkEnd(dt);
  }
  respawn(r) {
    // go back to the last checkpoint, but never further back than the start area
    const c = r.cpPos;
    r.x = c.x + (Math.random() - 0.5); r.y = c.y + 0.5; r.z = c.z; r.vx = r.vy = r.vz = 0; r.stun = 0;
    r.wi = Math.max(0, this.course.wps.findIndex(w => w.z > r.z - 1));
    if (r.isPlayer) { this.game.sound.play('respawn'); this.game.flashFade(); }
  }
  finishRacer(r) {
    r.finished = true; r.time = this.timer; r.place = this.finishers.length + 1;
    this.finishers.push(r);
    r.danceX = 0;
    const g = this.game;
    if (r.isPlayer) {
      g.particles.confetti(r.x, r.y + 2, r.z, 80);
      g.sound.play(r.place <= (this.qualify || 99) ? 'qualify' : 'finish');
      g.onPlayerFinished(this, r);
    } else if (g.near(r, 25)) g.sound.play('pop');
  }
  placeOf(r) {
    if (r.finished) return r.place;
    let ahead = this.finishers.length;
    for (const o of this.racers) if (!o.finished && !o.out && o !== r && o.z > r.z) ahead++;
    return ahead + 1;
  }
  checkEnd(dt) {
    const alive = this.racers.filter(r => !r.out);
    if (this.qualify && this.finishers.length >= Math.min(this.qualify, alive.length)) { this.endRound(); return; }
    if (!this.qualify && this.player.finished) { this.endT = (this.endT || 0) + dt; if (this.endT > 3.5) this.endRound(); }
    if (this.timer > 240) this.endRound();
  }
  endRound() {
    if (this.state === 'done') return;
    this.state = 'done';
    this.game.onRaceOver(this);
  }
}

function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
