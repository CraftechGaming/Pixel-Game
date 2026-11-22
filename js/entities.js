'use strict';
// ---------------------------------------------------------------------------
// Bodies & physics, the bean-shaped characters (player, racers, villagers),
// animals, dropped items and particles.
// A body's (x, z) is the centre of its feet and y is the bottom.
// ---------------------------------------------------------------------------

const GRAV = 28;

class Body {
  constructor(x, y, z, hw = 0.3, h = 1.75) {
    this.x = x; this.y = y; this.z = z; this.hw = hw; this.h = h;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.onGround = false; this.yaw = 0; this.t = Math.random() * 10;
    this.inWater = false; this.headInWater = false; this.climbing = false;
    this.maxY = y; this.stun = 0; this.walk = 0; this.squash = 0;
  }
}

function moveOne(b, world, axis, d) {
  if (axis === 0) b.x += d; else if (axis === 1) b.y += d; else b.z += d;
  const x0 = Math.floor(b.x - b.hw), x1 = Math.floor(b.x + b.hw - 1e-6);
  const y0 = Math.floor(b.y), y1 = Math.floor(b.y + b.h - 1e-6);
  const z0 = Math.floor(b.z - b.hw), z1 = Math.floor(b.z + b.hw - 1e-6);
  let lim = null;
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (!world.solidAt(x, y, z)) continue;
    if (axis === 0) lim = d > 0 ? Math.min(lim ?? 1e9, x - b.hw - 1e-4) : Math.max(lim ?? -1e9, x + 1 + b.hw + 1e-4);
    else if (axis === 2) lim = d > 0 ? Math.min(lim ?? 1e9, z - b.hw - 1e-4) : Math.max(lim ?? -1e9, z + 1 + b.hw + 1e-4);
    else lim = d > 0 ? Math.min(lim ?? 1e9, y - b.h - 1e-4) : Math.max(lim ?? -1e9, y + 1);
  }
  if (lim === null) return true;
  if (axis === 0) { b.x = lim; b.vx = 0; b.hitWall = true; }
  else if (axis === 2) { b.z = lim; b.vz = 0; b.hitWall = true; }
  else { b.y = lim; if (d < 0) { b.onGround = true; b.landV = b.vy; } else b.bonk = true; b.vy = 0; }
  return false;
}
function moveBody(b, world, dt) {
  b.hitWall = false; b.bonk = false;
  b.wasGround = b.onGround; b.onGround = false;
  for (const [axis, v] of [[0, b.vx], [2, b.vz], [1, b.vy]]) {
    const d = v * dt;
    if (!d) continue;
    const n = Math.ceil(Math.abs(d) / 0.4), s = d / n;
    for (let k = 0; k < n; k++) if (!moveOne(b, world, axis, s)) break;
  }
}
function overlapsBlock(b, world, test) {
  const x0 = Math.floor(b.x - b.hw), x1 = Math.floor(b.x + b.hw - 1e-6);
  const y0 = Math.floor(b.y), y1 = Math.floor(b.y + b.h - 1e-6);
  const z0 = Math.floor(b.z - b.hw), z1 = Math.floor(b.z + b.hw - 1e-6);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (test(world.get(x, y, z), x, y, z)) return true;
  return false;
}

