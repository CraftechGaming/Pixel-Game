'use strict';
// ---------------------------------------------------------------------------
// Terrain generation for Survival and Creative worlds. Every chunk is built
// from the seed alone, so the infinite world always comes out the same.
// Villages and cities are pre-planned per 320x320 region ("stamps").
// ---------------------------------------------------------------------------

const REGION = 320;
const BIOMES = {
  plains: 'Plains', forest: 'Forest', desert: 'Desert', snow: 'Snowy Tundra',
  mountains: 'Mountains', cherry: 'Cherry Grove', ocean: 'Ocean', beach: 'Beach',
};

class ChunkSink {
  constructor(chunk, soft) { this.c = chunk; this.x0 = chunk.cx * CS; this.z0 = chunk.cz * CS; this.soft = soft; }
  set(x, y, z, id, meta = 0) {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || y < 0 || y >= CH) return;
    const i = cidx(lx, y, lz);
    if (this.soft) { const cur = this.c.blocks[i]; if (cur && !LEAVESET[cur] && !BLOCKS[cur].plant) return; }
    this.c.blocks[i] = id; this.c.meta[i] = meta;
  }
  get(x, y, z) {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || y < 0 || y >= CH) return 0;
    return this.c.blocks[cidx(lx, y, lz)];
  }
}
// Collects structure blocks grouped by chunk.
class StampSink {
  constructor() { this.byChunk = new Map(); this.count = 0; }
  set(x, y, z, id, meta = 0) {
    if (y < 0 || y >= CH) return;
    const k = CK(x >> 4, z >> 4);
    let a = this.byChunk.get(k);
    if (!a) { a = []; this.byChunk.set(k, a); }
    a.push(x, y, z, id, meta);
    this.count++;
  }
  get() { return 0; }
}

class Terrain {
  constructor(seed) {
    this.s = seed;
    this.regions = new Map();
    this.stamps = new Map();
  }

  // --- height & biomes ---------------------------------------------------------
  raw(x, z) {
    const s = this.s;
    const cont = fbm2(x / 700, z / 700, s + 1, 3);
    const hills = fbm2(x / 90, z / 90, s + 2, 4);
    const mnt = smoothstep(0.58, 0.78, fbm2(x / 380 + 50, z / 380, s + 3, 3));
    let h = SEA + 4 + (hills - 0.5) * 16 + mnt * (0.4 + fbm2(x / 45, z / 45, s + 4, 3)) * 40;
    h = lerp(h, SEA - 12, smoothstep(0.41, 0.31, cont));
    return h;
  }
  height(x, z) {
    let h = this.raw(x, z);
    const r = this.regionAt(x, z);
    if (r.type) {
      const dx = Math.abs(x - r.cx), dz = Math.abs(z - r.cz);
      const d = r.type === 'city' ? Math.max(dx, dz) : Math.hypot(dx, dz);
      h = lerp(h, r.gy, smoothstep(r.r * 1.5, r.r, d));
    }
    return Math.round(clamp(h, 4, CH - 12));
  }
  biome(x, z, h) {
    const s = this.s;
    if (h === undefined) h = this.height(x, z);
    if (h < SEA - 1) return 'ocean';
    const mnt = smoothstep(0.58, 0.78, fbm2(x / 380 + 50, z / 380, s + 3, 3));
    const r = this.regionAt(x, z);
    if (r.type && Math.hypot(x - r.cx, z - r.cz) < r.r * 1.3) return r.biome;
    if (h <= SEA + 1) return 'beach';
    if (mnt > 0.45) return 'mountains';
    const t = fbm2(x / 520, z / 520, s + 5, 2), m = fbm2(x / 420 + 70, z / 420, s + 6, 2);
    if (t > 0.6) return 'desert';
    if (t < 0.38) return 'snow';
    if (m > 0.58) return m > 0.64 && t > 0.5 ? 'cherry' : 'forest';
    return 'plains';
  }

