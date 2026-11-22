'use strict';
// ---------------------------------------------------------------------------
// Structures: trees, homes, village buildings, city towers, parkour courses.
// Every builder writes through a sink S (see GenSink / CollectSink).
// Coordinates: gy is the ground row the structure stands on.
// ---------------------------------------------------------------------------

const HOUSE_STYLES = {
  plains: { wall: 'planks_oak', post: 'log_oak', floor: 'cobble', roof: 'roof_red', bgWall: 'planks_oak', win: 'window' },
  forest: { wall: 'planks_birch', post: 'log_birch', floor: 'cobble', roof: 'roof_green', bgWall: 'planks_birch', win: 'window' },
  snow: { wall: 'planks_pine', post: 'log_pine', floor: 'stonebricks', roof: 'roof_blue', bgWall: 'planks_pine', win: 'window', snow: true },
  desert: { wall: 'sandstone', post: 'sandbricks', floor: 'sandbricks', roof: 'sandbricks', bgWall: 'sandstone', win: 'glass', flat: true },
  cherry: { wall: 'plaster', post: 'log_cherry', floor: 'stonebricks', roof: 'roof_dark', bgWall: 'planks_cherry', win: 'window' },
};

const COURSE_INFO = {
  classic: { name: 'Meadow Hops', desc: 'Floating platforms. A friendly warm-up.' },
  ice: { name: 'Frost Run', desc: 'Slippery ice platforms. Land softly!' },
  lava: { name: 'Lava Leap', desc: 'Hop across basalt pillars over lava.' },
  bounce: { name: 'Bounce Castle', desc: 'Bounce pads launch you to high ledges.' },
  crumble: { name: 'Crumble Sky', desc: 'Platforms fall away. Keep moving!' },
  tower: { name: 'Ladder Tower', desc: 'Climb a tall tower of ladders and ledges.' },
  speed: { name: 'Speed Way', desc: 'Speed pads fling you over long gaps.' },
  cloud: { name: 'Cloud Walk', desc: 'Up a tall ladder, then across the clouds.' },
  rooftop: { name: 'Rooftop Rush', desc: 'Run and jump across the city rooftops.' },
};

const fillRect = (S, x0, y0, x1, y1, id) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) S.set(x, y, id); };
const bgRect = (S, x0, y0, x1, y1, id) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) S.bg(x, y, id); };
const placeDoor = (S, x, y) => { S.set(x, y, B.door); S.set(x, y - 1, B.door_top); };

// --- trees ------------------------------------------------------------------------
// (x, y) is the lowest trunk cell, directly above the ground.
function leafBlob(S, cx, cy, rx, ry, id, rng) {
  for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
    const v = (dx * dx) / ((rx + 0.5) * (rx + 0.5)) + (dy * dy) / ((ry + 0.5) * (ry + 0.5));
    if (v > 1) continue;
    if (v > 0.7 && rng.chance(0.35)) continue;
    S.set(cx + dx, cy + dy, id);
  }
}
function buildTree(S, x, y, type, rng) {
  const trunk = (h, id) => { for (let k = 0; k < h; k++) S.set(x, y - k, id); };
  switch (type) {
    case 'birch': {
      const h = rng.int(5, 7);
      leafBlob(S, x, y - h, 2, 2.6, B.leaves_birch, rng); trunk(h, B.log_birch); break;
    }
    case 'pine': {
      const h = rng.int(7, 10), top = y - h - 1;
      for (let r = top; r <= y - 2; r++) {
        let w = Math.min(3, 1 + Math.floor((r - top) / 2));
        if ((r - top) % 3 === 2) w = Math.max(0, w - 1);
        if (r === top) w = 0;
        for (let dx = -w; dx <= w; dx++) S.set(x + dx, r, B.leaves_pine);
      }
      trunk(h, B.log_pine); break;
    }
    case 'cherry': {
      const h = rng.int(4, 5);
      leafBlob(S, x, y - h, 3.4, 1.8, B.leaves_cherry, rng);
      trunk(h, B.log_cherry); S.set(x - 1, y - h + 1, B.log_cherry); S.set(x + 1, y - h + 2, B.log_cherry); break;
    }
    case 'palm': {
      const h = rng.int(5, 8), t = y - h;
      for (const s of [-1, 1]) {
        for (let k = 1; k <= 4; k++) S.set(x + s * k, t + (k > 2 ? k - 2 : 0), B.leaves_palm);
        S.set(x + s, t - 1, B.leaves_palm);
      }
      S.set(x, t - 1, B.leaves_palm); S.set(x, t, B.leaves_palm);
      trunk(h, B.log_palm); break;
    }
    case 'rainbow': {
      const h = rng.int(6, 8);
      leafBlob(S, x, y - h, 3.6, 3, B.leaves_rainbow, rng); trunk(h, B.log_birch); break;
    }
    case 'mushroom': {
      const h = rng.int(4, 6), t = y - h;
      fillRect(S, x - 3, t, x + 3, t, B.mushroom_cap); fillRect(S, x - 3, t - 1, x + 3, t - 1, B.mushroom_cap);
      fillRect(S, x - 2, t - 2, x + 2, t - 2, B.mushroom_cap); fillRect(S, x - 1, t - 3, x + 1, t - 3, B.mushroom_cap);
      trunk(h, B.mushroom_stem); break;
    }
    default: { // oak
      const h = rng.int(4, 6);
      leafBlob(S, x, y - h, rng.chance(0.5) ? 2.5 : 3, 2, B.leaves_oak, rng); trunk(h, B.log_oak);
    }
  }
}