// Shared character controller for the player, racers and villagers.
// ctl: { mx, mz (world-space wish direction), jump, jumpHeld, sprint, down, up }
function controlBody(b, ctl, P, world, dt, env) {
  const fx = Math.floor(b.x), fz = Math.floor(b.z);
  b.inWater = world.get(fx, Math.floor(b.y + 0.4), fz) === B.water;
  b.headInWater = world.get(fx, Math.floor(b.y + b.h - 0.15), fz) === B.water;
  const onLadder = overlapsBlock(b, world, id => id === B.ladder);
  const stunned = b.stun > 0;
  b.stun = Math.max(0, b.stun - dt);
  let speed = ctl.sprint ? P.sprint : P.speed;
  if (b.inWater) speed *= 0.55;
  const gid = b.onGround ? world.get(b.gx, b.gy, b.gz) : 0;
  const slip = gid && BLOCKS[gid].slip;
  const accel = stunned ? 1.5 : b.onGround ? (slip ? 2 : P.accel) : P.air;
  let wx = ctl.mx * speed, wz = ctl.mz * speed;
  if (P.fly) {
    const k = Math.min(1, 10 * dt);
    b.vx += (wx * 1.8 - b.vx) * k; b.vz += (wz * 1.8 - b.vz) * k;
    const vy = (ctl.jumpHeld || ctl.up ? 1 : 0) - (ctl.down ? 1 : 0);
    b.vy += (vy * 9 - b.vy) * k;
  } else {
    const k = Math.min(1, accel * dt);
    if (!(stunned && !ctl.mx && !ctl.mz)) { b.vx += (wx - b.vx) * k; b.vz += (wz - b.vz) * k; }
    if (onLadder && (ctl.jumpHeld || (ctl.mx || ctl.mz) && b.hitWallPrev)) { b.vy = 3.6; b.climbing = true; }
    else if (onLadder) { b.vy = Math.max(b.vy - GRAV * dt, ctl.down ? -3 : -1.5); b.climbing = true; }
    else if (b.inWater) {
      b.climbing = false;
      b.vy = Math.max(b.vy - 9 * dt, -3);
      if (ctl.jumpHeld) b.vy = Math.min(b.vy + 22 * dt, 3.4);
      if (!b.headInWater && ctl.jumpHeld && b.hitWallPrev) b.vy = 6.5;
    } else {
      b.climbing = false;
      if (b.onGround) b.coyote = 0.1; else b.coyote = (b.coyote || 0) - dt;
      if (ctl.jump) b.jumpBuf = 0.12; else b.jumpBuf = (b.jumpBuf || 0) - dt;
      if (b.jumpBuf > 0 && b.coyote > 0 && !stunned) {
        b.vy = P.jump; b.jumpBuf = 0; b.coyote = 0; b.jumped = true;
        if (env.onJump) env.onJump(b);
      }
      b.vy = Math.max(b.vy - GRAV * dt, -40);
    }
  }
  const startY = b.y;
  moveBody(b, world, dt);
  b.hitWallPrev = b.hitWall;
  if (env.obstacles) for (const o of env.obstacles) o.collide(b, dt);
  if (b.onGround) {
    b.gx = Math.floor(b.x); b.gy = Math.floor(b.y - 0.01); b.gz = Math.floor(b.z);
    if (!world.solidAt(b.gx, b.gy, b.gz)) {
      // standing on an edge: find the block actually under us
      for (const [dx, dz] of [[b.hw, 0], [-b.hw, 0], [0, b.hw], [0, -b.hw], [b.hw, b.hw], [-b.hw, -b.hw], [b.hw, -b.hw], [-b.hw, b.hw]]) {
        const tx = Math.floor(b.x + dx * 0.98), tz = Math.floor(b.z + dz * 0.98);
        if (world.solidAt(tx, b.gy, tz)) { b.gx = tx; b.gz = tz; break; }
      }
    }
    const gd = BLOCKS[world.get(b.gx, b.gy, b.gz)];
    if (gd.bounce) { b.vy = ctl.jumpHeld ? 18 : 16.5; b.onGround = false; b.squash = 0.4; if (env.onBounce) env.onBounce(b); }
    else if (gd.conveyor) {
      const dir = world.getMeta(b.gx, b.gy, b.gz) & 3;
      const [cx, cz] = [[0, -1], [0, 1], [-1, 0], [1, 0]][dir];
      b.x += cx * 3.2 * dt; b.z += cz * 3.2 * dt;
      moveOne(b, world, 0, 0.0001); moveOne(b, world, 2, 0.0001);
    } else if (gd.crumble) world.triggerCrumble(b.gx, b.gy, b.gz);
    else if (gd.hurt && env.onHurt) env.onHurt(b, gd.hurt, 'cactus');
    if (!b.wasGround) {
      b.squash = Math.min(0.35, Math.max(0, -(b.landV || 0) - 6) / 30);
      if (env.onLand) env.onLand(b, b.maxY - b.y, b.landV || 0);
    }
    b.maxY = b.y;
  } else if (b.y > b.maxY || b.inWater || b.climbing || P.fly) b.maxY = b.y;
  b.squash = Math.max(0, b.squash - dt * 2.5);
  const hs = Math.hypot(b.vx, b.vz);
  if (hs > 0.3 && !P.fly) b.yawTarget = Math.atan2(-b.vx, -b.vz);
  b.walk += b.onGround ? hs * dt * 2.2 : dt * 4;
  b.t += dt;
  b.dy = b.y - startY;
}