  // --- regions (villages and cities) -----------------------------------------------
  regionInfo(rx, rz) {
    const k = rx + ',' + rz;
    let r = this.regions.get(k);
    if (r) return r;
    const s = this.s, h = hash2(rx, rz, s + 900);
    let type = null;
    if (rx === 0 && rz === 0) type = 'village';
    else if (rx === 1 && rz === 0) type = 'city';
    else if (h < 0.3) type = 'village';
    else if (h < 0.4) type = 'city';
    r = { type, rx, rz };
    if (type) {
      const rad = type === 'city' ? 58 : 40;
      if (rx === 0 && rz === 0) { r.cx = 70; r.cz = 70; }
      else if (rx === 1 && rz === 0) { r.cx = REGION + 160; r.cz = 160; }
      else {
        r.cx = rx * REGION + rad + 30 + Math.floor(hash2(rx, rz, s + 901) * (REGION - 2 * rad - 60));
        r.cz = rz * REGION + rad + 30 + Math.floor(hash2(rx, rz, s + 902) * (REGION - 2 * rad - 60));
      }
      r.r = rad;
      r.gy = Math.round(clamp(this.raw(r.cx, r.cz), SEA + 3, SEA + 12));
      const styles = ['plains', 'forest', 'cherry', 'snow', 'desert'];
      r.style = type === 'city' ? 'city' : (rx === 0 && rz === 0 ? 'plains' : styles[Math.floor(hash2(rx, rz, s + 903) * styles.length)]);
      r.biome = type === 'city' ? 'plains' : r.style;
      r.name = type === 'city' ? cityName3D(new RNG(hashString(`${s}c${k}`))) : villageName3D(new RNG(hashString(`${s}v${k}`)));
    }
    this.regions.set(k, r);
    return r;
  }
  regionAt(x, z) { return this.regionInfo(Math.floor(x / REGION), Math.floor(z / REGION)); }
  stamp(r) {
    const k = r.rx + ',' + r.rz;
    let st = this.stamps.get(k);
    if (st) return st;
    const S = new StampSink();
    const rng = new RNG(hashString(`${this.s}:stamp:${k}`));
    r.npcs = [];
    if (r.type === 'village') buildVillage3D(S, this, r, rng);
    else buildCity3D(S, this, r, rng);
    st = S.byChunk;
    this.stamps.set(k, st);
    return st;
  }

  // --- trees -----------------------------------------------------------------------
  treeAt(x, z) {
    const r = this.regionAt(x, z);
    if (r.type && Math.hypot(x - r.cx, z - r.cz) < r.r * 1.25) return null;
    const h = this.height(x, z);
    if (h <= SEA) return null;
    const b = this.biome(x, z, h);
    const p = { plains: 0.004, forest: 0.035, cherry: 0.02, snow: 0.012, mountains: 0.006, desert: 0.004, beach: 0, ocean: 0 }[b];
    if (hash2(x, z, this.s + 300) >= p) return null;
    const kind = b === 'forest' ? (hash2(x, z, this.s + 301) < 0.6 ? 'oak' : (hash2(x, z, this.s + 304) < 0.08 ? 'mushroom' : 'birch'))
      : b === 'cherry' ? 'cherry' : b === 'snow' || b === 'mountains' ? 'pine' : b === 'desert' ? 'cactus' : 'oak';
    return { kind, h };
  }

