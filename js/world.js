'use strict';
// ---------------------------------------------------------------------------
// World: block storage, water flow, plant growth, timed blocks and lighting.
// ---------------------------------------------------------------------------

const WORLD_W = 3200;
const WORLD_H = 192;
const SEA_LEVEL = 100;
const WATER_MAX = 8;

class World {
  constructor(seedStr, W = WORLD_W, H = WORLD_H) {
    this.seedStr = String(seedStr);
    this.seed = hashString(this.seedStr);
    this.W = W; this.H = H;
    this.fg = new Uint8Array(W * H);
    this.bg = new Uint8Array(W * H);
    this.meta = new Uint8Array(W * H);
    this.biome = new Uint8Array(W);
    this.terrainY = new Int16Array(W); // generated ground height, used for sky light
    this.zones = [];
    this.courses = [];
    this.emitters = [];
    this.npcSpawns = [];
    this.roads = [];
    this.spawn = { x: W / 2, y: 60 };
    this.waterActive = new Set();
    this.springs = new Set();
    this.sponges = new Set();
    this.growing = new Map();
    this.timers = new Map();
    this.jobs = [];
    this.pops = new Map();
    this.events = [];
    this.clock = 0;
    this.dirty = true;
    this.waterFlip = false;
    this.focusX = W / 2;
  }

