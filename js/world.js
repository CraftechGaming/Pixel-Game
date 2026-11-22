'use strict';
// ---------------------------------------------------------------------------
// Voxel world: 16x16 chunk columns, block access, water flow, plant growth,
// timed blocks (crumbling tiles, boom blocks) and animated building jobs.
// Coordinates: x/z horizontal, y up. Blocks at y < height(x,z) are ground.
// ---------------------------------------------------------------------------

const CS = 16;   // chunk size (x and z)
const CH = 96;   // chunk height
const SEA = 32;  // sea level
const CK = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
const cidx = (x, y, z) => (y * CS + z) * CS + x;

// lookup tables filled after blocks are defined
let OPAQUE, SOLIDT, LIGHT, LEAVESET;
function buildTables() {
  OPAQUE = new Uint8Array(256); SOLIDT = new Uint8Array(256); LIGHT = new Uint8Array(256); LEAVESET = new Uint8Array(256);
  for (const d of BLOCKS) {
    OPAQUE[d.id] = d.opaque && d.shape === 'cube' ? 1 : 0;
    SOLIDT[d.id] = d.solid ? 1 : 0;
    LIGHT[d.id] = d.light || 0;
    LEAVESET[d.id] = d.leaves ? 1 : 0;
  }
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CS * CS * CH);
    this.meta = new Uint8Array(CS * CS * CH);
    this.lights = new Set();
    this.growers = new Map(); // index -> seconds until next growth
    this.mesh = null;
    this.modified = false;
  }
  scan() {
    this.lights.clear(); this.growers.clear();
    const b = this.blocks;
    for (let i = 0; i < b.length; i++) {
      const id = b[i];
      if (!id) continue;
      if (LIGHT[id]) this.lights.add(i);
      const d = BLOCKS[id];
      if (d.grow && !(d.stages && this.meta[i] >= d.stages.length - 1)) this.growers.set(i, d.grow.time * (0.6 + Math.random() * 0.8));
    }
  }
}

