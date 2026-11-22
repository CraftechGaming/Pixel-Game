'use strict';
// ---------------------------------------------------------------------------
// Saving: the world is regenerated from its seed, then the saved blocks are
// laid on top. Block arrays are run-length encoded to fit in localStorage.
// ---------------------------------------------------------------------------

const Save = {
  KEY: 'pixelrealms.save.v1',

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
    const s = atob(b64);
    const arr = new Uint8Array(len);
    let o = 0;
    for (let k = 0; k + 1 < s.length && o < len; k += 2) {
      const n = s.charCodeAt(k), v = s.charCodeAt(k + 1);
      arr.fill(v, o, Math.min(len, o + n));
      o += n;
    }
    return arr;
  },

  write(game) {
    const w = game.world;
    // finish pending growth animations and restore crumbled platforms
    for (const job of w.jobs) { job.acc = 1e9; }
    w.jobStep(0);
    w.restorePending();
    const growing = [];
    for (const [i, t] of w.growing) growing.push(i, Math.round(t * 10) / 10);
    const data = {
      v: 1, seed: w.seedStr, savedAt: Date.now(),
      fg: this.encode(w.fg), bg: this.encode(w.bg), meta: this.encode(w.meta),
      growing,
      player: { x: game.player.x, y: game.player.y, fly: game.player.fly },
      spawnPoint: game.spawnPoint, time: game.time, day: game.day,
      hotbar: game.hotbar.map(id => BLOCKS[id].key), sel: game.sel,
      discovered: [...game.discovered],
    };
    return Store.set(this.KEY, data);
  },
  read() { return Store.get(this.KEY, null); },
  info() {
    const d = this.read();
    return d && d.seed !== undefined ? { seed: d.seed, savedAt: d.savedAt, day: d.day } : null;
  },
  apply(world, data) {
    const n = world.W * world.H;
    world.fg = this.decode(data.fg, n);
    world.bg = this.decode(data.bg, n);
    world.meta = this.decode(data.meta, n);
    world.rebuildRegistries();
    world.growing.clear();
    for (let k = 0; k + 1 < data.growing.length; k += 2) {
      const i = data.growing[k];
      if (BLOCKS[world.fg[i]] && BLOCKS[world.fg[i]].plant) world.growing.set(i, data.growing[k + 1]);
    }
    world.dirty = true;
  },
};