  idx(x, y) { return y * this.W + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  get(x, y) {
    if (y < 0) return B.air;
    if (x < 0 || x >= this.W || y >= this.H) return B.bedrock;
    return this.fg[y * this.W + x];
  }
  def(x, y) { return BLOCKS[this.get(x, y)]; }
  getMeta(x, y) { return this.inb(x, y) ? this.meta[y * this.W + x] : 0; }
  getBg(x, y) { return this.inb(x, y) ? this.bg[y * this.W + x] : 0; }
  setRaw(x, y, id, m = 0) {
    if (!this.inb(x, y)) return;
    const i = y * this.W + x;
    this.fg[i] = id; this.meta[i] = m;
  }
  setBgRaw(x, y, id) { if (this.inb(x, y)) this.bg[y * this.W + x] = id; }

  // Surface row (first solid block from the top) at column x.
  surfaceY(x) {
    x = clamp(Math.floor(x), 0, this.W - 1);
    for (let y = 0; y < this.H; y++) {
      const d = BLOCKS[this.fg[y * this.W + x]];
      if (d.solid || d.liquid) return y;
    }
    return this.H - 1;
  }

  // Set a block with all game side effects (water wakes, plant support, ...)
  set(x, y, id, m = 0, opts = {}) {
    if (!this.inb(x, y)) return false;
    const W = this.W, i = y * W + x;
    const old = this.fg[i];
    if (old === id && this.meta[i] === m) return false;
    const od = BLOCKS[old], nd = BLOCKS[id];
    this.fg[i] = id; this.meta[i] = m;

    if (od.spring) this.springs.delete(i);
    if (nd.spring) this.springs.add(i);
    if (od.sponge) this.sponges.delete(i);
    if (nd.sponge) { this.sponges.add(i); this.absorb(x, y, 4); }
    if (od.plant) this.growing.delete(i);
    if (nd.plant && plantGrows(nd, m)) this.growing.set(i, growTime(nd));
    if (this.timers.has(i) && !opts.keepTimer) this.timers.delete(i);

    // Doors are two blocks tall: removing one half removes the other.
    if (od.door === 'bottom' && id !== B.door && this.get(x, y - 1) === B.door_top) this.setRaw(x, y - 1, B.air);
    if (od.door === 'top' && id !== B.door_top && this.get(x, y + 1) === B.door) this.setRaw(x, y + 1, B.air);

    this.wakeAround(i);

    // plant above loses its soil
    if (y > 0) {
      const ai = i - W, aid = this.fg[ai], ad = BLOCKS[aid];
      if (ad.plant && !plantSupported(aid, id)) {
        this.set(x, y - 1, B.air);
        this.events.push({ type: 'break', x, y: y - 1, id: aid });
      } else if (ad.fall && !nd.solid) {
        this.setRaw(x, y - 1, B.air);
        this.wakeAround(ai);
        this.events.push({ type: 'fall', x, y: y - 1, id: aid });
      }
    }
    // grass smothered by a solid block turns into dirt
    if (nd.opaque && nd.solid && y + 1 < this.H && this.fg[i + W] === B.grass) this.fg[i + W] = B.dirt;

    if (!opts.silent && id !== B.air) this.pops.set(i, performance.now());
    this.dirty = true;
    return true;
  }

  setBg(x, y, id) {
    if (!this.inb(x, y)) return false;
    const i = y * this.W + x;
    if (this.bg[i] === id) return false;
    this.bg[i] = id; this.dirty = true;
    return true;
  }

  // --- water -----------------------------------------------------------------
  wake(i) {
    if (i >= 0 && i < this.fg.length && this.fg[i] === B.water) this.waterActive.add(i);
  }
  wakeAround(i) {
    const W = this.W;
    this.wake(i); this.wake(i - 1); this.wake(i + 1); this.wake(i - W); this.wake(i + W);
  }
  absorb(cx, cy, r) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (!this.inb(x, y) || (x - cx) ** 2 + (y - cy) ** 2 > r * r + 1) continue;
      const i = this.idx(x, y);
      if (this.fg[i] === B.water) { this.fg[i] = B.air; this.meta[i] = 0; this.wakeAround(i); }
    }
    this.dirty = true;
  }
  addWater(x, y, amount = WATER_MAX) {
    if (!this.inb(x, y)) return false;
    const i = this.idx(x, y);
    const id = this.fg[i];
    if (id === B.air || BLOCKS[id].replaceable) { this.fg[i] = B.water; this.meta[i] = amount; }
    else if (id === B.water) this.meta[i] = Math.min(WATER_MAX, this.meta[i] + amount);
    else return false;
    this.wakeAround(i);
    this.dirty = true;
    return true;
  }

  waterStep() {
    const W = this.W, fg = this.fg, meta = this.meta, WATER = B.water, AIR = B.air;
    for (const i of this.springs) {
      if (Math.abs((i % W) - this.focusX) > 180) continue;
      for (const n of [i - 1, i + 1, i + W, i - W]) {
        if (n < 0 || n >= fg.length) continue;
        if (n === i - W && fg[n] !== WATER && fg[n] !== AIR) continue;
        if (fg[n] === AIR && n !== i - W) { fg[n] = WATER; meta[n] = WATER_MAX; this.wakeAround(n); }
        else if (fg[n] === WATER && meta[n] < WATER_MAX) { meta[n] = WATER_MAX; this.wakeAround(n); }
      }
    }
    for (const i of this.sponges) {
      for (const n of [i - 1, i + 1, i + W, i - W]) {
        if (n >= 0 && n < fg.length && fg[n] === WATER) { fg[n] = AIR; meta[n] = 0; this.wakeAround(n); }
      }
    }
    if (!this.waterActive.size) return;
    let list = Array.from(this.waterActive);
    this.waterActive.clear();
    if (list.length > 5000) {
      // keep the simulation responsive: process the cells nearest the player
      list.sort((a, b) => Math.abs((a % W) - this.focusX) - Math.abs((b % W) - this.focusX));
      for (let k = 5000; k < list.length; k++) this.waterActive.add(list[k]);
      list = list.slice(0, 5000);
    }
    list.sort((a, b) => b - a); // bottom rows first so falling water looks smooth
    this.waterFlip = !this.waterFlip;
    for (const i of list) this.flowCell(i);
    this.dirty = true;
  }

  flowCell(i) {
    const W = this.W, H = this.H, fg = this.fg, meta = this.meta, WATER = B.water, AIR = B.air;
    if (fg[i] !== WATER) return;
    let a = meta[i];
    if (a <= 0) { fg[i] = AIR; this.wakeAround(i); return; }
    const x = i % W, y = (i / W) | 0;
    if (y + 1 < H) {
      const b = i + W, bid = fg[b];
      if (bid === AIR) {
        fg[b] = WATER; meta[b] = a; fg[i] = AIR; meta[i] = 0;
        this.wakeAround(i); this.wakeAround(b);
        return;
      }
      if (bid === WATER && meta[b] < WATER_MAX) {
        const t = Math.min(a, WATER_MAX - meta[b]);
        meta[b] += t; a -= t; meta[i] = a;
        this.wakeAround(b); this.wakeAround(i);
        if (a === 0) { fg[i] = AIR; return; }
      }
    }
    const L = x > 0 ? i - 1 : -1, R = x < W - 1 ? i + 1 : -1;
    const lOk = L >= 0 && (fg[L] === AIR || fg[L] === WATER);
    const rOk = R >= 0 && (fg[R] === AIR || fg[R] === WATER);
    if (!lOk && !rOk) return;
    const la = lOk && fg[L] === WATER ? meta[L] : 0;
    const ra = rOk && fg[R] === WATER ? meta[R] : 0;
    let hi = a, lo = a;
    if (lOk) { hi = Math.max(hi, la); lo = Math.min(lo, la); }
    if (rOk) { hi = Math.max(hi, ra); lo = Math.min(lo, ra); }
    if (hi - lo < 2) return;
    const cells = 1 + (lOk ? 1 : 0) + (rOk ? 1 : 0);
    const total = a + la + ra;
    const avg = Math.floor(total / cells);
    let rem = total - avg * cells;
    let na = avg, nl = avg, nr = avg;
    if (rem > 0) { na++; rem--; }
    if (rem > 0) {
      if (lOk && rOk) { if (this.waterFlip) nl++; else nr++; }
      else if (lOk) nl++; else nr++;
    }
    meta[i] = na; if (na === 0) fg[i] = AIR;
    if (lOk) { if (nl > 0) { fg[L] = WATER; meta[L] = nl; } else { fg[L] = AIR; meta[L] = 0; } this.wakeAround(L); }
    if (rOk) { if (nr > 0) { fg[R] = WATER; meta[R] = nr; } else { fg[R] = AIR; meta[R] = 0; } this.wakeAround(R); }
    this.wakeAround(i);
  }

  // --- growth -----------------------------------------------------------------
  growStep(dt, env) {
    for (const [i, t] of this.growing) {
      const x = i % this.W, y = (i / this.W) | 0;
      let m = env.night ? 0.6 : 1;
      if (env.rain) m *= 1.35;
      if (this.fg[i + this.W] === B.farmland) m *= 1.6;
      if (this.nearWater(x, y)) m *= 1.4;
      const nt = t - dt * m;
      if (nt > 0) this.growing.set(i, nt);
      else this.advancePlant(i);
    }
  }
  nearWater(x, y) {
    for (let dy = 0; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) if (this.get(x + dx, y + dy) === B.water) return true;
    return false;
  }
  advancePlant(i, instant = false) {
    const id = this.fg[i], d = BLOCKS[id];
    if (!d.plant) { this.growing.delete(i); return false; }
    const pl = d.plant, st = this.meta[i];
    const x = i % this.W, y = (i / this.W) | 0;
    if (st < pl.stages - 1) {
      this.meta[i] = st + 1;
      this.pops.set(i, performance.now());
      this.events.push({ type: 'grow', x, y, id });
      if (plantGrows(d, st + 1)) this.growing.set(i, growTime(d) * (instant ? 0.3 : 1));
      else this.growing.delete(i);
      this.dirty = true;
      return true;
    }
    this.growing.delete(i);
    const f = pl.final;
    if (!f || f === 'stay' || f === 'none') return false;
    if (f.block) {
      this.set(x, y, B[f.block]);
      this.events.push({ type: 'grow', x, y, id });
      return true;
    }
    if (f.stack) {
      let h = 1;
      while (this.get(x, y + h) === id) h++;
      if (h < f.stack && this.get(x, y - 1) === B.air) {
        this.set(x, y - 1, id);
        this.events.push({ type: 'grow', x, y: y - 1, id });
        return true;
      }
      return false;
    }
    if (f.tree || f.struct) {
      const S = new CollectSink(this);
      const rng = new RNG(hashString(this.seedStr + ':' + i + ':' + Math.floor(this.clock)));
      let label = null;
      if (f.tree) buildTree(S, x, y, f.tree, rng);
      else label = buildGrownStructure(S, x, y, f.struct, rng);
      this.setRaw(x, y, B.air);
      this.startJob(S.ops, x, y, f.tree ? 1.4 : 3.2);
      this.events.push({ type: 'growBig', x, y, id, label });
      return true;
    }
    return false;
  }

  // Animated construction used for trees and grown structures.
  startJob(ops, ox, oy, duration) {
    // keep only the last operation per cell, drop no-op clears
    const last = new Map();
    for (const o of ops) last.set((o.layer ? -1 : 1) * (o.y * this.W + o.x + 1), o);
    ops = [...last.values()].filter(o => this.canBuildOver(o) &&
      !(o.layer === 0 && o.id === B.air && this.get(o.x, o.y) === B.air));
    const key = o => (oy - o.y) + Math.abs(o.x - ox) * 0.35 + (o.layer ? 0.2 : 0) - (o.id === B.air ? 0.5 : 0);
    ops.sort((a, b) => key(a) - key(b));
    this.jobs.push({ ops, k: 0, rate: Math.max(12, ops.length / duration), acc: 0 });
  }
  canBuildOver(o) {
    if (!this.inb(o.x, o.y)) return false;
    if (o.layer === 1) return true;
    const cur = BLOCKS[this.get(o.x, o.y)];
    if (cur.id === B.bedrock) return false;
    return cur.id === B.air || cur.liquid || cur.plant || cur.cat === 'nature';
  }
  jobStep(dt) {
    for (const job of this.jobs) {
      job.acc += dt * job.rate;
      while (job.acc >= 1 && job.k < job.ops.length) {
        job.acc -= 1;
        const o = job.ops[job.k++];
        if (o.layer === 1) this.setBg(o.x, o.y, o.id);
        else if (this.canBuildOver(o)) {
          this.set(o.x, o.y, o.id, o.meta || 0);
          if (o.id !== B.air) this.events.push({ type: 'place', x: o.x, y: o.y, id: o.id, quiet: job.k % 3 !== 0 });
        }
      }
    }
    this.jobs = this.jobs.filter(j => j.k < j.ops.length);
  }

  // --- timed blocks (crumbling platforms, boom blocks) ---------------------------
  triggerCrumble(x, y) {
    const i = this.idx(x, y);
    if (this.fg[i] !== B.crumble || this.timers.has(i)) return;
    this.timers.set(i, { kind: 'shake', t: 0.45 });
  }
  ignite(x, y, fuse = 1.6) {
    const i = this.idx(x, y);
    if (this.fg[i] !== B.boom) return;
    const cur = this.timers.get(i);
    if (cur && cur.kind === 'boom' && cur.t <= fuse) return;
    this.timers.set(i, { kind: 'boom', t: fuse, fuse });
    this.events.push({ type: 'fuse', x, y });
  }
  timerStep(dt, isOccupied) {
    for (const [i, tm] of this.timers) {
      tm.t -= dt;
      if (tm.t > 0) continue;
      const x = i % this.W, y = (i / this.W) | 0;
      if (tm.kind === 'shake') {
        this.set(x, y, B.air, 0, { silent: true });
        this.events.push({ type: 'crumble', x, y });
        this.timers.set(i, { kind: 'restore', t: 3.2 });
      } else if (tm.kind === 'restore') {
        if (this.fg[i] === B.air && !isOccupied(x, y)) {
          this.set(x, y, B.crumble, 0, { keepTimer: true });
          this.timers.delete(i);
        } else if (this.fg[i] !== B.air) this.timers.delete(i);
        else tm.t = 0.5;
      } else if (tm.kind === 'boom') {
        this.timers.delete(i);
        this.explode(x, y, 3.6);
      }
    }
  }
  explode(cx, cy, r) {
    this.events.push({ type: 'explode', x: cx, y: cy, r });
    const R = Math.ceil(r);
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      const dd = (x - cx) ** 2 + (y - cy) ** 2;
      if (dd > r * r || !this.inb(x, y)) continue;
      const id = this.get(x, y), d = BLOCKS[id];
      if (id === B.air || id === B.bedrock || d.liquid) continue;
      if (d.boom && !(x === cx && y === cy)) { this.ignite(x, y, 0.15 + Math.random() * 0.2); continue; }
      this.set(x, y, B.air, 0, { silent: true });
      if (Math.random() < 0.45) this.events.push({ type: 'debris', x, y, id });
    }
  }

  // Keep pending crumble blocks in the saved world.
  restorePending() {
    for (const [i, tm] of this.timers) {
      if (tm.kind === 'restore' && this.fg[i] === B.air) this.fg[i] = B.crumble;
    }
  }

  // Scan the whole world for springs, sponges and growing plants.
  rebuildRegistries() {
    this.springs.clear(); this.sponges.clear(); this.growing.clear();
    const fg = this.fg;
    for (let i = 0; i < fg.length; i++) {
      const id = fg[i];
      if (id === B.air || id === B.stone || id === B.dirt) continue;
      const d = BLOCKS[id];
      if (d.spring) this.springs.add(i);
      else if (d.sponge) this.sponges.add(i);
      else if (d.plant && plantGrows(d, this.meta[i])) this.growing.set(i, growTime(d) * Math.random());
    }
  }

  // --- light -------------------------------------------------------------------
  // Fills sky[] and blk[] (0..15) for the rectangle (x0,y0,w,h).
  computeLight(x0, y0, w, h, sky, blk, att) {
    const W = this.W, fg = this.fg, bgArr = this.bg;
    const LITWIN = B.litwindow;
    for (let cx = 0; cx < w; cx++) {
      const x = x0 + cx;
      if (x < 0 || x >= W) {
        for (let cy = 0; cy < h; cy++) { const k = cy * w + cx; sky[k] = 0; blk[k] = 0; att[k] = 4; }
        continue;
      }
      // v: sky light reaching this cell. nat: the same, ignoring houses and
      // trees, so the ground below them is not shaded in a vertical stripe.
      let v = 15, nat = 15, grounded = false;
      const yEnd = Math.min(this.H, y0 + h);
      const groundY = this.terrainY[x];
      for (let y = 0; y < yEnd; y++) {
        const i = y * W + x, d = BLOCKS[fg[i]];
        let cell;
        if (!grounded && y >= groundY) { grounded = true; if (nat > v) v = nat; }
        if (d.opaque) {
          cell = v; v = v > 4 ? v - 4 : 0;
        } else {
          if (d.atten) { v = v > d.atten ? v - d.atten : 0; if (d.liquid) nat = nat > d.atten ? nat - d.atten : 0; }
          cell = v;
        }
        if (y >= y0) {
          const k = (y - y0) * w + cx;
          sky[k] = cell;
          let e = d.light;
          if (!d.opaque && bgArr[i] === LITWIN && e < 8) e = 8;
          blk[k] = e;
          att[k] = d.opaque ? 3 : 1;
        }
      }
      for (let y = Math.max(yEnd, y0); y < y0 + h; y++) { const k = (y - y0) * w + cx; sky[k] = 0; blk[k] = 0; att[k] = 4; }
    }
    spreadLight(sky, att, w, h);
    spreadLight(blk, att, w, h);
  }
}