// --- bean characters ---------------------------------------------------------------
const BEAN_COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d', '#6c5ce7', '#ff9f43', '#1dd1a1', '#54a0ff', '#ff6bcb', '#a3cb38', '#c56cf0', '#f8a5c2', '#7bed9f', '#70a1ff', '#eccc68', '#ff7f50'];
const HATS = ['none', 'cap', 'cone', 'crown', 'bow', 'tophat', 'leaf', 'none', 'cap'];
function beanLook(rng, color) {
  const c = hexRgb(color || rng.pick(BEAN_COLORS)).map(v => v / 255);
  return {
    body: c, belly: c.map(v => Math.min(1, v * 0.85 + 0.15)), visor: [0.12, 0.13, 0.18],
    hat: rng.pick(HATS), hatColor: hexRgb(rng.pick(BEAN_COLORS)).map(v => v / 255),
    feet: c.map(v => v * 0.6),
  };
}
const PART = M4.create(), PARENT = M4.create(), OUT = M4.create();
function drawBean(r, b, look, light, opts = {}) {
  const yaw = b.yawVis !== undefined ? b.yawVis : b.yaw;
  const sq = b.squash || 0;
  const tilt = b.stun > 0 ? Math.sin(b.t * 18) * 0.35 + 0.4 : 0;
  const lean = b.onGround ? Math.min(0.18, Math.hypot(b.vx, b.vz) * 0.02) : -0.1;
  M4.compose(PARENT, b.x, b.y, b.z, lean + tilt, yaw, tilt * 0.6, 1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
  const part = (ox, oy, oz, sx, sy, sz, col, rx = 0, ry = 0, rz = 0) => {
    M4.compose(PART, ox, oy, oz, rx, ry, rz, sx, sy, sz);
    M4.multiply(OUT, PARENT, PART);
    r.box(OUT, col, light);
  };
  const sw = Math.sin(b.walk * 3.2) * (b.onGround ? Math.min(1, Math.hypot(b.vx, b.vz) / 4) : 0.2);
  const air = !b.onGround && !b.climbing;
  // feet
  part(-0.16, 0.08 + Math.max(0, sw) * 0.12, sw * 0.22, 0.22, 0.16, 0.32, look.feet);
  part(0.16, 0.08 + Math.max(0, -sw) * 0.12, -sw * 0.22, 0.22, 0.16, 0.32, look.feet);
  // body (rounded bean: wide middle, narrower top and bottom)
  part(0, 0.72, 0, 0.72, 1.0, 0.58, look.body);
  part(0, 1.28, 0, 0.6, 0.18, 0.5, look.body);
  part(0, 0.2, 0, 0.6, 0.12, 0.5, look.body);
  part(0, 0.58, -0.25, 0.46, 0.42, 0.1, look.belly);
  // face visor and eyes
  part(0, 1.02, -0.27, 0.54, 0.34, 0.08, look.visor);
  const blink = (b.t % 4) < 0.12 ? 0.15 : 1;
  part(-0.12, 1.04, -0.31, 0.1, 0.14 * blink, 0.04, [1, 1, 1]);
  part(0.12, 1.04, -0.31, 0.1, 0.14 * blink, 0.04, [1, 1, 1]);
  // hands
  const arm = air ? -2.4 : sw * 0.7;
  part(-0.44, 0.75 + (air ? 0.35 : 0), arm * 0.12, 0.16, 0.16, 0.16, look.body.map(v => v * 0.85));
  part(0.44, 0.75 + (air ? 0.35 : 0), -arm * 0.12, 0.16, 0.16, 0.16, look.body.map(v => v * 0.85));
  // hats
  const hc = look.hatColor;
  switch (look.hat) {
    case 'cap': part(0, 1.42, 0, 0.62, 0.12, 0.54, hc); part(0, 1.38, -0.34, 0.5, 0.05, 0.22, hc); break;
    case 'cone': part(0, 1.48, 0, 0.42, 0.2, 0.42, hc); part(0, 1.64, 0, 0.26, 0.16, 0.26, hc); part(0, 1.76, 0, 0.1, 0.1, 0.1, [1, 1, 1]); break;
    case 'crown': for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) part(x, 1.48, z, 0.1, 0.18, 0.1, [1, 0.82, 0.25]); part(0, 1.4, 0, 0.5, 0.08, 0.5, [1, 0.82, 0.25]); break;
    case 'bow': part(-0.12, 1.42, 0.1, 0.18, 0.14, 0.08, hc); part(0.12, 1.42, 0.1, 0.18, 0.14, 0.08, hc); break;
    case 'tophat': part(0, 1.4, 0, 0.6, 0.05, 0.6, [0.12, 0.12, 0.14]); part(0, 1.58, 0, 0.38, 0.32, 0.38, [0.12, 0.12, 0.14]); part(0, 1.46, 0, 0.4, 0.06, 0.4, hc); break;
    case 'leaf': part(0, 1.46, 0, 0.06, 0.16, 0.06, [0.4, 0.25, 0.12]); part(0.1, 1.56, 0, 0.18, 0.05, 0.12, [0.3, 0.75, 0.3]); break;
    default: break;
  }
  if (opts.held !== undefined && opts.held > 0) {
    // small held item next to the right hand
    M4.compose(PART, 0.5, 0.78, -0.12, 0, 0, 0, 0.32, 0.32, 0.32);
    M4.multiply(OUT, PARENT, PART);
    r.item(opts.held, OUT, light, 0.2);
    r.beginBoxes();
  }
}