class World {
  constructor(seedStr, mode, gen) {
    this.seedStr = String(seedStr);
    this.seed = hashString(this.seedStr);
    this.mode = mode;
    this.gen = gen;               // terrain generator (null for parkour arenas)
    this.chunks = new Map();
    this.saved = new Map();       // chunk key -> saved arrays (applied when generated)
    this.dirty = new Set();       // chunk keys needing a new mesh
    this.urgent = new Set();      // remesh these first
    this.waterQ = new Set();
    this.timers = new Map();      // "x,y,z" -> {kind, t, ...}
    this.jobs = [];
    this.events = [];
    this.clock = 0;
  }
  getChunk(cx, cz) { return this.chunks.get(CK(cx, cz)); }
  ensureChunk(cx, cz) {
    const k = CK(cx, cz);
    let c = this.chunks.get(k);
    if (c) return c;
    c = new Chunk(cx, cz);
    if (this.gen) this.gen.fill(c);
    const sv = this.saved.get(k);
    if (sv) { c.blocks.set(sv.b); c.meta.set(sv.m); c.modified = true; }
    c.scan();
    this.chunks.set(k, c);
    this.dirty.add(k);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nk = CK(cx + dx, cz + dz); if (this.chunks.has(nk)) this.dirty.add(nk); }
    return c;
  }
  unload(cx, cz) {
    const k = CK(cx, cz), c = this.chunks.get(k);
    if (!c) return null;
    if (c.modified) this.saved.set(k, { b: c.blocks.slice(), m: c.meta.slice() });
    this.chunks.delete(k); this.dirty.delete(k); this.urgent.delete(k);
    return c;
  }

  get(x, y, z) {
    if (y < 0) return B.bedrock;
    if (y >= CH) return 0;
    const c = this.chunks.get(CK(x >> 4, z >> 4));
    return c ? c.blocks[cidx(x & 15, y, z & 15)] : 0;
  }
  getMeta(x, y, z) {
    if (y < 0 || y >= CH) return 0;
    const c = this.chunks.get(CK(x >> 4, z >> 4));
    return c ? c.meta[cidx(x & 15, y, z & 15)] : 0;
  }
  isLoaded(x, z) { return this.chunks.has(CK(x >> 4, z >> 4)); }
  solidAt(x, y, z) {
    const id = this.get(x, y, z);
    if (SOLIDT[id]) return true;
    if (id === B.door || id === B.door_top) return !(this.getMeta(x, y, z) & 4);
    return false;
  }
  // highest block that is not air (for spawning and the camera)
  topY(x, z) {
    for (let y = CH - 1; y > 0; y--) { const id = this.get(x, y, z); if (id && id !== B.water && SOLIDT[id] && !LEAVESET[id]) return y; }
    return 0;
  }

  markDirty(x, y, z, light) {
    const cx = x >> 4, cz = z >> 4, lx = x & 15, lz = z & 15;
    this.urgent.add(CK(cx, cz));
    const r = light ? 15 : 1;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const nearX = dx < 0 ? lx < r : dx > 0 ? lx > 15 - r : true;
      const nearZ = dz < 0 ? lz < r : dz > 0 ? lz > 15 - r : true;
      if (nearX && nearZ) {
        const k = CK(cx + dx, cz + dz);
        if (this.chunks.has(k)) (light ? this.dirty : this.urgent).add(k);
      }
    }
  }

  set(x, y, z, id, meta = 0, opts = {}) {
    if (y < 0 || y >= CH) return false;
    const c = this.chunks.get(CK(x >> 4, z >> 4));
    if (!c) return false;
    const i = cidx(x & 15, y, z & 15);
    const old = c.blocks[i];
    if (old === id && c.meta[i] === meta) return false;
    c.blocks[i] = id; c.meta[i] = meta; c.modified = true;
    if (LIGHT[old]) c.lights.delete(i);
    if (LIGHT[id]) c.lights.add(i);
    c.growers.delete(i);
    const nd = BLOCKS[id];
    if (nd.grow && !(nd.stages && meta >= nd.stages.length - 1)) c.growers.set(i, nd.grow.time * (0.7 + Math.random() * 0.6));
    const lightChange = LIGHT[old] !== LIGHT[id] || OPAQUE[old] !== OPAQUE[id];
    this.markDirty(x, y, z, lightChange);
    this.wakeWater(x, y, z);
    if (!opts.quiet) this.events.push({ type: 'set', x, y, z, id, old });
    // plants and doors lose their support
    const above = this.get(x, y + 1, z), ad = BLOCKS[above];
    if (!SOLIDT[id] && (ad.plant || ad.torch || above === B.door) && !opts.keepAbove) {
      this.set(x, y + 1, z, 0);
      this.events.push({ type: 'pop', x, y: y + 1, z, id: above });
    }
    if (old === B.door && id !== B.door && this.get(x, y + 1, z) === B.door_top) this.set(x, y + 1, z, 0, 0, { quiet: true });
    if (old === B.door_top && id !== B.door_top && this.get(x, y - 1, z) === B.door) this.set(x, y - 1, z, 0, 0, { quiet: true });
    if (nd.sponge) this.absorb(x, y, z, 4);
    return true;
  }

  // --- water ---------------------------------------------------------------------
  // meta for water: 0 = source, 1..7 = flowing (bigger = further from source)
  wakeWater(x, y, z) {
    for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (this.get(x + dx, y + dy, z + dz) === B.water) this.waterQ.add(`${x + dx},${y + dy},${z + dz}`);
    }
  }
  canFlowInto(x, y, z) {
    const id = this.get(x, y, z);
    return id === 0 || (BLOCKS[id].replaceable && id !== B.water) || (BLOCKS[id].plant && !BLOCKS[id].solid);
  }
  waterStep(maxN = 400) {
    if (!this.waterQ.size) return;
    const list = [...this.waterQ].slice(0, maxN);
    for (const k of list) this.waterQ.delete(k);
    for (const k of list) {
      const [x, y, z] = k.split(',').map(Number);
      if (this.get(x, y, z) !== B.water || !this.isLoaded(x, z)) continue;
      const lvl = this.getMeta(x, y, z);
      if (lvl > 0) {
        // flowing water needs a feeder: water above, or a neighbour closer to the source
        let fed = this.get(x, y + 1, z) === B.water;
        let sources = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (this.get(x + dx, y, z + dz) !== B.water) continue;
          const nl = this.getMeta(x + dx, y, z + dz);
          if (nl < lvl) fed = true;
          if (nl === 0) sources++;
        }
        if (!fed) { this.set(x, y, z, 0, 0, { quiet: true }); continue; }
        if (sources >= 2 && (SOLIDT[this.get(x, y - 1, z)] || this.get(x, y - 1, z) === B.water)) { this.set(x, y, z, B.water, 0, { quiet: true }); continue; }
      }
      if (this.canFlowInto(x, y - 1, z)) { this.set(x, y - 1, z, B.water, 1, { quiet: true }); continue; }
      if (this.get(x, y - 1, z) === B.water) continue;
      if (lvl >= 7) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (this.canFlowInto(nx, y, nz)) this.set(nx, y, nz, B.water, lvl + 1, { quiet: true });
        else if (this.get(nx, y, nz) === B.water && this.getMeta(nx, y, nz) > lvl + 1) this.set(nx, y, nz, B.water, lvl + 1, { quiet: true });
      }
    }
  }
  absorb(cx, cy, cz, r) {
    for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) {
      if (this.get(x, y, z) === B.water) this.set(x, y, z, 0, 0, { quiet: true });
    }
  }

  // --- growth ------------------------------------------------------------------------
  growStep(dt, env) {
    for (const c of this.chunks.values()) {
      if (!c.growers.size) continue;
      for (const [i, t] of c.growers) {
        const nt = t - dt * (env.rain ? 1.4 : 1) * (env.night ? 0.6 : 1);
        if (nt > 0) { c.growers.set(i, nt); continue; }
        c.growers.delete(i);
        const lx = i & 15, lz = (i >> 4) & 15, y = Math.floor(i / 256);
        this.grow(c.cx * 16 + lx, y, c.cz * 16 + lz);
      }
    }
  }
  grow(x, y, z) {
    const id = this.get(x, y, z), d = BLOCKS[id];
    if (!d.grow) return false;
    if (d.stages) {
      const m = this.getMeta(x, y, z);
      if (m >= d.stages.length - 1) return false;
      this.set(x, y, z, id, m + 1, { quiet: true });
      this.events.push({ type: 'grow', x, y, z, id });
      return true;
    }
    const rng = new RNG(hashString(`${this.seedStr}:${x},${y},${z}:${Math.floor(this.clock)}`));
    const S = new CollectSink(this);
    const label = growStructure(S, x, y, z, d.grow.into, rng);
    this.set(x, y, z, 0, 0, { quiet: true });
    this.startJob(S.ops, x, y, z, d.grow.into === 'house' || d.grow.into === 'tower' ? 3 : 1.3);
    this.events.push({ type: 'growBig', x, y, z, id, label });
    return true;
  }
  startJob(ops, ox, oy, oz, duration) {
    const last = new Map();
    for (const o of ops) last.set(`${o.x},${o.y},${o.z}`, o);
    ops = [...last.values()].filter(o => this.canBuildOver(o) && !(o.id === 0 && this.get(o.x, o.y, o.z) === 0));
    const key = o => (o.y - oy) + Math.hypot(o.x - ox, o.z - oz) * 0.3 - (o.id === 0 ? 0.5 : 0);
    ops.sort((a, b) => key(a) - key(b));
    this.jobs.push({ ops, k: 0, rate: Math.max(20, ops.length / duration), acc: 0 });
  }
  canBuildOver(o) {
    if (!this.isLoaded(o.x, o.z)) return false;
    const cur = BLOCKS[this.get(o.x, o.y, o.z)];
    if (cur.id === B.bedrock) return false;
    return cur.id === 0 || cur.liquid || cur.plant || cur.cat === 'nature' || cur.leaves;
  }
  jobStep(dt) {
    for (const job of this.jobs) {
      job.acc += dt * job.rate;
      while (job.acc >= 1 && job.k < job.ops.length) {
        job.acc -= 1;
        const o = job.ops[job.k++];
        if (this.canBuildOver(o) && this.set(o.x, o.y, o.z, o.id, o.meta || 0, { quiet: true }) && o.id) {
          if (job.k % 3 === 0) this.events.push({ type: 'build', x: o.x, y: o.y, z: o.z, id: o.id });
        }
      }
    }
    this.jobs = this.jobs.filter(j => j.k < j.ops.length);
  }

  // --- timed blocks --------------------------------------------------------------------
  triggerCrumble(x, y, z) {
    const k = `${x},${y},${z}`;
    if (this.get(x, y, z) !== B.crumble || this.timers.has(k)) return;
    this.timers.set(k, { kind: 'shake', t: 0.45, x, y, z });
  }
  ignite(x, y, z) {
    const k = `${x},${y},${z}`;
    if (this.get(x, y, z) !== B.boom || this.timers.has(k)) return;
    this.timers.set(k, { kind: 'boom', t: 1.6, x, y, z });
    this.events.push({ type: 'fuse', x, y, z });
  }
  timerStep(dt, occupied) {
    for (const [k, tm] of this.timers) {
      tm.t -= dt;
      if (tm.t > 0) continue;
      if (tm.kind === 'shake') {
        this.set(tm.x, tm.y, tm.z, 0, 0, { quiet: true });
        this.events.push({ type: 'crumble', x: tm.x, y: tm.y, z: tm.z });
        tm.kind = 'restore'; tm.t = 3.5;
      } else if (tm.kind === 'restore') {
        if (this.get(tm.x, tm.y, tm.z) !== 0) { this.timers.delete(k); continue; }
        if (occupied(tm.x, tm.y, tm.z)) { tm.t = 0.4; continue; }
        this.set(tm.x, tm.y, tm.z, B.crumble, 0, { quiet: true });
        this.timers.delete(k);
      } else if (tm.kind === 'boom') {
        this.timers.delete(k);
        this.explode(tm.x, tm.y, tm.z, 3.4);
      }
    }
  }
  explode(cx, cy, cz, r) {
    this.events.push({ type: 'explode', x: cx, y: cy, z: cz, r });
    const R = Math.ceil(r);
    for (let y = cy - R; y <= cy + R; y++) for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 > r * r) continue;
      const id = this.get(x, y, z);
      if (!id || id === B.bedrock || BLOCKS[id].liquid || id === B.gate) continue;
      if (id === B.boom && !(x === cx && y === cy && z === cz)) { this.ignite(x, y, z); const t = this.timers.get(`${x},${y},${z}`); if (t) t.t = 0.15 + Math.random() * 0.2; continue; }
      this.set(x, y, z, 0, 0, { quiet: true });
      if (Math.random() < 0.25) this.events.push({ type: 'debris', x, y, z, id });
    }
  }
}

// Sinks let structure code write straight into a chunk during generation, into
// the world, or collect operations to replay as a growth animation.
class CollectSink {
  constructor(world) { this.w = world; this.ops = []; }
  set(x, y, z, id, meta = 0) { this.ops.push({ x, y, z, id, meta }); }
  get(x, y, z) { return this.w.get(x, y, z); }
}
class WorldSink {
  constructor(world) { this.w = world; }
  set(x, y, z, id, meta = 0) { this.w.set(x, y, z, id, meta, { quiet: true, keepAbove: true }); }
  get(x, y, z) { return this.w.get(x, y, z); }
}