function spreadLight(a, att, w, h) {
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let k = y * w;
      for (let x = 0; x < w; x++, k++) {
        let v = a[k];
        const t = att[k];
        if (x > 0) { const n = a[k - 1] - t; if (n > v) v = n; }
        if (y > 0) { const n = a[k - w] - t; if (n > v) v = n; }
        a[k] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      let k = y * w + w - 1;
      for (let x = w - 1; x >= 0; x--, k--) {
        let v = a[k];
        const t = att[k];
        if (x < w - 1) { const n = a[k + 1] - t; if (n > v) v = n; }
        if (y < h - 1) { const n = a[k + w] - t; if (n > v) v = n; }
        a[k] = v;
      }
    }
  }
}

function plantGrows(d, stage) {
  const pl = d.plant;
  if (!pl || !pl.time) return false;
  if (stage < pl.stages - 1) return true;
  return pl.final && pl.final !== 'stay' && pl.final !== 'none';
}
function growTime(d) { return d.plant.time * (0.75 + Math.random() * 0.5); }
function plantSupported(plantId, belowId) {
  const d = BLOCKS[plantId];
  if (d.plant.final && d.plant.final.stack && belowId === plantId) return true;
  return isSoil(belowId, d.plant.soil);
}

// Sinks let the same structure code write straight into the world during
// generation, or collect operations to play back as a growth animation.
class GenSink {
  constructor(world) { this.w = world; }
  set(x, y, id, m = 0) { this.w.setRaw(x, y, id, m); }
  bg(x, y, id) { this.w.setBgRaw(x, y, id); }
  get(x, y) { return this.w.get(x, y); }
}
class CollectSink {
  constructor(world) { this.w = world; this.ops = []; }
  set(x, y, id, m = 0) { this.ops.push({ x, y, id, meta: m, layer: 0 }); }
  bg(x, y, id) { this.ops.push({ x, y, id, layer: 1 }); }
  get(x, y) { return this.w.get(x, y); }
}