// --- homes ------------------------------------------------------------------------
function buildHouse(S, x0, gy, o, rng) {
  const st = HOUSE_STYLES[o.style] || HOUSE_STYLES.plains;
  const w = o.w || 9, two = !!o.twoStory;
  const wallH = two ? 9 : (o.wallH || 5);
  const x1 = x0 + w - 1, top = gy - wallH;
  const roofRows = st.flat ? 2 : Math.ceil((w + 2) / 2) + 1;
  fillRect(S, x0 - 1, top - roofRows - 3, x1 + 1, gy - 1, B.air);
  for (let x = x0; x <= x1; x++) {
    S.set(x, gy, B[st.floor]);
    for (let y = gy + 1; y <= gy + 3; y++) if (!BLOCKS[S.get(x, y)].solid) S.set(x, y, B.dirt);
  }
  bgRect(S, x0 + 1, top, x1 - 1, gy - 1, B[st.bgWall]);
  for (let y = gy - 1; y >= top; y--) { S.set(x0, y, B[st.post]); S.set(x1, y, B[st.post]); }
  placeDoor(S, x0, gy - 1); placeDoor(S, x1, gy - 1);
  if (wallH >= 4) { S.set(x0, gy - 3, B[st.win]); S.set(x1, gy - 3, B[st.win]); }
  if (w >= 7) { S.bg(x0 + 2, gy - 3, B.window); S.bg(x1 - 2, gy - 3, B.window); }
  fillRect(S, x0, top - 1, x1, top - 1, B[st.wall]);

  let smoke = null;
  if (st.flat) {
    S.set(x0, top - 2, B[st.roof]); S.set(x1, top - 2, B[st.roof]);
  } else {
    for (let k = 0; ; k++) {
      const ry = top - 2 - k, a = x0 - 1 + k, b = x1 + 1 - k;
      if (a > b) break;
      if (b - a <= 3) fillRect(S, a, ry, b, ry, B[st.roof]);
      else {
        S.set(a, ry, B[st.roof]); S.set(a + 1, ry, B[st.roof]); S.set(b - 1, ry, B[st.roof]); S.set(b, ry, B[st.roof]);
        bgRect(S, a + 2, ry, b - 2, ry, B[st.bgWall]);
      }
      if (st.snow) { S.set(a, ry - 1, B.snow); S.set(b, ry - 1, B.snow); }
    }
    if (o.chimney !== false && w >= 7) {
      const cx = x1 - 1, edgeRow = top - 2 - (x1 + 1 - cx);
      for (let y = top - 2; y >= edgeRow - 2; y--) S.set(cx, y, B.bricks);
      smoke = [cx + 0.5, edgeRow - 2];
    }
  }

  // furniture
  const fy = gy - 1;
  if (w >= 7) S.set(x0 + 1, fy, B.bed);
  S.set(x1 - 2, fy, B.table); S.set(x1 - 2, fy - 1, B.flowerpot);
  if (w >= 8) S.set(x1 - 3, fy, B.chair);
  if (w >= 9) S.set(x0 + 3, fy, rng.chance(0.5) ? B.bookshelf : B.chest);
  S.set(x0 + 1, gy - 3, B.torch);
  S.set(Math.floor((x0 + x1) / 2), top, B.lantern);
  if (two) {
    const f2 = gy - 5;
    fillRect(S, x0 + 1, f2, x1 - 1, f2, B.platform);
    for (let y = gy - 1; y >= f2; y--) S.set(x1 - 1, y, B.ladder);
    S.set(x1 - 2, fy, B.table); S.set(x1 - 3, fy, B.chair);
    S.set(x0 + 1, f2 - 1, B.bed); S.set(x0 + 3, f2 - 1, B.bookshelf); S.set(x1 - 3, f2 - 1, B.chest);
    S.set(x0, gy - 7, B[st.win]); S.set(x1, gy - 7, B[st.win]);
    S.bg(x0 + 2, gy - 7, B.window); S.bg(x1 - 2, gy - 7, B.window);
    S.set(x0 + 1, gy - 7, B.torch);
  }
  return { x0, x1, gy, top, smoke };
}

function buildWell(S, x0, gy) {
  fillRect(S, x0, gy - 6, x0 + 4, gy - 1, B.air);
  fillRect(S, x0, gy, x0 + 4, gy + 4, B.stonebricks);
  for (let y = gy; y <= gy + 3; y++) for (let x = x0 + 1; x <= x0 + 3; x++) S.set(x, y, B.water, WATER_MAX);
  S.set(x0, gy - 1, B.stonebricks); S.set(x0 + 4, gy - 1, B.stonebricks);
  for (let y = gy - 3; y <= gy - 2; y++) { S.set(x0, y, B.fence); S.set(x0 + 4, y, B.fence); }
  fillRect(S, x0 - 1, gy - 4, x0 + 5, gy - 4, B.roof_red);
  fillRect(S, x0, gy - 5, x0 + 4, gy - 5, B.roof_red);
  fillRect(S, x0 + 1, gy - 6, x0 + 3, gy - 6, B.roof_red);
}

function buildFarm(S, x0, gy, w, rng, biome) {
  fillRect(S, x0 - 1, gy - 4, x0 + w, gy - 1, B.air);
  const mid = x0 + Math.floor(w / 2);
  const crops = biome === 'desert' ? [B.cactus, B.melon_plant] : [B.wheat, B.carrot, B.corn, B.tomato, B.pumpkin_plant, B.wheat];
  const crop = rng.pick(crops);
  for (let x = x0; x < x0 + w; x++) {
    if (x === mid) { S.set(x, gy, B.water, WATER_MAX); S.set(x, gy + 1, B.dirt); continue; }
    if (crop === B.cactus) { S.set(x, gy, B.sand); if (x % 2 === 0) S.set(x, gy - 1, B.cactus); continue; }
    S.set(x, gy, B.farmland);
    const stages = BLOCKS[crop].plant.stages;
    S.set(x, gy - 1, crop, rng.int(0, stages - 1));
  }
  S.set(x0 - 1, gy - 1, B.fence); S.set(x0 + w, gy - 1, B.fence);
  // scarecrow
  S.set(x0 - 1, gy - 2, B.hay); S.set(x0 - 1, gy - 3, B.pumpkin);
}