  // --- filling a chunk ------------------------------------------------------------------
  fill(c) {
    const s = this.s, x0 = c.cx * CS, z0 = c.cz * CS;
    const blocks = c.blocks, meta = c.meta;
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const h = this.height(x, z);
      const b = this.biome(x, z, h);
      const dirtD = 3 + Math.floor(hash2(x, z, s + 7) * 2);
      const ocean = h < SEA;
      for (let y = 0; y < CH; y++) {
        const i = cidx(lx, y, lz);
        if (y >= h) {
          if (y < SEA) { blocks[i] = (b === 'snow' && y === SEA - 1) ? B.ice : B.water; }
          continue;
        }
        const depth = h - 1 - y;
        let id;
        if (y === 0 || (y < 3 && hash3(x, y, z, s + 8) < 0.5)) id = B.bedrock;
        else if (depth === 0) {
          if (ocean) id = hash2(x, z, s + 9) < 0.2 ? B.gravel : (hash2(x, z, s + 10) < 0.1 ? B.clay : B.sand);
          else if (b === 'desert' || b === 'beach') id = B.sand;
          else if (b === 'snow') id = B.snowgrass;
          else if (b === 'mountains') id = h > SEA + 30 ? B.snow : (h > SEA + 20 ? B.stone : B.grass);
          else id = B.grass;
        } else if (depth < dirtD) {
          id = (b === 'desert' || b === 'beach' || ocean) ? (depth < 3 ? B.sand : B.sandstone) : (b === 'mountains' && h > SEA + 20 ? B.stone : B.dirt);
        } else id = y < 14 ? B.darkstone : B.stone;
        // caves
        if (y > 1 && depth > 3 && !(ocean && depth < 8)) {
          const n1 = noise3(x / 22, y / 13, z / 22, s + 10), n2 = noise3(x / 22, y / 13, z / 22, s + 11);
          const worm = Math.abs(n1 - 0.5) < 0.05 && Math.abs(n2 - 0.5) < 0.05;
          const room = y < 30 && noise3(x / 34, y / 18, z / 34, s + 12) > 0.75;
          if (worm || room) { blocks[i] = y < 9 ? B.lava : 0; continue; }
        }
        if (id === B.stone || id === B.darkstone) {
          const o = noise3(x / 3.3, y / 3.3, z / 3.3, s + 20);
          if (o > 0.77) {
            const r = hash3(x, y, z, s + 21);
            if (y < 16 && r < 0.25) id = B.gem_ore;
            else if (y < 22 && r < 0.4) id = B.gold_ore;
            else if (y < 44 && r < 0.65) id = B.iron_ore;
            else id = B.coal_ore;
          }
        }
        blocks[i] = id;
      }
      // surface plants
      const top = blocks[cidx(lx, h - 1, lz)];
      if (h < CH - 2 && h >= SEA && (top === B.grass || top === B.sand || top === B.snowgrass)) {
        const r = hash2(x, z, s + 40), r2 = hash2(x, z, s + 41);
        let p = 0, m = 0;
        if (top === B.grass) {
          if (b === 'plains' && r < 0.16) p = B.tallgrass;
          else if ((b === 'forest' || b === 'cherry') && r < 0.1) p = B.tallgrass;
          else if (r < 0.2 && r2 < 0.2) p = [B.rose, B.tulip, B.daisy, B.bluebell, B.sunflower][Math.floor(r2 * 25) % 5];
          else if (b === 'forest' && r > 0.995) p = B.mushroom;
        } else if (top === B.sand && b === 'desert' && r < 0.015) p = B.deadbush;
        if (p) { blocks[cidx(lx, h, lz)] = p; meta[cidx(lx, h, lz)] = m; }
      }
    }
    // trees (including those rooted in neighbouring chunks)
    const S = new ChunkSink(c, true);
    for (let z = z0 - 3; z < z0 + CS + 3; z++) for (let x = x0 - 3; x < x0 + CS + 3; x++) {
      const t = this.treeAt(x, z);
      if (!t) continue;
      const rng = new RNG(hashString(`${s}t${x},${z}`));
      if (t.kind === 'cactus') { const hh = rng.int(1, 3); for (let k = 0; k < hh; k++) S.set(x, t.h + k, z, B.cactus); continue; }
      buildTree3D(S, x, t.h, z, t.kind, rng);
    }
    // villages and cities
    const r = this.regionInfo(Math.floor(x0 / REGION), Math.floor(z0 / REGION));
    if (r.type) {
      const ops = this.stamp(r).get(CK(c.cx, c.cz));
      if (ops) for (let k = 0; k < ops.length; k += 5) {
        const lx = ops[k] - x0, lz = ops[k + 2] - z0, i = cidx(lx, ops[k + 1], lz);
        blocks[i] = ops[k + 3]; meta[i] = ops[k + 4];
      }
    }
  }
}

