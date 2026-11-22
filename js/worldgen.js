'use strict';
// ---------------------------------------------------------------------------
// World generation. The same seed always produces the same world.
// ---------------------------------------------------------------------------

const BIOMES = [
  { key: 'plains', name: 'Plains' },
  { key: 'forest', name: 'Forest' },
  { key: 'desert', name: 'Desert' },
  { key: 'snow', name: 'Snowy Tundra' },
  { key: 'mountains', name: 'Mountains' },
  { key: 'cherry', name: 'Cherry Grove' },
  { key: 'ocean', name: 'Ocean' },
  { key: 'beach', name: 'Beach' },
];
const BI = {}; BIOMES.forEach((b, i) => { BI[b.key] = i; });

function villageName(rng) {
  return rng.pick(['Oak', 'Willow', 'Amber', 'Maple', 'Stone', 'River', 'Sun', 'Moss', 'Clover', 'Fern', 'Honey', 'Briar', 'Frost', 'Dune'])
    + rng.pick(['haven', 'brook', 'field', 'dale', 'ford', 'wick', 'stead', 'vale', 'hollow', 'meadow']);
}
function cityName(rng) {
  return rng.pick(['Neon', 'Silver', 'Iron', 'Crystal', 'Skyline', 'Harbor', 'Metro', 'Aurora', 'Echo', 'Nova'])
    + rng.pick([' City', ' Heights', ' Bay', ' Point', ' Central']);
}