function buildStall(S, x0, gy, rng) {
  fillRect(S, x0 - 1, gy - 5, x0 + 5, gy - 1, B.air);
  for (let y = gy - 3; y <= gy - 1; y++) { S.set(x0, y, B.fence); S.set(x0 + 4, y, B.fence); }
  for (let x = x0 - 1; x <= x0 + 5; x++) S.set(x, gy - 4, (x - x0) % 2 ? B.cloth_white : B[rng.pick(['cloth_red', 'cloth_blue', 'cloth_green'])]);
  S.set(x0 + 1, gy - 1, B.chest); S.set(x0 + 2, gy - 1, B.table); S.set(x0 + 3, gy - 1, B.table); S.set(x0 + 2, gy - 2, B.flowerpot);
}

function buildLampPost(S, x, gy, lamp = B.lantern) {
  S.set(x, gy - 1, B.fence); S.set(x, gy - 2, B.fence); S.set(x, gy - 3, lamp);
}

function buildChapel(S, x0, gy, rng) {
  const w = 7, x1 = x0 + w - 1, h = 13, top = gy - h;
  fillRect(S, x0 - 1, top - 7, x1 + 1, gy - 1, B.air);
  fillRect(S, x0, gy, x1, gy, B.stonebricks);
  bgRect(S, x0 + 1, top, x1 - 1, gy - 1, B.stonebricks);
  for (let y = gy - 1; y >= top; y--) { S.set(x0, y, B.stonebricks); S.set(x1, y, B.stonebricks); }
  placeDoor(S, x0, gy - 1); placeDoor(S, x1, gy - 1);
  for (const wy of [gy - 4, gy - 8]) { S.set(x0, wy, B.glass); S.set(x1, wy, B.glass); S.set(x0, wy - 1, B.glass); S.set(x1, wy - 1, B.glass); }
  fillRect(S, x0 + 1, gy - 5, x1 - 1, gy - 5, B.platform);
  fillRect(S, x0 + 1, gy - 10, x1 - 1, gy - 10, B.platform);
  for (let y = gy - 1; y >= gy - 10; y--) S.set(x0 + 1, y, B.ladder);
  fillRect(S, x0, top - 1, x1, top - 1, B.stonebricks);
  S.set(x0 + 3, top, B.gold_block);
  S.set(x0 + 4, gy - 1, B.bookshelf); S.set(x0 + 5, gy - 1, B.chair);
  S.set(x0 + 3, gy - 6, B.lantern); S.set(x0 + 3, gy - 11, B.lantern);
  for (let k = 0; k <= 3; k++) fillRect(S, x0 - 1 + k, top - 2 - k, x1 + 1 - k, top - 2 - k, B.roof_dark);
  S.set(x0 + 3, top - 6, B.fence); S.set(x0 + 3, top - 7, B.gold_block);
}

function buildLookout(S, x0, gy) {
  const w = 5, x1 = x0 + 4, h = 12, top = gy - h;
  fillRect(S, x0 - 1, top - 4, x1 + 1, gy - 1, B.air);
  fillRect(S, x0, gy, x1, gy, B.stonebricks);
  bgRect(S, x0 + 1, top, x1 - 1, gy - 1, B.planks_dark);
  for (let y = gy - 1; y >= top; y--) { S.set(x0, y, B.stonebricks); S.set(x1, y, B.stonebricks); }
  placeDoor(S, x0, gy - 1);
  for (let y = gy - 1; y >= top; y--) S.set(x1 - 1, y, B.ladder);
  for (const wy of [gy - 5, gy - 9]) { S.set(x0, wy, B.window); S.set(x1, wy, B.window); }
  fillRect(S, x0 - 1, top - 1, x1 + 1, top - 1, B.planks_dark);
  S.set(x1 - 1, top - 1, B.ladder);
  S.set(x0 - 1, top - 2, B.fence); S.set(x1 + 1, top - 2, B.fence);
  S.set(x0 + 1, top - 2, B.lantern);
  fillRect(S, x0 - 1, top - 4, x1 + 1, top - 4, B.roof_blue);
  S.set(x0 - 1, top - 3, B.fence); S.set(x1 + 1, top - 3, B.fence);
  S.set(x0 + 1, gy - 3, B.torch);
  return w;
}