function villageName3D(rng) {
  return rng.pick(['Oak', 'Willow', 'Amber', 'Maple', 'Stone', 'River', 'Sun', 'Moss', 'Clover', 'Fern', 'Honey', 'Briar', 'Frost', 'Dune'])
    + rng.pick(['haven', 'brook', 'field', 'dale', 'ford', 'wick', 'stead', 'vale', 'hollow', 'meadow']);
}
function cityName3D(rng) {
  return rng.pick(['Neon', 'Silver', 'Iron', 'Crystal', 'Skyline', 'Harbor', 'Metro', 'Aurora', 'Echo', 'Nova'])
    + rng.pick([' City', ' Heights', ' Bay', ' Point', ' Central']);
}

// --- trees & grown things -------------------------------------------------------------------
// (x, y, z): lowest trunk cell, standing on the ground block at y - 1.
function buildTree3D(S, x, y, z, kind, rng) {
  const trunk = (h, id) => { for (let k = 0; k < h; k++) S.set(x, y + k, z, id); };
  const blob = (cy, r, id, ry = 1) => {
    for (let dy = -ry; dy <= ry; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const dd = dx * dx + dz * dz + dy * dy * 1.5;
      if (dd > r * r + 0.8) continue;
      if (dd > r * r - 1 && rng.chance(0.3)) continue;
      S.set(x + dx, cy + dy, z + dz, id);
    }
  };
  switch (kind) {
    case 'birch': { const h = rng.int(5, 7); blob(y + h - 1, 2, B.leaves_birch, 2); S.set(x, y + h + 1, z, B.leaves_birch); trunk(h, B.log_birch); break; }
    case 'pine': {
      const h = rng.int(6, 9);
      for (let k = 2; k <= h; k++) {
        const r = Math.max(0, Math.min(2, Math.floor((h - k + 1) / 2)) - (k % 2 ? 0 : 0));
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dz) <= r + (r > 1 ? 0 : 1)) S.set(x + dx, y + k, z + dz, B.leaves_pine);
      }
      S.set(x, y + h + 1, z, B.leaves_pine);
      trunk(h, B.log_pine); break;
    }
    case 'cherry': { const h = rng.int(4, 5); blob(y + h, 3, B.leaves_cherry, 1); trunk(h, B.log_cherry); break; }
    case 'rainbow': { const h = rng.int(5, 7); blob(y + h, 3, B.leaves_rainbow, 2); trunk(h, B.log_birch); break; }
    case 'mushroom': {
      const h = rng.int(4, 6);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        S.set(x + dx, y + h, z + dz, B.mushroom_cap);
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2) S.set(x + dx, y + h + 1, z + dz, B.mushroom_cap);
      }
      trunk(h, B.mushroom_stem); break;
    }
    default: { const h = rng.int(4, 6); blob(y + h - 1, 2, B.leaves_oak, 1); blob(y + h + 1, 1, B.leaves_oak, 0); trunk(h, B.log_oak); }
  }
}