function generateWorld(seedStr) {
  const world = new World(seedStr);
  const W = world.W, H = world.H, s = world.seed;
  const rng = new RNG(s);
  const S = new GenSink(world);
  const spawnX = Math.floor(W / 2);
  const j = () => rng.int(-12, 12);

  // 1. zone layout (relative to spawn). Courses are shuffled per seed.
  const vStyleA = rng.pick(['plains', 'forest', 'cherry', 'plains']);
  const vStyleB = rng.pick(['desert', 'snow', 'cherry', 'forest']);
  const zones = [];
  zones.push({ type: 'spawn', x0: spawnX - 26, x1: spawnX + 26, flat: true });
  zones.push({ type: 'village', style: vStyleA, name: villageName(rng), x0: spawnX + 42 + j(), w: 170 });
  zones.push({ type: 'city', name: cityName(rng), x0: spawnX + 300 + j(), w: 340 });
  zones.push({ type: 'village', style: vStyleB, name: villageName(rng), x0: spawnX - 560 + j(), w: 165 });
  zones.push({ type: 'course', course: 'classic', x0: spawnX - 168, w: 130 });
  const types = rng.shuffle(['ice', 'lava', 'bounce', 'crumble', 'tower', 'speed', 'cloud']);
  const slots = [-345, -745, -925, -1110, 700, 890, 1080];
  slots.forEach((sx, k) => zones.push({ type: 'course', course: types[k], x0: spawnX + sx + j(), w: 140 }));
  for (const z of zones) if (z.w) z.x1 = z.x0 + z.w;

  const courseBiome = { ice: 'snow', lava: 'desert', bounce: 'forest', crumble: 'desert', tower: 'plains', speed: 'plains', cloud: 'plains', classic: 'plains' };

  // 2. biomes and raw heights
  const hts = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let h = 92 - (fbm1(x / 140, s + 1) - 0.5) * 18 - (fbm1(x / 35, s + 4) - 0.5) * 6;
    const mf = smoothstep(0.6, 0.78, fbm1(x / 420, s + 2));
    h -= mf * (0.35 + fbm1(x / 48, s + 3)) * 40;
    const t = fbm1(x / 520, s + 5), m = fbm1(x / 380, s + 6);
    let b;
    if (mf > 0.5) b = BI.mountains;
    else if (t > 0.6) b = BI.desert;
    else if (t < 0.37) b = BI.snow;
    else if (m > 0.6) b = (m > 0.66 && t > 0.48) ? BI.cherry : BI.forest;
    else b = BI.plains;
    if (b === BI.desert) h = lerp(h, 93, 0.5);
    const edge = Math.min(x, W - 1 - x);
    const oc = smoothstep(170, 70, edge);
    h = lerp(h, 120, oc);
    if (oc > 0.05) b = h > SEA_LEVEL - 1 ? BI.ocean : BI.beach;
    hts[x] = h; world.biome[x] = b;
  }
  // zone biomes + flattening
  for (const z of zones) {
    let sum = 0;
    for (let x = z.x0; x <= z.x1; x++) sum += hts[x];
    const lo = z.type === 'city' ? 88 : 84, hi = z.type === 'city' ? 95 : 96;
    z.gy = Math.round(clamp(sum / (z.x1 - z.x0 + 1), lo, hi));
    let bk = null;
    if (z.type === 'village') bk = z.style === 'cherry' ? 'cherry' : z.style;
    else if (z.type === 'city') bk = 'plains';
    else if (z.type === 'course') bk = courseBiome[z.course];
    const M = 34;
    for (let x = z.x0 - M; x <= z.x1 + M; x++) {
      if (x < 0 || x >= W) continue;
      const d = x < z.x0 ? z.x0 - x : x > z.x1 ? x - z.x1 : 0;
      const w = smoothstep(M, 0, d);
      hts[x] = lerp(hts[x], z.gy, w);
      if (bk && d < 14) world.biome[x] = BI[bk];
    }
  }
  const hInt = new Int16Array(W);
  for (let x = 0; x < W; x++) hInt[x] = Math.round(hts[x]);
  for (const z of zones) for (let x = z.x0; x <= z.x1; x++) hInt[x] = z.gy;
  world.terrainY.set(hInt);
  const nearZone = (x, pad) => zones.some(z => x >= z.x0 - pad && x <= z.x1 + pad);

  // 3. terrain columns
  for (let x = 0; x < W; x++) {
    const h = hInt[x], b = world.biome[x];
    const dirtDepth = 3 + Math.floor(hash1(x, s + 7) * 3);
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (y < h) {
        if (y >= SEA_LEVEL) { world.fg[i] = B.water; world.meta[i] = WATER_MAX; }
        continue;
      }
      const depth = y - h;
      let id;
      if (y >= H - 1 - Math.floor(hash2(x, y, s + 8) * 3)) id = B.bedrock;
      else if (b === BI.desert || b === BI.beach || b === BI.ocean) {
        if (depth < 4) id = b === BI.ocean ? (hash2(x, 3, s) < 0.2 ? B.gravel : hash2(x, 5, s) < 0.15 ? B.clay : B.sand) : B.sand;
        else if (depth < 8) id = B.sandstone;
        else id = B.stone;
      } else if (b === BI.mountains) {
        if (depth === 0) id = h < 64 ? B.snow : h < 80 ? B.stone : B.grass;
        else if (depth < 3 && h >= 80) id = B.dirt;
        else id = B.stone;
      } else {
        if (depth === 0) id = b === BI.snow ? B.snowgrass : B.grass;
        else if (depth < dirtDepth) id = B.dirt;
        else id = B.stone;
      }
      if (id === B.stone && y > 150) id = B.darkstone;
      world.fg[i] = id;
      if (depth > 0) world.bg[i] = depth < 4 ? B.dirt : y > 150 ? B.darkstone : B.stone;
    }
  }

  // 4. caves, ores, deep lava
  for (let x = 0; x < W; x++) {
    const h = hInt[x];
    const protect = nearZone(x, 12) ? 26 : 9;
    const oceanCol = world.biome[x] === BI.ocean;
    for (let y = h + protect; y < H - 3; y++) {
      const i = y * W + x;
      const id = world.fg[i];
      if (id === B.bedrock) continue;
      const worm = Math.abs(fbm2(x / 38, y / 22, s + 11) - 0.5);
      const blob = fbm2(x / 24, y / 15, s + 10);
      if (!oceanCol && (worm < 0.03 || blob > 0.71)) {
        world.fg[i] = y > 174 ? B.lava : B.air;
        continue;
      }
      if (id === B.stone || id === B.darkstone) {
        const o = fbm2(x / 3.2, y / 3.2, s + 20);
        const r = hash2(x, y, s + 21);
        if (o > 0.74) {
          if (y > 160 && r < 0.18) world.fg[i] = B.gem_ore;
          else if (y > 135 && r < 0.3) world.fg[i] = B.gold_ore;
          else if (y > 110 && r < 0.55) world.fg[i] = B.iron_ore;
          else world.fg[i] = B.coal_ore;
        }
      }
    }
  }
  // crystals on cave floors
  for (let x = 0; x < W; x++) for (let y = 120; y < 172; y++) {
    const i = y * W + x;
    if (world.fg[i] === B.air && BLOCKS[world.fg[i + W]].solid && world.fg[i + W] !== B.bedrock && hash2(x, y, s + 30) < 0.025) world.fg[i] = B.crystal;
  }

  // 5. lakes
  let lakes = 0;
  const lakeXs = [];
  for (let attempt = 0; attempt < 40 && lakes < 4; attempt++) {
    const cx = rng.int(260, W - 260), hw = rng.int(8, 14);
    if (nearZone(cx, hw + 30) || lakeXs.some(lx => Math.abs(lx - cx) < 80)) continue;
    const b = world.biome[cx];
    if (b === BI.mountains || b === BI.ocean || b === BI.beach) continue;
    let mn = 1e9, mx = -1e9;
    for (let x = cx - hw - 2; x <= cx + hw + 2; x++) { mn = Math.min(mn, hInt[x]); mx = Math.max(mx, hInt[x]); }
    if (mx - mn > 4) continue;
    const depth = rng.int(4, 7);
    const wl = Math.max(hInt[cx - hw - 1], hInt[cx + hw + 1]);
    for (let x = cx - hw; x <= cx + hw; x++) {
      const t = (x - cx) / hw;
      const dd = Math.max(1, Math.round(depth * (1 - t * t)));
      const h = hInt[x];
      for (let y = h - 8; y < h + dd; y++) S.set(x, y, B.air);
      for (let y = h + dd; y < h + dd + 2; y++) S.set(x, y, b === BI.desert ? B.sandstone : B.sand);
      for (let y = wl; y < h + dd; y++) S.set(x, y, B.water, WATER_MAX);
      if (b === BI.snow) S.set(x, wl, B.ice);
    }
    world.zones.push({ type: 'lake', name: b === BI.snow ? 'Frozen Lake' : 'Lake', x0: cx - hw, x1: cx + hw, quiet: true });
    lakeXs.push(cx);
    lakes++;
  }

  // 6. structures
  for (const z of zones) {
    const zr = new RNG(hashString(seedStr + ':' + z.type + ':' + z.x0));
    if (z.type === 'village') {
      buildVillage(S, world, zr, z.x0, z.x1, z.gy, z.style, z.name);
      world.zones.push({ type: 'village', name: z.name, x0: z.x0, x1: z.x1, gy: z.gy, style: z.style });
    } else if (z.type === 'city') {
      const c = buildCity(S, world, zr, z.x0, z.x1, z.gy, z.name);
      world.zones.push({ type: 'city', name: z.name, x0: z.x0, x1: z.x1, gy: z.gy });
      world.courses.push(c);
    } else if (z.type === 'course') {
      const c = buildCourse(S, zr, z.course, z.x0 + 4, z.gy);
      world.courses.push(c);
      z.x1 = Math.max(z.x1, c.x1 + 4); // keep trees off the whole course
    }
  }
  for (const c of world.courses) {
    world.zones.push({ type: 'course', name: c.name, x0: c.x0, x1: c.x1, course: c, desc: c.desc });
  }

  // 7. surface decoration
  let lastTree = -10;
  for (let x = 2; x < W - 2; x++) {
    if (nearZone(x, 6) && !zones.find(z => z.type === 'spawn' && x >= z.x0 && x <= z.x1)) continue;
    if (Math.abs(x - spawnX) < 4) continue;
    const y = world.surfaceY(x);
    const top = world.get(x, y);
    if (!(top === B.grass || top === B.snowgrass || top === B.sand || top === B.stone || top === B.snow)) continue;
    if (world.get(x, y - 1) !== B.air) continue;
    const b = world.biome[x];
    const r = hash1(x, s + 40), r2 = hash1(x, s + 41);
    const treeOk = x - lastTree > 3 && world.get(x, y - 1) === B.air;
    const tr = new RNG(hashString(seedStr + 't' + x));
    let tree = null, plant = 0;
    switch (b) {
      case BI.plains: if (r < 0.035) tree = 'oak'; else if (r2 < 0.3) plant = B.tallgrass; else if (r2 < 0.38) plant = tr.pick([B.rose, B.tulip, B.daisy, B.bluebell]); break;
      case BI.forest: if (r < 0.16) tree = tr.chance(0.6) ? 'oak' : 'birch'; else if (r2 < 0.25) plant = B.tallgrass; else if (r2 < 0.28) plant = B.mushroom; else if (r2 < 0.31) plant = B.berrybush; break;
      case BI.cherry: if (r < 0.1) tree = 'cherry'; else if (r2 < 0.2) plant = B.tallgrass; else if (r2 < 0.3) plant = tr.pick([B.tulip, B.rose, B.daisy]); break;
      case BI.snow: if (r < 0.07) tree = 'pine'; break;
      case BI.mountains: if (top === B.grass && r < 0.06) tree = 'pine'; else if (top === B.grass && r2 < 0.2) plant = B.tallgrass; break;
      case BI.desert: if (top === B.sand && r < 0.025) plant = B.cactus; else if (top === B.sand && r2 < 0.05) plant = B.deadbush; break;
      case BI.beach: if (top === B.sand && r < 0.05 && y < SEA_LEVEL) tree = 'palm'; break;
      default: break;
    }
    if (tree && treeOk && (top === B.grass || top === B.snowgrass || top === B.sand)) { buildTree(S, x, y - 1, tree, tr); lastTree = x; }
    else if (plant) {
      const d = BLOCKS[plant];
      if (plant === B.cactus) { const hh = 1 + Math.floor(r2 * 3); for (let k = 1; k <= hh; k++) S.set(x, y - k, B.cactus); }
      else if (isSoil(top, d.plant.soil)) S.set(x, y - 1, plant, d.plant.stages - 1);
    }
    if (b === BI.snow && top === B.snowgrass && world.get(x, y - 1) === B.air && r2 > 0.92) S.set(x, y - 1, B.snow);
  }

  // 8. wildlife
  for (let x = 220; x < W - 220; x += 70 + Math.floor(hash1(x, s + 50) * 60)) {
    const b = world.biome[x];
    if (nearZone(x, 10)) continue;
    let kind = null;
    if (b === BI.plains || b === BI.cherry) kind = ['sheep', 'pig', 'chicken'][Math.floor(hash1(x, s + 51) * 3)];
    else if (b === BI.forest) kind = ['pig', 'chicken'][Math.floor(hash1(x, s + 51) * 2)];
    else if (b === BI.snow) kind = 'sheep';
    if (kind) for (let k = 0; k < 2; k++) world.npcSpawns.push({ kind: 'animal', animal: kind, x: x + k * 3, y: world.surfaceY(x) - 1, x0: x - 18, x1: x + 18 });
  }

  // 9. spawn point
  world.spawn = { x: spawnX + 0.5, y: world.surfaceY(spawnX) };
  world.zones.sort((a, b) => a.x0 - b.x0);
  world.rebuildRegistries();
  world.dirty = true;
  return world;
}

function biomeAt(world, x) {
  return BIOMES[world.biome[clamp(Math.floor(x), 0, world.W - 1)]];
}