// What a Wonder / House / Tower seed turns into. Returns a label for the UI.
function buildGrownStructure(S, x, y, kind, rng) {
  const gy = y + 1;
  if (kind === 'mushroom') { buildTree(S, x, y, 'mushroom', rng); return 'Giant Mushroom'; }
  if (kind === 'house') { buildHouse(S, x - 4, gy, { w: 9, style: rng.pick(['plains', 'cherry', 'forest', 'snow']) }, rng); return 'Cozy Cottage'; }
  if (kind === 'tower') { buildLookout(S, x - 2, gy); return 'Lookout Tower'; }
  const pick = rng.pick(['rainbow', 'crystal', 'sunflower', 'mushroom', 'cottage', 'fountain']);
  switch (pick) {
    case 'rainbow': buildTree(S, x, y, 'rainbow', rng); return 'Rainbow Tree';
    case 'mushroom': buildTree(S, x, y, 'mushroom', rng); return 'Giant Mushroom';
    case 'cottage': buildHouse(S, x - 3, gy, { w: 7, style: 'cherry' }, rng); return 'Tiny Cottage';
    case 'crystal': {
      const h = rng.int(7, 11);
      for (let k = 0; k < h; k++) S.set(x, y - k, B.crystal);
      for (let k = 2; k < h - 1; k += 2) { S.set(x + (k % 4 ? 1 : -1), y - k, B.crystal); }
      S.set(x - 1, y, B.crystal); S.set(x + 1, y, B.crystal);
      return 'Crystal Spire';
    }
    case 'sunflower': {
      const h = rng.int(6, 8);
      for (let k = 0; k < h; k++) S.set(x, y - k, B.leaves_oak);
      S.set(x - 1, y - 2, B.leaves_oak); S.set(x + 1, y - 3, B.leaves_oak);
      const cy = y - h - 2;
      fillRect(S, x - 2, cy - 2, x + 2, cy + 2, B.cloth_yellow);
      fillRect(S, x - 1, cy - 1, x + 1, cy + 1, B.planks_dark);
      S.set(x - 3, cy, B.cloth_yellow); S.set(x + 3, cy, B.cloth_yellow); S.set(x, cy - 3, B.cloth_yellow); S.set(x, cy + 3, B.leaves_oak);
      return 'Giant Sunflower';
    }
    default: { // fountain
      fillRect(S, x - 3, gy - 4, x + 3, gy - 1, B.air);
      fillRect(S, x - 3, gy, x + 3, gy + 2, B.stonebricks);
      for (let xx = x - 2; xx <= x + 2; xx++) S.set(xx, gy, B.water, WATER_MAX);
      for (let xx = x - 2; xx <= x + 2; xx++) S.set(xx, gy + 1, B.water, WATER_MAX);
      S.set(x, gy + 2, B.spring);
      S.set(x - 3, gy - 1, B.stonebricks); S.set(x + 3, gy - 1, B.stonebricks);
      S.set(x - 3, gy - 2, B.lantern); S.set(x + 3, gy - 2, B.lantern);
      return 'Garden Fountain';
    }
  }
}

// --- village ------------------------------------------------------------------------
function buildVillage(S, world, rng, x0, x1, gy, style, name) {
  const pathId = style === 'desert' ? B.sandstone : style === 'snow' ? B.snowgrass : B.path;
  for (let x = x0 - 6; x <= x1 + 6; x++) S.set(x, gy, pathId);
  const plan = rng.shuffle(['house', 'house', 'twostory', 'farm', 'stall', 'house', 'chapel', 'farm', 'twostory', 'house']);
  let x = x0 + 2, wellDone = false;
  const mid = (x0 + x1) / 2;
  const homes = [];
  for (const type of plan) {
    if (!wellDone && x > mid - 8) { buildWell(S, x, gy); buildLampPost(S, x + 7, gy); x += 10; wellDone = true; }
    let w;
    if (type === 'farm') w = rng.int(8, 11);
    else if (type === 'stall') w = 5;
    else if (type === 'chapel') w = 7;
    else if (type === 'twostory') w = 11;
    else w = rng.pick([7, 9, 9, 11]);
    if (x + w > x1) break;
    if (type === 'farm') {
      buildFarm(S, x + 1, gy, w - 2, rng, style);
      world.npcSpawns.push({ kind: 'animal', animal: 'chicken', x: x + w / 2, y: gy - 1, x0: x - 4, x1: x + w + 4 });
    } else if (type === 'stall') {
      buildStall(S, x, gy, rng);
      world.npcSpawns.push({ kind: 'villager', job: 'merchant', x: x + 2.5, y: gy, x0: x - 6, x1: x + 10 });
    } else if (type === 'chapel') {
      buildChapel(S, x, gy, rng);
      world.npcSpawns.push({ kind: 'villager', job: 'priest', x: x + 3.5, y: gy, x0: x - 8, x1: x + 14 });
    } else {
      const h = buildHouse(S, x, gy, { w, style, twoStory: type === 'twostory' }, rng);
      if (h.smoke) world.emitters.push({ type: 'smoke', x: h.smoke[0], y: h.smoke[1] });
      homes.push(h);
      world.npcSpawns.push({ kind: 'villager', job: rng.pick(['farmer', 'baker', 'librarian', 'smith', 'kid']), x: x + w / 2, y: gy, x0: x - 14, x1: x + w + 14 });
    }
    x += w + rng.int(3, 5);
    if (x < x1) buildLampPost(S, x - 2, gy);
  }
  for (let k = 0; k < 4; k++) {
    const ax = rng.pick([x0 - 20 - rng.int(0, 15), x1 + 20 + rng.int(0, 15)]);
    world.npcSpawns.push({ kind: 'animal', animal: rng.pick(['sheep', 'pig', 'chicken', 'sheep']), x: ax, y: gy - 2, x0: ax - 14, x1: ax + 14 });
  }
  return homes;
}

// --- city -------------------------------------------------------------------------------
const CITY_STYLES = () => [
  { wall: B.concrete_gray, trim: B.concrete_white, glass: B.cityglass, lit: 0.3 },
  { wall: B.bricks, trim: B.stonebricks, glass: B.window, lit: 0.35 },
  { wall: B.concrete_white, trim: B.metal, glass: B.cityglass, lit: 0.25 },
  { wall: B.concrete_dark, trim: B.metal, glass: B.cityglass, lit: 0.4 },
  { wall: B.concrete_sand, trim: B.concrete_white, glass: B.cityglass, lit: 0.3 },
  { wall: B.stonebricks, trim: B.concrete_gray, glass: B.window, lit: 0.3 },
];

