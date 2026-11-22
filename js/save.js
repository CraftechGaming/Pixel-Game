'use strict';
// ---------------------------------------------------------------------------
// Saving. A world is rebuilt from its seed, then every chunk the player has
// changed is laid back on top. Chunks are run-length encoded, and a block
// palette (id -> name) keeps old saves working when new blocks are added.
// ---------------------------------------------------------------------------

const Save = {
  key: mode => 'pr3d.save.' + mode,
  encode(arr) {
    const out = [];
    let i = 0;
    while (i < arr.length) {
      const v = arr[i];
      let n = 1;
      while (n < 255 && i + n < arr.length && arr[i + n] === v) n++;
      out.push(n, v);
      i += n;
    }
    const bytes = new Uint8Array(out);
    let s = '';
    for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
    return btoa(s);
  },
  decode(b64, len) {
    const s = atob(b64), arr = new Uint8Array(len);
    let o = 0;
    for (let k = 0; k + 1 < s.length && o < len; k += 2) {
      const n = s.charCodeAt(k), v = s.charCodeAt(k + 1);
      arr.fill(v, o, Math.min(len, o + n));
      o += n;
    }
    return arr;
  },
  write(game) {
    const w = game.world, p = game.player;
    if (!w || game.mode === 'parkour') return false;
    const chunks = {};
    const put = (k, b, m) => { chunks[k] = [this.encode(b), this.encode(m)]; };
    for (const [k, sv] of w.saved) put(k, sv.b, sv.m);
    for (const [k, c] of w.chunks) if (c.modified) put(k, c.blocks, c.meta);
    const data = {
      v: 2, seed: w.seedStr, mode: game.mode, savedAt: Date.now(), time: game.time, day: game.day,
      palette: BLOCKS.map(d => d.key),
      player: { x: p.x, y: p.y, z: p.z, yaw: game.cam.yaw, pitch: game.cam.pitch, hp: game.hp, fly: !!p.fly },
      spawn: game.spawnPoint, sel: game.sel, view: game.cam.view,
      inv: game.inv.map(s => (s ? [s.id, s.n] : null)),
      chunks,
    };
    return Store.set(this.key(game.mode), data);
  },
  read(mode) { return Store.get(this.key(mode), null); },
  info(mode) { const d = this.read(mode); return d && d.seed !== undefined ? { seed: d.seed, day: d.day || 1 } : null; },
  // map saved ids to the current registry
  remap(data) {
    const map = new Uint8Array(256);
    (data.palette || []).forEach((k, i) => { map[i] = B[k] !== undefined ? B[k] : 0; });
    return map;
  },
  restore(world, data) {
    const map = this.remap(data), n = CS * CS * CH;
    for (const [k, [b, m]] of Object.entries(data.chunks || {})) {
      const blocks = this.decode(b, n);
      for (let i = 0; i < n; i++) blocks[i] = map[blocks[i]];
      world.saved.set(Number(k), { b: blocks, m: this.decode(m, n) });
    }
    return map;
  },
};