// --- animals ---------------------------------------------------------------------------
const ANIMAL3D = {
  sheep: { hw: 0.4, h: 1.1, speed: 1.0, col: [0.95, 0.95, 0.93] },
  pig: { hw: 0.4, h: 0.9, speed: 1.1, col: [0.95, 0.65, 0.7] },
  chicken: { hw: 0.25, h: 0.7, speed: 1.2, col: [0.98, 0.97, 0.94] },
};
class Animal extends Body {
  constructor(kind, x, y, z) {
    const a = ANIMAL3D[kind];
    super(x, y, z, a.hw, a.h);
    this.kind = kind; this.a = a; this.timer = Math.random() * 3; this.dir = Math.random() * TAU; this.moving = false;
    this.sheared = 0; this.home = [x, z];
  }
  update(dt, world, game) {
    this.timer -= dt; this.sheared = Math.max(0, this.sheared - dt);
    if (this.timer <= 0) {
      this.moving = !this.moving && Math.random() < 0.6;
      this.timer = 1.5 + Math.random() * 3;
      this.dir = Math.random() * TAU;
      if (Math.hypot(this.x - this.home[0], this.z - this.home[1]) > 14) this.dir = Math.atan2(-(this.home[0] - this.x), -(this.home[1] - this.z));
      if (Math.random() < 0.1 && game.near(this, 14)) game.sound.play(this.kind);
    }
    const p = game.player;
    if (p && Math.hypot(p.x - this.x, p.z - this.z) < 2.2 && this.panic > 0) this.moving = true;
    this.panic = Math.max(0, (this.panic || 0) - dt);
    const ctl = { mx: this.moving ? -Math.sin(this.dir) : 0, mz: this.moving ? -Math.cos(this.dir) : 0 };
    controlBody(this, ctl, { speed: this.a.speed * (this.panic > 0 ? 2.5 : 1), sprint: 0, jump: 8, accel: 8, air: 2 }, world, dt, {});
    if (this.hitWall && this.onGround) this.vy = 8;
    this.yawVis = this.yawTarget !== undefined ? this.yawTarget : this.yaw;
  }
  draw(r, light) {
    const c = this.a.col, yaw = this.yawVis || 0;
    M4.compose(PARENT, this.x, this.y, this.z, 0, yaw, 0, 1, 1, 1);
    const part = (ox, oy, oz, sx, sy, sz, col) => { M4.compose(PART, ox, oy, oz, 0, 0, 0, sx, sy, sz); M4.multiply(OUT, PARENT, PART); r.box(OUT, col, light); };
    const lg = Math.sin(this.walk * 4) * (this.moving ? 0.08 : 0);
    if (this.kind === 'chicken') {
      part(0, 0.42, 0, 0.36, 0.34, 0.46, c); part(0, 0.72, -0.2, 0.24, 0.28, 0.22, c);
      part(0, 0.7, -0.36, 0.1, 0.08, 0.12, [0.95, 0.65, 0.2]); part(0, 0.62, -0.32, 0.08, 0.1, 0.06, [0.85, 0.15, 0.15]);
      part(-0.08, 0.12, lg, 0.05, 0.24, 0.05, [0.95, 0.65, 0.2]); part(0.08, 0.12, -lg, 0.05, 0.24, 0.05, [0.95, 0.65, 0.2]);
    } else {
      const wool = this.kind === 'sheep' && !this.sheared ? [0.95, 0.95, 0.93] : (this.kind === 'sheep' ? [0.85, 0.82, 0.75] : c);
      part(0, 0.62, 0, 0.66, this.kind === 'sheep' && !this.sheared ? 0.6 : 0.5, 0.95, wool);
      part(0, 0.78, -0.55, 0.42, 0.42, 0.36, this.kind === 'sheep' ? [0.3, 0.28, 0.27] : c);
      if (this.kind === 'pig') part(0, 0.72, -0.76, 0.22, 0.16, 0.06, [0.88, 0.5, 0.55]);
      const leg = this.kind === 'sheep' ? [0.3, 0.28, 0.27] : c.map(v => v * 0.85);
      for (const [lx, lz, s] of [[-0.2, -0.3, 1], [0.2, -0.3, -1], [-0.2, 0.3, -1], [0.2, 0.3, 1]]) part(lx, 0.18, lz + lg * s, 0.16, 0.36, 0.16, leg);
    }
  }
}