function buildSkyscraper(S, rng, x0, gy, w, h, style, features) {
  const x1 = x0 + w - 1, roof = gy - h;
  fillRect(S, x0, roof - 8, x1, gy - 1, B.air);
  fillRect(S, x0, gy, x1, gy, B.concrete_dark);
  for (let y = gy - 1; y >= roof; y--) { S.set(x0, y, style.wall); S.set(x1, y, style.wall); }
  for (let fy = gy - 4; fy >= roof; fy -= 4) fillRect(S, x0, fy, x1, fy, fy === roof ? style.trim : style.wall);
  for (let k = 1; gy - 4 * k - 2 > roof; k++) {
    const wy = gy - 4 * k - 2;
    S.set(x0, wy, style.glass); S.set(x1, wy, style.glass); S.set(x0, wy - 1, style.glass); S.set(x1, wy - 1, style.glass);
  }
  placeDoor(S, x0, gy - 1); placeDoor(S, x1, gy - 1);
  const lx = x0 + 2;
  for (let y = gy - 1; y >= roof; y--) S.set(lx, y, B.ladder);
  for (let y = roof; y <= gy - 1; y++) for (let x = x0 + 1; x <= x1 - 1; x++) {
    const r = (gy - y) % 4;
    const isWin = (r === 2 || r === 3) && (x - x0) % 3 !== 0 && y < gy - 3;
    S.bg(x, y, isWin ? (rng.chance(style.lit) ? B.litwindow : B.cityglass) : style.wall);
  }
  for (let k = 0; gy - 4 * k - 1 > roof; k++) {
    const fyRow = gy - 4 * k - 1;
    if (k === 0) { S.set(x0 + 1, fyRow, B.flowerpot); S.set(x1 - 1, fyRow, B.flowerpot); if (w > 9) S.set(x1 - 3, fyRow, B.table); continue; }
    const kind = rng.pick(['office', 'home', 'library', 'plants']);
    for (let x = x0 + 4; x <= x1 - 2; x++) {
      if (rng.chance(0.45)) continue;
      let id;
      if (kind === 'office') id = rng.pick([B.table, B.chair, B.table, B.flowerpot]);
      else if (kind === 'home') id = rng.pick([B.bed, B.table, B.chair, B.chest]);
      else if (kind === 'library') id = rng.pick([B.bookshelf, B.bookshelf, B.chair]);
      else id = rng.pick([B.flowerpot, B.chair]);
      S.set(x, fyRow, id);
    }
    S.set(Math.floor((x0 + x1) / 2) + 1, fyRow - 2, B.lantern);
  }
  if (rng.chance(0.5)) {
    const neon = rng.pick([B.neon_pink, B.neon_cyan]);
    S.set(x0, roof + 2, neon); S.set(x1, roof + 2, neon); S.set(x0, roof + 3, neon); S.set(x1, roof + 3, neon);
  }
  if (!features) return;
  S.set(x0, roof - 1, style.trim); S.set(x1, roof - 1, style.trim);
  const f = rng.pick(['antenna', 'tank', 'garden', 'solar', 'antenna']);
  if (f === 'antenna') {
    const ax = x1 - 3;
    for (let y = roof - 1; y >= roof - 6; y--) S.set(ax, y, B.lamppost);
    S.set(ax, roof - 7, B.redlight);
  } else if (f === 'tank') {
    const tx = x0 + 4;
    S.set(tx, roof - 1, B.fence); S.set(tx + 2, roof - 1, B.fence); S.set(tx, roof - 2, B.fence); S.set(tx + 2, roof - 2, B.fence);
    fillRect(S, tx, roof - 5, tx + 2, roof - 3, B.planks_dark);
  } else if (f === 'garden') {
    for (let x = x0 + 1; x <= x1 - 1; x++) if (x !== lx) { S.set(x, roof, B.grass); if (rng.chance(0.4)) S.set(x, roof - 1, rng.pick([B.rose, B.tulip, B.daisy]), 2); }
    if (w > 10) buildTree(S, x1 - 3, roof - 1, rng.pick(['oak', 'cherry']), rng);
  } else {
    for (let x = x0 + 4; x <= x1 - 2; x += 2) S.set(x, roof - 1, B.metal);
  }
}