function growStructure(S, x, y, z, kind, rng) {
  if (['oak', 'birch', 'pine', 'cherry', 'mushroom'].includes(kind)) { buildTree3D(S, x, y, z, kind, rng); return null; }
  if (kind === 'house') { buildHouse3D(S, x - 3, z - 3, 7, 7, y, rng.pick(['plains', 'forest', 'cherry', 'snow']), 's', rng); return 'Cozy Cottage'; }
  const pick = rng.pick(['rainbow', 'crystal', 'mushroom', 'fountain', 'statue']);
  if (pick === 'rainbow') { buildTree3D(S, x, y, z, 'rainbow', rng); return 'Rainbow Tree'; }
  if (pick === 'mushroom') { buildTree3D(S, x, y, z, 'mushroom', rng); return 'Giant Mushroom'; }
  if (pick === 'crystal') {
    const h = rng.int(6, 9);
    for (let k = 0; k < h; k++) S.set(x, y + k, z, B.gem_block);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { S.set(x + dx, y, z + dz, B.gem_block); S.set(x + dx, y + 1, z + dz, B.crystal); }
    S.set(x, y + h, z, B.glowblock);
    return 'Crystal Spire';
  }
  if (pick === 'statue') {
    for (let k = 0; k < 2; k++) for (const dx of [-1, 1]) S.set(x + dx, y + k, z, B.gold_block);
    for (let k = 2; k < 5; k++) for (let dx = -1; dx <= 1; dx++) S.set(x + dx, y + k, z, B.gold_block);
    for (let k = 5; k < 7; k++) S.set(x, y + k, z, B.gold_block);
    S.set(x - 2, y + 4, z, B.gold_block); S.set(x + 2, y + 4, z, B.gold_block);
    return 'Golden Statue';
  }
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
    S.set(x + dx, y - 1, z + dz, edge ? B.stonebricks : B.water, 0);
    if (edge) S.set(x + dx, y, z + dz, B.stonebricks);
  }
  for (let k = 0; k < 3; k++) S.set(x, y + k, z, B.stonebricks);
  S.set(x, y + 3, z, B.water, 0);
  return 'Garden Fountain';
}

// --- houses ---------------------------------------------------------------------------------
const HOUSE3D = {
  plains: { wall: 'planks_oak', corner: 'log_oak', roof: 'roof_red', floor: 'cobble' },
  forest: { wall: 'planks_birch', corner: 'log_birch', roof: 'roof_green', floor: 'cobble' },
  cherry: { wall: 'plaster', corner: 'log_cherry', roof: 'roof_dark', floor: 'stonebricks' },
  snow: { wall: 'planks_pine', corner: 'log_pine', roof: 'roof_blue', floor: 'stonebricks' },
  desert: { wall: 'sandstone', corner: 'sandbricks', roof: 'sandbricks', floor: 'sandbricks', flat: true },
};
// x0,z0 = min corner, w (x) by d (z), ground level gy (floor at gy-1), door on side 'n','s','e','w'
function buildHouse3D(S, x0, z0, w, d, gy, style, side, rng) {
  const st = HOUSE3D[style] || HOUSE3D.plains;
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  for (let y = gy; y < gy + 10; y++) for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) S.set(x, y, z, 0);
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    S.set(x, gy - 1, z, B[st.floor]);
    for (let y = gy - 4; y < gy - 1; y++) S.set(x, y, z, B.cobble);
  }
  const doorX = Math.floor((x0 + x1) / 2), doorZ = Math.floor((z0 + z1) / 2);
  for (let y = gy; y < gy + 4; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const onX = x === x0 || x === x1, onZ = z === z0 || z === z1;
    if (!onX && !onZ) continue;
    let id = onX && onZ ? B[st.corner] : B[st.wall];
    const along = onZ ? x - x0 : z - z0;
    if (!(onX && onZ) && (y === gy + 1 || y === gy + 2) && along % 2 === 0 && along > 0) id = B.glass;
    S.set(x, y, z, id);
  }
  // door
  let dx = doorX, dz = z1, face = 1;
  if (side === 'n') { dz = z0; face = 0; } else if (side === 'e') { dx = x1; dz = doorZ; face = 3; } else if (side === 'w') { dx = x0; dz = doorZ; face = 2; }
  S.set(dx, gy, dz, B.door, face); S.set(dx, gy + 1, dz, B.door_top, face);
  // roof
  if (st.flat) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) S.set(x, gy + 4, z, B[st.roof]);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || z === z0 || z === z1) S.set(x, gy + 5, z, B[st.roof]);
  } else {
    for (let k = 0; ; k++) {
      const za = z0 - 1 + k, zb = z1 + 1 - k, y = gy + 4 + k;
      if (za > zb) break;
      for (let x = x0 - 1; x <= x1 + 1; x++) { S.set(x, y, za, B[st.roof]); S.set(x, y, zb, B[st.roof]); }
      for (let z = za + 1; z < zb; z++) { S.set(x0, y, z, B[st.wall]); S.set(x1, y, z, B[st.wall]); }
    }
  }
  // furniture
  const ix0 = x0 + 1, iz0 = z0 + 1, ix1 = x1 - 1, iz1 = z1 - 1;
  const inner = [[ix0, iz0], [ix1, iz0], [ix0, iz1], [ix1, iz1]].filter(([x, z]) => !(Math.abs(x - dx) <= 1 && Math.abs(z - dz) <= 1));
  const items = rng.shuffle([B.bed, B.workbench, B.bookshelf, B.chest]);
  inner.forEach(([x, z], i) => S.set(x, gy, z, items[i % items.length]));
  S.set(Math.floor((ix0 + ix1) / 2), gy, Math.floor((iz0 + iz1) / 2), B.lantern);
}