// --- dropped items & particles --------------------------------------------------------
class ItemDrop {
  constructor(x, y, z, id, n = 1) {
    this.x = x; this.y = y; this.z = z; this.id = id; this.n = n;
    this.vx = (Math.random() - 0.5) * 2.5; this.vy = 3 + Math.random() * 2; this.vz = (Math.random() - 0.5) * 2.5;
    this.age = 0; this.dead = false; this.spin = Math.random() * TAU;
  }
  update(dt, world, game) {
    this.age += dt; this.spin += dt * 2;
    const p = game.player;
    const dx = p.x - this.x, dy = p.y + 0.8 - this.y, dz = p.z - this.z;
    const dist = Math.hypot(dx, dy, dz);
    if (this.age > 0.35 && dist < 2.4 && game.canPickup(this.id)) {
      this.x += dx * Math.min(1, dt * 10); this.y += dy * Math.min(1, dt * 10); this.z += dz * Math.min(1, dt * 10);
      if (dist < 0.6) { game.pickup(this); this.dead = true; }
      return;
    }
    this.vy -= 20 * dt;
    const ny = this.y + this.vy * dt;
    if (world.solidAt(Math.floor(this.x), Math.floor(ny - 0.15), Math.floor(this.z))) { this.vy = 0; this.vx *= 0.8; this.vz *= 0.8; }
    else this.y = ny;
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (!world.solidAt(Math.floor(nx), Math.floor(this.y), Math.floor(this.z))) this.x = nx; else this.vx = 0;
    if (!world.solidAt(Math.floor(this.x), Math.floor(this.y), Math.floor(nz))) this.z = nz; else this.vz = 0;
    if (this.age > 300 || this.y < -10) this.dead = true;
  }
  draw(r, sky, blk) {
    const flat = r.itemMesh(this.id).flat;
    const s = flat ? 0.4 : 0.28;
    M4.compose(r.model, this.x, this.y + 0.1 + Math.sin(this.age * 3) * 0.06 + s / 2, this.z, 0, this.spin, 0, s, s, s);
    r.item(this.id, r.model, sky, blk);
  }
}

class Particles {
  constructor() { this.list = []; }
  add(p) { if (this.list.length < 600) this.list.push(p); }
  burst(x, y, z, color, n = 10, speed = 3, size = 0.1, g = 12, life = 0.7) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, e = Math.random() * 1.2 - 0.2;
      this.add({ x, y, z, vx: Math.cos(a) * speed * Math.random(), vy: speed * (0.5 + e), vz: Math.sin(a) * speed * Math.random(), life: life * (0.6 + Math.random() * 0.6), max: life, color, size: size * (0.7 + Math.random() * 0.6), g });
    }
  }
  blockBreak(x, y, z, id) {
    const c = BLOCKS[id] ? BLOCKS[id].color : [0.6, 0.6, 0.6];
    for (let k = 0; k < 14; k++) {
      const s = 0.8 + Math.random() * 0.4;
      this.add({ x: x + Math.random(), y: y + Math.random(), z: z + Math.random(), vx: (Math.random() - 0.5) * 3, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 3, life: 0.6 + Math.random() * 0.4, max: 1, color: c.map(v => v * s), size: 0.09 + Math.random() * 0.06, g: 18 });
    }
  }
  confetti(x, y, z, n = 60) {
    for (let k = 0; k < n; k++) {
      const col = hexRgb(BEAN_COLORS[k % BEAN_COLORS.length]).map(v => v / 255);
      this.add({ x, y, z, vx: (Math.random() - 0.5) * 9, vy: 6 + Math.random() * 9, vz: (Math.random() - 0.5) * 9, life: 2.5 + Math.random(), max: 3, color: col, size: 0.12, g: 9, drag: 1.5, spin: true });
    }
  }
  update(dt, world) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vz *= f; }
      p.vy -= p.g * dt;
      const ny = p.y + p.vy * dt;
      if (world && world.solidAt(Math.floor(p.x), Math.floor(ny), Math.floor(p.z))) { p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      else p.y = ny;
      p.x += p.vx * dt; p.z += p.vz * dt;
    }
  }
  draw(r, light) {
    for (const p of this.list) {
      const s = p.size * Math.min(1, p.life / p.max * 2);
      r.boxAt(p.x, p.y, p.z, s, s, s, p.color, p.glow ? 1.4 : light, p.spin ? p.life * 7 : 0, p.spin ? p.life * 5 : 0);
    }
  }
}