function buildCity(S, world, rng, x0, x1, gy, name) {
  for (let x = x0; x <= x1; x++) {
    for (let y = gy - 75; y < gy; y++) S.set(x, y, B.air);
    S.set(x, gy, B.road);
    for (let y = gy + 1; y <= gy + 3; y++) S.set(x, y, B.concrete_gray);
  }
  const styles = CITY_STYLES();
  const mid = (x0 + x1) / 2;
  // plan buildings first so the rooftop course can be tuned
  const plan = [];
  let x = x0 + 8;
  const courseStart = 1, courseLen = 7;
  let parkAt = -1;
  while (x < x1 - 14) {
    const i = plan.length;
    if (parkAt < 0 && i > courseStart + courseLen && x > mid - 10) {
      parkAt = i; plan.push({ park: true, x0: x, w: 24 }); x += 24 + 4; continue;
    }
    const inCourse = i >= courseStart && i < courseStart + courseLen;
    const w = rng.int(9, 15);
    let h;
    if (inCourse) {
      const prev = plan[i - 1];
      h = i === courseStart ? rng.pick([20, 24]) : clamp(prev.h + rng.pick([-4, 0, 0, 4, -8]), 16, 40);
    } else {
      const center = 1 - Math.abs(x + w / 2 - mid) / ((x1 - x0) / 2);
      h = Math.round((14 + center * 28 + rng.int(0, 14)) / 4) * 4;
    }
    plan.push({ x0: x, w, h, inCourse, style: rng.pick(styles) });
    const gap = inCourse ? 3 + (rng.chance(0.4) ? 1 : 0) : rng.int(4, 7);
    x += w + gap;
  }
  for (const b of plan) {
    if (b.park) { buildPark(S, world, rng, b.x0, b.w, gy); continue; }
    buildSkyscraper(S, rng, b.x0, gy, b.w, b.h, b.style, !b.inCourse);
    world.npcSpawns.push({ kind: 'citizen', x: b.x0 + b.w / 2, y: gy, x0: b.x0 - 20, x1: b.x0 + b.w + 20 });
  }
  // street lamps in the gaps
  for (let k = 0; k < plan.length - 1; k++) {
    const a = plan[k], b = plan[k + 1];
    const ax1 = a.x0 + a.w - 1;
    const gap = b.x0 - ax1 - 1;
    if (gap >= 4) {
      const lx = ax1 + 1 + Math.floor(gap / 2);
      for (let y = gy - 1; y >= gy - 3; y--) S.set(lx, y, B.lamppost);
      S.set(lx, gy - 4, B.streetlamp);
    }
  }
  world.roads.push({ x0, x1, y: gy });
  // rooftop course
  const blds = plan.filter(b => b.inCourse);
  const c = newCourse('rooftop');
  for (let k = 0; k < blds.length; k++) {
    const b = blds[k], roof = gy - b.h, bx1 = b.x0 + b.w - 1;
    if (k === 0) { S.set(b.x0 + 4, roof - 1, B.flag_start); c.start = { x: b.x0 + 4, y: roof - 1 }; }
    else if (k === blds.length - 1) { S.set(b.x0 + 4, roof - 1, B.flag_finish); c.finish = { x: b.x0 + 4, y: roof - 1 }; S.set(bx1 - 1, roof - 1, B.gold_block); }
    else if (k % 2 === 0) { S.set(b.x0 + Math.floor(b.w / 2), roof - 1, B.flag_check); c.checks.push({ x: b.x0 + Math.floor(b.w / 2), y: roof - 1 }); }
    c.plats.push({ x: b.x0, y: roof, w: b.w });
    const nb = blds[k + 1];
    if (nb) {
      // boxes on the roof edge act as steps up to a taller neighbour
      const rise = nb.h - b.h;
      if (rise >= 4) {
        fillRect(S, bx1 - 3, roof - 2, bx1 - 2, roof - 1, B.metal);
        fillRect(S, bx1 - 1, roof - 4, bx1, roof - 1, B.metal);
        c.plats.push({ x: bx1 - 3, y: roof - 2, w: 2 }, { x: bx1 - 1, y: roof - 4, w: 2 });
      } else if (rise > 0) {
        fillRect(S, bx1 - 1, roof - 2, bx1, roof - 1, B.metal);
        c.plats.push({ x: bx1 - 1, y: roof - 2, w: 2 });
      }
    }
    if (b.w >= 12 && k > 0 && k < blds.length - 1) S.set(b.x0 + 6, roof - 1, B.metal); // small vent obstacle
    c.x0 = Math.min(c.x0, b.x0); c.x1 = Math.max(c.x1, bx1);
    c.fallY = Math.max(c.fallY, roof + 3);
    c.topY = Math.min(c.topY, roof - 1);
  }
  return c;
}

function buildPark(S, world, rng, x0, w, gy) {
  const x1 = x0 + w - 1;
  for (let x = x0; x <= x1; x++) S.set(x, gy - 1, B.grass);
  const fx = x0 + Math.floor(w / 2);
  for (let x = fx - 2; x <= fx + 2; x++) S.set(x, gy - 1, B.water, WATER_MAX);
  S.set(fx - 3, gy - 2, B.stonebricks); S.set(fx + 3, gy - 2, B.stonebricks);
  S.set(fx - 3, gy - 1, B.stonebricks); S.set(fx + 3, gy - 1, B.stonebricks);
  S.set(fx, gy, B.spring);
  for (const tx of [x0 + 2, x0 + 7, x1 - 7, x1 - 2]) buildTree(S, tx, gy - 2, rng.pick(['oak', 'cherry', 'birch']), rng);
  for (const bx of [x0 + 4, x1 - 4]) S.set(bx, gy - 2, B.chair);
  for (const fxx of [x0 + 5, x1 - 5, x0 + 9, x1 - 9]) S.set(fxx, gy - 2, rng.pick([B.rose, B.tulip, B.daisy, B.bluebell]), 2);
  buildLampPost(S, fx - 5, gy - 1, B.streetlamp);
  buildLampPost(S, fx + 5, gy - 1, B.streetlamp);
}

// --- parkour ------------------------------------------------------------------------
function newCourse(type) {
  const info = COURSE_INFO[type];
  return { type, name: info.name, desc: info.desc, start: null, checks: [], finish: null, x0: Infinity, x1: -Infinity, fallY: -Infinity, failMode: 'below', topY: Infinity, plats: [] };
}