function buildVillage3D(S, T, r, rng) {
  const { cx, cz, gy } = r;
  const R = 36;
  // paths
  for (let k = -R; k <= R; k++) for (let w = -1; w <= 1; w++) {
    S.set(cx + k, gy - 1, cz + w, r.style === 'desert' ? B.sandstone : B.path);
    S.set(cx + w, gy - 1, cz + k, r.style === 'desert' ? B.sandstone : B.path);
  }
  // well
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
    for (let y = gy - 5; y < gy; y++) S.set(cx + dx, y, cz + dz, edge ? B.cobble : B.water, 0);
    if (edge) S.set(cx + dx, gy, cz + dz, B.cobble);
    if (Math.abs(dx) === 2 && Math.abs(dz) === 2) { S.set(cx + dx, gy + 1, cz + dz, B.fence); S.set(cx + dx, gy + 2, cz + dz, B.fence); }
    S.set(cx + dx, gy + 3, cz + dz, B.planks_oak);
  }
  S.set(cx, gy + 4, cz, B.lantern);
  // plots along the four roads
  const plots = [];
  for (const dist of [16, 28]) for (const s of [-1, 1]) {
    plots.push({ x: cx + dist * s, z: cz - 9, side: 's' }, { x: cx + dist * s, z: cz + 9, side: 'n' });
    plots.push({ x: cx - 9, z: cz + dist * s, side: 'e' }, { x: cx + 9, z: cz + dist * s, side: 'w' });
  }
  rng.shuffle(plots);
  let houses = 0;
  for (const p of plots.slice(0, 13)) {
    if (rng.chance(0.2) && houses > 3) {
      // farm
      for (let dz = -3; dz <= 3; dz++) for (let dx = -4; dx <= 4; dx++) {
        const edge = Math.abs(dx) === 4 || Math.abs(dz) === 3;
        if (edge) { S.set(p.x + dx, gy - 1, p.z + dz, B.log_oak); continue; }
        S.set(p.x + dx, gy - 1, p.z + dz, dz === 0 ? B.water : B.farmland, 0);
        if (dz !== 0) S.set(p.x + dx, gy, p.z + dz, B.wheat, rng.int(1, 3));
      }
      continue;
    }
    const w = rng.pick([7, 7, 9]), d = 7;
    buildHouse3D(S, p.x - Math.floor(w / 2), p.z - 3, w, d, gy, r.style, p.side, rng);
    r.npcs.push({ x: p.x + (p.side === 'e' ? 6 : p.side === 'w' ? -6 : 0) + 0.5, y: gy, z: p.z + (p.side === 's' ? 5 : p.side === 'n' ? -5 : 0) + 0.5 });
    houses++;
  }
  // lamp posts
  for (const k of [-22, -10, 10, 22]) for (const [lx, lz] of [[cx + k, cz + 2], [cx + 2, cz + k]]) {
    for (let y = gy; y < gy + 3; y++) S.set(lx, y, lz, B.fence);
    S.set(lx, gy + 3, lz, B.lantern);
  }
}