function buildHopCourse(S, rng, type, x0, gy) {
  const c = newCourse(type);
  const cfgs = {
    classic: { jumps: 22, w: [1, 3], lo: 3, hi: 15, startH: 4, mat: () => rng.pick([B.planks_oak, B.stonebricks, B.cloth_green, B.cloth_yellow, B.planks_birch]) },
    ice: { jumps: 18, w: [3, 4], lo: 3, hi: 11, startH: 4, mat: () => B.ice, gentle: true },
    crumble: { jumps: 20, w: [2, 3], lo: 6, hi: 18, startH: 6, mat: () => B.crumble },
    cloud: { jumps: 22, w: [2, 4], lo: 28, hi: 40, startH: 34, mat: () => B.cloud, ladder: true },
    speed: { jumps: 12, w: [5, 6], lo: 3, hi: 10, startH: 4, mat: () => B.metal, speed: true },
    bounce: { jumps: 18, w: [2, 3], lo: 3, hi: 26, startH: 3, mat: () => rng.pick([B.cloth_pink, B.cloth_purple, B.cloth_blue]), bounce: true },
  };
  const cfg = cfgs[type];
  const stairMat = type === 'ice' ? B.snow : type === 'crumble' ? B.sandstone : B.stonebricks;
  const safeMat = type === 'crumble' ? B.sandstone : type === 'cloud' ? B.cloud : cfg.mat();
  let x = x0, y = gy - cfg.startH;
  let maxY = -Infinity;
  const plat = (px, py, w, idFn) => {
    c.plats.push({ x: px, y: py, w });
    for (let i = 0; i < w; i++) {
      S.set(px + i, py, idFn(i));
      for (let k = 1; k <= 3; k++) S.set(px + i, py - k, B.air);
    }
    maxY = Math.max(maxY, py);
    c.topY = Math.min(c.topY, py);
  };
  if (cfg.ladder) {
    for (let yy = gy - 1; yy >= y; yy--) { S.set(x, yy, B.ladder); S.set(x + 1, yy, B.planks_dark); }
    x += 1;
  } else {
    for (let k = 1; k < cfg.startH; k++) for (let j = 1; j <= k; j++) S.set(x + k - 1, gy - j, stairMat);
    x += cfg.startH - 1;
  }
  plat(x, y, 4, () => safeMat);
  if (!cfg.ladder) for (let i = 0; i < 4; i++) for (let yy = y + 1; yy < gy; yy++) S.set(x + i, yy, stairMat);
  S.set(x + 1, y - 1, B.flag_start); c.start = { x: x + 1, y: y - 1 };
  let prev = { x, y, w: 4 };
  x += 4;
  let since = 0;
  const top = gy - cfg.hi, bottom = gy - cfg.lo;
  for (let j = 0; j < cfg.jumps; j++) {
    since++;
    const isCheck = since >= 6 && j < cfg.jumps - 2;
    let w = isCheck ? 3 : rng.int(cfg.w[0], cfg.w[1]);
    let dy, gap;
    if (cfg.bounce && j % 3 === 1 && y - 4 >= top) {
      // a bounce pad at the end of the platform launches you to a high ledge
      const padX = x, padY = y;
      S.set(padX, padY, B.bounce); for (let k = 1; k <= 6; k++) S.set(padX, padY - k, B.air);
      c.plats.push({ x: padX, y: padY, w: 1, pad: true });
      x = padX + 1 + rng.int(1, 2); y = padY - 4;
      plat(x, y, w, () => cfg.mat());
      if (isCheck) { S.set(x + 1, y - 1, B.flag_check); c.checks.push({ x: x + 1, y: y - 1 }); since = 0; }
      prev = { x, y, w }; x += w;
      continue;
    }
    if (cfg.speed && j % 2 === 0) {
      S.set(prev.x + prev.w - 1, prev.y, B.boost); S.set(prev.x + prev.w - 2, prev.y, B.boost);
      dy = y + 1 <= bottom && rng.chance(0.4) ? 1 : 0;
      gap = rng.int(6, 8);
    } else {
      const opts = [];
      if (!cfg.gentle && y - 2 >= top) opts.push([-2, 1, 2]);
      if (y - 1 >= top) opts.push([-1, 1, cfg.gentle ? 2 : 3], [-1, 1, 2]);
      opts.push([0, 2, cfg.gentle ? 3 : 4], [0, 2, 3]);
      if (y + 1 <= bottom) opts.push([1, 2, 4]);
      if (y + 2 <= bottom) opts.push([2, 2, 4]);
      const o = rng.pick(opts);
      dy = o[0]; gap = rng.int(o[1], o[2]);
      if (w === 1) gap = Math.max(1, gap - 1);
    }
    x += gap; y += dy;
    plat(x, y, w, () => cfg.mat());
    if (isCheck) {
      for (let i = 0; i < w; i++) S.set(x + i, y, safeMat);
      S.set(x + 1, y - 1, B.flag_check); c.checks.push({ x: x + 1, y: y - 1 }); since = 0;
    }
    prev = { x, y, w };
    x += w;
  }
  x += 2;
  plat(x, y, 5, () => (type === 'crumble' ? B.sandstone : B.gold_block));
  S.set(x + 2, y - 1, B.flag_finish); c.finish = { x: x + 2, y: y - 1 };
  S.set(x + 4, y - 1, B.lantern);
  c.x0 = x0; c.x1 = x + 5;
  c.fallY = maxY + 2.5;
  return c;
}

function buildLavaCourse(S, rng, x0, gy) {
  const c = newCourse('lava');
  for (let x = x0 - 4; x < x0 + 6; x++) S.set(x, gy, B.basalt);
  S.set(x0 + 2, gy - 1, B.flag_start); c.start = { x: x0 + 2, y: gy - 1 };
  const px0 = x0 + 6;
  c.plats.push({ x: x0, y: gy, w: 6 });
  const pillars = [];
  let x = px0 + 2, ty = gy - 1, since = 0;
  for (let j = 0; j < 20; j++) {
    since++;
    const isCheck = since >= 6 && j < 18;
    const w = isCheck ? 3 : rng.int(1, 2);
    ty = clamp(ty + rng.int(-1, 1), gy - 2, gy);
    pillars.push({ x, w, ty, isCheck });
    if (isCheck) since = 0;
    x += w + rng.int(2, w === 1 ? 2 : 3);
  }
  const px1 = x - 1; // last open column of the pit; solid ground resumes at x
  for (let xx = px0; xx <= px1; xx++) {
    for (let yy = gy - 4; yy <= gy + 3; yy++) S.set(xx, yy, B.air);
    S.set(xx, gy + 4, B.lava); S.set(xx, gy + 5, B.lava); S.set(xx, gy + 6, B.basalt);
  }
  for (let yy = gy; yy <= gy + 6; yy++) { S.set(px0 - 1, yy, B.basalt); S.set(px1 + 1, yy, B.basalt); }
  for (const p of pillars) {
    for (let i = 0; i < p.w; i++) for (let yy = p.ty; yy <= gy + 5; yy++) S.set(p.x + i, yy, B.basalt);
    if (p.isCheck) { S.set(p.x + 1, p.ty - 1, B.flag_check); c.checks.push({ x: p.x + 1, y: p.ty - 1 }); }
    c.plats.push({ x: p.x, y: p.ty, w: p.w });
  }
  c.plats.push({ x: px1 + 1, y: gy, w: 8 });
  for (let xx = px1 + 1; xx < px1 + 10; xx++) S.set(xx, gy, B.basalt);
  S.set(px1 + 4, gy - 1, B.flag_finish); c.finish = { x: px1 + 4, y: gy - 1 };
  S.set(px1 + 7, gy - 1, B.lantern); S.set(x0 - 2, gy - 1, B.lantern);
  c.x0 = px0; c.x1 = px1 + 1; c.fallY = gy + 2; c.topY = gy - 2;
  return c;
}

function buildTowerCourse(S, rng, x0, gy) {
  const c = newCourse('tower');
  c.failMode = 'relative';
  const w = 9, x1 = x0 + w - 1, height = 46, topY = gy - height;
  fillRect(S, x0 - 1, topY - 6, x1 + 1, gy - 1, B.air);
  fillRect(S, x0, gy, x1, gy, B.stonebricks);
  bgRect(S, x0 + 1, topY, x1 - 1, gy - 1, B.stonebricks);
  for (let y = gy - 1; y >= topY; y--) { S.set(x0, y, B.stonebricks); S.set(x1, y, B.stonebricks); }
  for (let y = gy - 6; y > topY + 2; y -= 7) { S.set(x0, y, B.glass); S.set(x1, y, B.glass); S.set(x0, y - 1, B.glass); S.set(x1, y - 1, B.glass); }
  placeDoor(S, x0, gy - 1);
  S.set(x0 + 3, gy - 1, B.flag_start); c.start = { x: x0 + 3, y: gy - 1 };
  const L = x0 + 1, R = x1 - 1; // interior columns L..R (7 wide)
  let fy = gy; // row the player stands on
  let side = 1; // next ledge on the right
  let segs = 0;
  while (fy - 2 > topY + 4) {
    segs++;
    const kind = segs % 4 === 0 ? 'check' : rng.pick(['ledges', 'ledges', 'ladder', 'bounce']);
    if (kind === 'check') {
      fy -= 2;
      fillRect(S, L, fy, R, fy, B.platform);
      S.set(side > 0 ? L + 1 : R - 1, fy - 1, B.flag_check); c.checks.push({ x: side > 0 ? L + 1 : R - 1, y: fy - 1 });
    } else if (kind === 'ladder') {
      // ladder up the wall beside the ledge you are standing on
      const cur = -side, lx = cur > 0 ? R : L;
      for (let y = fy - 1; y >= fy - 5; y--) S.set(lx, y, B.ladder);
      fy -= 5;
      fillRect(S, cur > 0 ? R - 2 : L + 1, fy, cur > 0 ? R - 1 : L + 2, fy, B.platform);
    } else if (kind === 'bounce') {
      // bounce pad set into the current ledge, landing on the far side
      const cur = -side;
      S.set(cur > 0 ? R - 1 : L + 1, fy, B.bounce);
      for (let y = fy - 1; y >= fy - 6; y--) S.set(cur > 0 ? R - 1 : L + 1, y, B.air);
      fy -= 4;
      fillRect(S, side > 0 ? R - 2 : L, fy, side > 0 ? R : L + 2, fy, B.platform);
      side = -side;
    } else {
      for (let k = 0; k < 3 && fy - 2 > topY + 4; k++) {
        fy -= 2;
        const lw = rng.int(2, 3);
        if (side > 0) fillRect(S, R - lw + 1, fy, R, fy, B.platform);
        else fillRect(S, L, fy, L + lw - 1, fy, B.platform);
        side = -side;
      }
    }
    if (segs % 2 === 0) S.set(side > 0 ? R : L, fy - 2, B.torch);
  }
  // finish deck
  fy = topY;
  fillRect(S, x0, fy, x1, fy, B.stonebricks);
  const hx = side > 0 ? L : R; // hatch above the last ledge
  for (let y = fy; y <= fy + 4; y++) S.set(hx, y, B.ladder);
  for (let x = x0; x <= x1; x += 2) S.set(x, fy - 1, B.stonebricks);
  S.set(x0 + 4, fy - 1, B.flag_finish); c.finish = { x: x0 + 4, y: fy - 1 };
  S.set(x0 + 3, fy - 1, B.air); S.set(x0 + 5, fy - 1, B.lantern);
  c.x0 = x0; c.x1 = x1; c.fallY = gy + 1; c.topY = topY;
  return c;
}

function buildCourse(S, rng, type, x0, gy) {
  if (type === 'lava') return buildLavaCourse(S, rng, x0, gy);
  if (type === 'tower') return buildTowerCourse(S, rng, x0, gy);
  return buildHopCourse(S, rng, type, x0, gy);
}