function buildCity3D(S, T, r, rng) {
  const { cx, cz, gy } = r;
  const R = 54, CELL = 18;
  const styles = [
    [B.concrete_gray, B.cityglass], [B.bricks, B.window], [B.concrete_white, B.cityglass],
    [B.concrete_dark, B.cityglass], [B.stonebricks, B.window], [B.sandstone, B.cityglass],
  ];
  for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
    const gx = ((x - cx + R) % CELL + CELL) % CELL, gz = ((z - cz + R) % CELL + CELL) % CELL;
    const road = gx < 3 || gz < 3;
    const walk = !road && (gx < 4 || gz < 4 || gx === CELL - 1 || gz === CELL - 1);
    S.set(x, gy - 1, z, road ? (gx === 1 || gz === 1 ? B.road : B.asphalt) : walk ? B.concrete_gray : B.grass);
  }
  for (let lz = cz - R + 4; lz + 13 <= cz + R; lz += CELL) for (let lx = cx - R + 4; lx + 13 <= cx + R; lx += CELL) {
    const x0 = lx + 1, z0 = lz + 1, w = 11;
    const centre = 1 - Math.hypot(lx + 7 - cx, lz + 7 - cz) / (R * 1.2);
    if (rng.chance(0.14)) {
      // little park with a fountain and trees
      for (const [tx, tz] of [[x0 + 2, z0 + 2], [x0 + 8, z0 + 8], [x0 + 2, z0 + 8], [x0 + 8, z0 + 2]]) buildTree3D(S, tx, gy, tz, rng.pick(['oak', 'cherry', 'birch']), rng);
      growStructure(S, x0 + 5, gy, z0 + 5, 'fountain', { pick: () => 'fountain', int: () => 1 });
      continue;
    }
    const floors = clamp(Math.round(3 + centre * 7 + rng.int(0, 3)), 3, 11);
    const top = gy + floors * 4;
    const [wall, glass] = rng.pick(styles);
    for (let y = gy; y <= top; y++) for (let z = z0; z < z0 + w; z++) for (let x = x0; x < x0 + w; x++) {
      const onX = x === x0 || x === x0 + w - 1, onZ = z === z0 || z === z0 + w - 1;
      const fy = (y - gy) % 4;
      if (fy === 0 || y === top) { S.set(x, y, z, (onX || onZ) ? wall : B.concrete_white); continue; }
      if (!onX && !onZ) continue;
      const along = onZ ? x - x0 : z - z0;
      const pillar = (onX && onZ) || along % 3 === 0;
      S.set(x, y, z, pillar || fy === 3 ? wall : (rng.chance(0.28) ? B.litwindow : glass));
    }
    // floors: lanterns, ladder shaft, door
    for (let f = 0; f < floors; f++) S.set(x0 + 5, gy + f * 4 + 1, z0 + 5, B.lantern);
    for (let y = gy; y <= top; y++) S.set(x0 + 1, y, z0 + 1, B.ladder, 2);
    S.set(x0 + 5, gy, z0 + w - 1, B.door, 1); S.set(x0 + 5, gy + 1, z0 + w - 1, B.door_top, 1);
    S.set(x0 + 5, gy + 2, z0 + w - 1, wall);
    // roof details
    for (let z = z0; z < z0 + w; z++) for (let x = x0; x < x0 + w; x++) if (x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + w - 1) S.set(x, top + 1, z, wall);
    S.set(x0 + 1, top + 1, z0 + 1, 0);
    if (rng.chance(0.5)) { for (let y = top + 1; y < top + 5; y++) S.set(x0 + 8, y, z0 + 8, B.fence); S.set(x0 + 8, top + 5, z0 + 8, rng.pick([B.neon_pink, B.neon_cyan, B.glowblock])); }
    r.npcs.push({ x: x0 - 1.5, y: gy, z: z0 + 5.5 });
  }
  // street lamps at crossings
  for (let z = cz - R; z <= cz + R; z += CELL) for (let x = cx - R; x <= cx + R; x += CELL) {
    for (let y = gy; y < gy + 4; y++) S.set(x + 3, y, z + 3, B.fence);
    S.set(x + 3, gy + 4, z + 3, B.streetlamp);
  }
}
