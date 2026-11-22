'use strict';
// ---------------------------------------------------------------------------
// Blocks & procedural pixel-art textures.
// Every texture is painted in code on a 16x16 grid, then packed in an atlas.
// ---------------------------------------------------------------------------

const TS = 16; // texture size in pixels
const TEX = { list: [], index: {}, atlas: null, atlasBg: null, cols: 16, icons: {} };

function makePainter(seed) {
  const data = new Uint8ClampedArray(TS * TS * 4);
  const rnd = mulberry32(seed);
  const p = {
    data,
    r: rnd,
    ri: n => Math.floor(rnd() * n),
    set(x, y, c, a = 255) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= TS || y >= TS) return;
      const i = (y * TS + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = a;
    },
    get(x, y) {
      const i = (y * TS + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    },
    alpha(x, y) { return data[(y * TS + x) * 4 + 3]; },
    clear(x, y) { const i = (y * TS + x) * 4 + 3; data[i] = 0; },
    rect(x, y, w, h, c, a = 255) {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) p.set(i, j, c, a);
    },
    fill(c, a = 255) { p.rect(0, 0, TS, TS, c, a); },
    noise(pal, a = 255) {
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, pal[Math.floor(rnd() * pal.length)], a);
    },
    speck(c, n, a = 255) { for (let k = 0; k < n; k++) p.set(p.ri(TS), p.ri(TS), c, a); },
    // multiply the existing colour of a pixel
    tint(x, y, f) {
      if (x < 0 || y < 0 || x >= TS || y >= TS) return;
      const i = (y * TS + x) * 4;
      data[i] *= f; data[i + 1] *= f; data[i + 2] *= f;
    },
  };
  return p;
}

const H = hexRgb;
const pal = (...hs) => hs.map(H);

function tex(name, fn) {
  const p = makePainter(hashString(name));
  fn(p);
  TEX.index[name] = TEX.list.length;
  TEX.list.push({ name, data: p.data });
}

// --- painting helpers -------------------------------------------------------
function voronoi(p, n) {
  const pts = [];
  for (let k = 0; k < n; k++) pts.push([p.r() * TS, p.r() * TS]);
  const id = new Int16Array(TS * TS), edge = new Float32Array(TS * TS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let k = 0; k < n; k++) {
      let dx = Math.abs(x + 0.5 - pts[k][0]); dx = Math.min(dx, TS - dx);
      let dy = Math.abs(y + 0.5 - pts[k][1]); dy = Math.min(dy, TS - dy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
    }
    id[y * TS + x] = best; edge[y * TS + x] = d2 - d1;
  }
  return { id, edge };
}
function paintStones(p, palette, mortar, cells, edgeW = 1.1) {
  const v = voronoi(p, cells);
  const tones = []; for (let k = 0; k < cells; k++) tones.push(palette[p.ri(palette.length)]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const i = y * TS + x;
    if (v.edge[i] < edgeW) p.set(x, y, mortar);
    else {
      const t = tones[v.id[i]];
      const up = y > 0 ? v.edge[i - TS] : 9;
      p.set(x, y, up < edgeW ? shadeRgb(t, 1.15) : shadeRgb(t, 0.94 + p.r() * 0.12));
    }
  }
}
function paintDirt(p) {
  p.noise(pal('#8a5a3b', '#7a4e33', '#946545', '#6e4530'));
  p.speck(H('#a08f7a'), 4); p.speck(H('#5d3a26'), 8);
}
function paintPlanks(p, base) {
  const b = H(base);
  for (let board = 0; board < 4; board++) {
    const tone = shadeRgb(b, 0.9 + p.r() * 0.18);
    const joint = (board * 5 + 3 + p.ri(5)) % 16;
    for (let y = board * 4; y < board * 4 + 4; y++) for (let x = 0; x < TS; x++) {
      let c = shadeRgb(tone, 0.95 + p.r() * 0.1);
      if (y === board * 4) c = shadeRgb(tone, 1.1);
      if (y === board * 4 + 3) c = shadeRgb(tone, 0.68);
      if (x === joint) c = shadeRgb(tone, 0.62);
      p.set(x, y, c);
    }
    if (p.r() < 0.8) p.set((joint + 3) % 16, board * 4 + 1, shadeRgb(tone, 0.6));
  }
}
function paintLog(p, base, dark, light) {
  const b = H(base), d = H(dark), l = H(light);
  for (let x = 0; x < TS; x++) {
    const colTone = p.r();
    for (let y = 0; y < TS; y++) {
      let c = colTone < 0.25 ? d : colTone > 0.85 ? l : b;
      if (p.r() < 0.08) c = d;
      p.set(x, y, shadeRgb(c, 0.95 + p.r() * 0.1));
    }
  }
  p.rect(0, 0, 1, TS, shadeRgb(d, 0.8)); p.rect(15, 0, 1, TS, shadeRgb(d, 0.8));
}
function paintLeaves(p, palette, hole = 0.12, extra) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    if (p.r() < (edge ? hole * 2.2 : hole)) { p.clear(x, y); continue; }
    p.set(x, y, palette[p.ri(palette.length)]);
  }
  for (let k = 0; k < 5; k++) { // darker clumps
    const cx = p.ri(16), cy = p.ri(16);
    for (let j = 0; j < 3; j++) p.tint(cx + p.ri(3) - 1, cy + p.ri(3) - 1, 0.78);
  }
  if (extra) for (let k = 0; k < extra.n; k++) p.set(p.ri(16), p.ri(16), extra.pal[p.ri(extra.pal.length)]);
}
function paintBricks(p, palette, mortar, h = 4, w = 8) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, mortar);
  const rows = TS / h;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? w / 2 : 0;
    for (let bx = -1; bx < TS / w + 1; bx++) {
      const tone = palette[p.ri(palette.length)];
      for (let y = r * h; y < r * h + h - 1; y++) for (let x = bx * w + off; x < bx * w + off + w - 1; x++) {
        if (x < 0 || x >= TS) continue;
        let c = shadeRgb(tone, 0.94 + p.r() * 0.12);
        if (y === r * h) c = shadeRgb(tone, 1.12);
        p.set(x, y, c);
      }
    }
  }
}
function paintOre(p, color, light) {
  p.noise(pal('#8b8f93', '#7d8185', '#959a9e', '#71757a'));
  const c = H(color), l = H(light);
  for (let k = 0; k < 4; k++) {
    const cx = 2 + p.ri(12), cy = 2 + p.ri(12);
    for (let j = 0; j < 4; j++) p.set(cx + p.ri(3) - 1, cy + p.ri(3) - 1, c);
    p.set(cx, cy, l);
  }
}
function paintConcrete(p, base) {
  const b = H(base);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, shadeRgb(b, 0.96 + p.r() * 0.07));
}
function paintCloth(p, base) {
  const b = H(base);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const weave = ((x + y) % 4 === 0) ? 0.9 : ((x - y + 32) % 4 === 0 ? 1.06 : 1);
    p.set(x, y, shadeRgb(b, weave * (0.96 + p.r() * 0.08)));
  }
}
function paintRoof(p, base) {
  const b = H(base);
  for (let r = 0; r < 4; r++) {
    const off = r % 2 ? 2 : 0;
    for (let y = r * 4; y < r * 4 + 4; y++) for (let x = 0; x < TS; x++) {
      const sx = (x + off) % 4;
      let c = shadeRgb(b, 0.95 + p.r() * 0.1);
      if (y === r * 4 + 3) c = shadeRgb(b, 0.62);
      else if (sx === 3) c = shadeRgb(b, 0.78);
      else if (y === r * 4) c = shadeRgb(b, 1.12);
      p.set(x, y, c);
    }
  }
}
function paintGlassFrame(p, frame, pane, paneA, shine = true) {
  const f = H(frame), g = H(pane);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, g, paneA);
  p.rect(0, 0, 16, 1, f); p.rect(0, 15, 16, 1, f); p.rect(0, 0, 1, 16, f); p.rect(15, 0, 1, 16, f);
  if (shine) for (let k = 2; k < 7; k++) { p.set(k, 8 - k, H('#ffffff'), 150); p.set(k + 5, 14 - k, H('#ffffff'), 90); }
}
// tiny sprite helpers for plants
function stem(p, x, y0, y1, c) { for (let y = y0; y <= y1; y++) p.set(x, y, c); }
function leaf(p, x, y, dir, c) { p.set(x + dir, y, c); p.set(x + dir * 2, y - 1, c); }
function blob(p, cx, cy, r, palette) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (x * x + y * y <= r * r + r * 0.6) p.set(cx + x, cy + y, palette[p.ri(palette.length)]);
  }
}

// --- the textures -----------------------------------------------------------
function buildTextures() {
  const G = pal('#5fb83a', '#4fa52f', '#6cc544', '#58b035');
  tex('dirt', paintDirt);
  tex('grass', p => {
    paintDirt(p);
    for (let x = 0; x < TS; x++) {
      const gh = 3 + (p.r() < 0.45 ? 1 : 0) + (x % 5 === 2 ? 1 : 0);
      for (let y = 0; y < gh; y++) p.set(x, y, G[p.ri(4)]);
      if (p.r() < 0.4) p.set(x, gh, H('#3f8f28'));
      if (p.r() < 0.5) p.set(x, 0, H('#7fd457'));
    }
  });
  tex('stone', p => {
    p.noise(pal('#8b8f93', '#7d8185', '#959a9e', '#83878b'));
    for (let k = 0; k < 4; k++) { const x = p.ri(13), y = p.ri(16); for (let j = 0; j < 3; j++) p.set(x + j, y, H('#63676b')); }
  });
  tex('cobble', p => paintStones(p, pal('#8e9296', '#7a7e82', '#9da1a5', '#6f7377'), H('#4c5054'), 7));
  tex('sand', p => { p.noise(pal('#e3d397', '#dccb8c', '#e9dba3', '#d8c787')); p.speck(H('#c4b273'), 10); });
  tex('sandstone', p => {
    p.noise(pal('#dcc78a', '#d4bf80', '#e2ce93'));
    p.rect(0, 0, 16, 2, H('#ead9a4'));
    for (let x = 0; x < 16; x++) { p.set(x, 6, H('#c2ab6c')); p.set(x, 12, H('#c2ab6c')); }
  });
  tex('gravel', p => paintStones(p, pal('#8f8a86', '#a09a94', '#77726e', '#9b8f84'), H('#5e5955'), 11, 0.8));
  tex('clay', p => p.noise(pal('#a3a9b8', '#9aa0af', '#adb3c1')));
  tex('snow', p => { p.noise(pal('#f4f8ff', '#e9f1fb', '#ffffff')); p.speck(H('#d3dff0'), 8); });
  tex('snowgrass', p => {
    paintDirt(p);
    for (let x = 0; x < TS; x++) {
      const gh = 4 + (p.r() < 0.4 ? 1 : 0);
      for (let y = 0; y < gh; y++) p.set(x, y, pal('#f4f8ff', '#e6eef9', '#ffffff')[p.ri(3)]);
      if (p.r() < 0.35) p.set(x, gh, H('#cfdbea'));
    }
  });
  tex('ice', p => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, shadeRgb(H('#a9d8f5'), 0.95 + p.r() * 0.08), 225);
    for (let k = 0; k < 3; k++) { const o = p.ri(16); for (let j = 0; j < 6; j++) p.set(o + j, 12 - j - k * 3, H('#e4f5ff'), 240); }
    p.speck(H('#86c1e8'), 6, 235);
  });
  tex('bedrock', p => {
    const c = pal('#3a3a3e', '#2a2a2d', '#4a4a4f', '#1f1f22');
    for (let y = 0; y < TS; y += 2) for (let x = 0; x < TS; x += 2) p.rect(x, y, 2, 2, c[p.ri(4)]);
  });
  tex('darkstone', p => {
    p.noise(pal('#4b4f5c', '#434753', '#545866', '#3e414c'));
    for (let k = 0; k < 4; k++) { const x = p.ri(13), y = p.ri(16); for (let j = 0; j < 3; j++) p.set(x + j, y, H('#2f323b')); }
  });
  tex('basalt', p => {
    for (let x = 0; x < TS; x++) {
      const t = H(['#4a4441', '#3d3835', '#57504c'][p.ri(3)]);
      for (let y = 0; y < TS; y++) p.set(x, y, shadeRgb(t, x % 4 === 0 ? 0.7 : 0.95 + p.r() * 0.1));
    }
    p.rect(0, 0, 16, 1, H('#6b625c'));
  });
  tex('coal_ore', p => paintOre(p, '#2b2b2e', '#4a4a50'));
  tex('iron_ore', p => paintOre(p, '#d8a88a', '#f0cdb4'));
  tex('gold_ore', p => paintOre(p, '#f2c94c', '#fff1a8'));
  tex('gem_ore', p => paintOre(p, '#36d1c4', '#b5fff7'));

  tex('log_oak', p => paintLog(p, '#7a5532', '#5a3d22', '#8f6a42'));
  tex('log_birch', p => {
    p.noise(pal('#e8e4d8', '#f1eee5', '#dcd7c8'));
    for (let k = 0; k < 7; k++) { const x = p.ri(13), y = p.ri(16); p.rect(x, y, 2 + p.ri(3), 1, H('#2b2b2b')); }
    p.rect(0, 0, 1, 16, H('#bdb7a7')); p.rect(15, 0, 1, 16, H('#bdb7a7'));
  });
  tex('log_pine', p => paintLog(p, '#5b3f26', '#3f2a18', '#6d4d31'));
  tex('log_cherry', p => paintLog(p, '#6b3a3a', '#4a2626', '#80504a'));
  tex('log_palm', p => {
    p.noise(pal('#b08d57', '#a6824d', '#ba9862'));
    for (let y = 0; y < 16; y += 4) p.rect(0, y, 16, 1, H('#7f6238'));
    p.rect(0, 0, 1, 16, H('#8a6c40')); p.rect(15, 0, 1, 16, H('#8a6c40'));
  });
  tex('leaves_oak', p => paintLeaves(p, pal('#3f9b2f', '#358a28', '#4cae38', '#2f7d23')));
  tex('leaves_birch', p => paintLeaves(p, pal('#7cbf3f', '#6fae37', '#8bcf4a', '#62a032')));
  tex('leaves_pine', p => paintLeaves(p, pal('#2b6b3a', '#245c31', '#327a43', '#1f5029'), 0.1));
  tex('leaves_cherry', p => paintLeaves(p, pal('#f2a7c3', '#eb93b4', '#f7bfd3', '#e27fa5'), 0.12, { n: 8, pal: pal('#ffffff', '#ffe3ee') }));
  tex('leaves_palm', p => paintLeaves(p, pal('#5cb83a', '#4ea32f', '#6ccc44'), 0.22));
  tex('leaves_rainbow', p => {
    const bands = pal('#ff6b6b', '#ffb347', '#ffe15d', '#6be36b', '#5db8ff', '#b77dff');
    paintLeaves(p, [H('#ffffff')], 0.1);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      if (!p.alpha(x, y)) continue;
      const b = Math.floor((y + (x * 3 + y) % 5 * 0.3) / 2.7) % 6;
      p.set(x, y, shadeRgb(bands[b], 0.86 + p.r() * 0.2));
    }
  });
  tex('mushroom_cap', p => {
    p.noise(pal('#c8322b', '#b92b25', '#d33b33'));
    for (let k = 0; k < 4; k++) { const x = 1 + p.ri(12), y = 1 + p.ri(12); p.rect(x, y, 3, 2, H('#f4eee6')); p.rect(x + 1, y - 1, 1, 1, H('#f4eee6')); }
  });
  tex('mushroom_stem', p => {
    p.noise(pal('#e6dcc4', '#ddd2b8', '#efe6d1'));
    for (let x = 2; x < 16; x += 4) for (let y = 0; y < 16; y++) if (p.r() < 0.6) p.set(x, y, H('#cfc3a6'));
  });
  tex('crystal', p => {
    const C1 = pal('#b07cff', '#9a63f2', '#c79bff'), hi = H('#efe2ff');
    const shard = (cx, top, w) => {
      for (let y = top; y < 16; y++) {
        const half = Math.min(w, Math.floor((y - top) / 1.5) + 1);
        for (let x = -half; x <= half; x++) p.set(cx + x, y, C1[p.ri(3)], 235);
        p.set(cx - half + 1, y, hi, 235);
      }
    };
    shard(4, 4, 2); shard(10, 1, 3); shard(13, 8, 1);
  });

  tex('planks_oak', p => paintPlanks(p, '#b8945f'));
  tex('planks_birch', p => paintPlanks(p, '#d7c48e'));
  tex('planks_pine', p => paintPlanks(p, '#8a6239'));
  tex('planks_cherry', p => paintPlanks(p, '#d99a8f'));
  tex('planks_dark', p => paintPlanks(p, '#5a3d24'));
  tex('bricks', p => paintBricks(p, pal('#a4473a', '#9a3f33', '#b0503f', '#8f3a2f'), H('#b9b0a3')));
  tex('stonebricks', p => {
    paintBricks(p, pal('#8e9296', '#868a8e', '#979b9f'), H('#5e6266'), 8, 16);
    for (let k = 0; k < 2; k++) { const x = 2 + p.ri(10), y = 1 + p.ri(12); p.set(x, y, H('#5e6266')); p.set(x + 1, y + 1, H('#5e6266')); }
  });
  tex('sandbricks', p => paintBricks(p, pal('#e2cd90', '#d8c385', '#ead89f'), H('#b8a067'), 8, 8));
  tex('glass', p => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, H('#cfeefe'), 45);
    p.rect(0, 0, 16, 1, H('#e8f7ff'), 210); p.rect(0, 15, 16, 1, H('#bfe0f0'), 210);
    p.rect(0, 0, 1, 16, H('#e8f7ff'), 210); p.rect(15, 0, 1, 16, H('#bfe0f0'), 210);
    for (let k = 2; k < 7; k++) { p.set(k, 8 - k, H('#ffffff'), 170); p.set(k + 5, 14 - k, H('#ffffff'), 110); }
  });
  tex('window', p => {
    paintGlassFrame(p, '#7a5332', '#bfe6ff', 90);
    p.rect(0, 0, 16, 2, H('#7a5332')); p.rect(0, 14, 16, 2, H('#6a4529')); p.rect(0, 0, 2, 16, H('#7a5332')); p.rect(14, 0, 2, 16, H('#6a4529'));
    p.rect(7, 0, 2, 16, H('#7a5332')); p.rect(0, 7, 16, 2, H('#7a5332'));
  });
  tex('cityglass', p => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, mixRgb(H('#6fb6d6'), H('#245a78'), y / 15), 225);
    for (let k = 0; k < 10; k++) p.set(3 + k, 12 - k, H('#bfe9ff'), 200);
    p.rect(0, 0, 16, 1, H('#1e2a33')); p.rect(0, 0, 1, 16, H('#1e2a33')); p.rect(0, 8, 16, 1, H('#1e2a33'));
  });
  tex('litwindow', p => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, mixRgb(H('#ffe08a'), H('#ffb43f'), y / 15));
    p.rect(2, 11, 3, 4, H('#8a5a2b')); p.rect(1, 9, 5, 2, H('#4f9a3a'));
    p.rect(0, 0, 16, 1, H('#3a2f25')); p.rect(0, 0, 1, 16, H('#3a2f25')); p.rect(0, 8, 16, 1, H('#3a2f25'));
  });
  tex('roof_red', p => paintRoof(p, '#b5432f'));
  tex('roof_blue', p => paintRoof(p, '#3d6ab5'));
  tex('roof_green', p => paintRoof(p, '#3f8f4e'));
  tex('roof_dark', p => paintRoof(p, '#4a4f5a'));
  tex('plaster', p => { p.noise(pal('#eee9df', '#e6e0d4', '#f3efe6')); p.speck(H('#d6cfc1'), 8); });
  tex('concrete_gray', p => paintConcrete(p, '#8d9399'));
  tex('concrete_white', p => paintConcrete(p, '#e4e6e8'));
  tex('concrete_dark', p => paintConcrete(p, '#3c4248'));
  tex('concrete_sand', p => paintConcrete(p, '#cdb68a'));
  tex('asphalt', p => { p.noise(pal('#3a3c40', '#34363a', '#404247', '#2e3033')); p.speck(H('#55585e'), 6); });
  tex('road', p => {
    p.noise(pal('#3a3c40', '#34363a', '#404247', '#2e3033'));
    p.rect(0, 0, 16, 1, H('#9a9ea4')); p.rect(3, 2, 10, 2, H('#f2c230'));
  });
  tex('metal', p => {
    p.noise(pal('#9aa3ab', '#939ca4', '#a1aab2'));
    p.rect(0, 0, 16, 1, H('#c5ccd2')); p.rect(0, 0, 1, 16, H('#c5ccd2'));
    p.rect(0, 15, 16, 1, H('#6f777e')); p.rect(15, 0, 1, 16, H('#6f777e'));
    [[2, 2], [13, 2], [2, 13], [13, 13]].forEach(([x, y]) => p.set(x, y, H('#5d646b')));
  });
  tex('gold_block', p => {
    p.noise(pal('#f2c94c', '#ecc142', '#f6d05a'));
    p.rect(0, 15, 16, 1, H('#c9962a')); p.rect(15, 0, 1, 16, H('#c9962a'));
    for (let k = 2; k < 8; k++) p.set(k, 9 - k, H('#fff1a8'));
  });
  tex('gem_block', p => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const d = (Math.abs(x - 7.5) + Math.abs(y - 7.5)) % 8;
      p.set(x, y, d < 1.5 ? H('#b5fff7') : d < 4 ? H('#4fd1c5') : H('#2fa89d'));
    }
  });
  tex('hay', p => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, pal('#d9b44a', '#c9a23c', '#ecc964')[(y + p.ri(2)) % 3]);
    p.rect(0, 3, 16, 2, H('#a8452f')); p.rect(0, 11, 16, 2, H('#a8452f'));
  });
  tex('pumpkin', p => {
    p.noise(pal('#e8862a', '#e07d22', '#ee9033'));
    [2, 6, 9, 13].forEach(x => { for (let y = 2; y < 16; y++) p.set(x, y, H('#c56a1b')); });
    p.rect(0, 0, 16, 2, H('#c56a1b')); p.rect(7, 0, 2, 2, H('#5b8a2e'));
    p.rect(4, 4, 1, 4, H('#f7b066'));
  });
  tex('melon', p => {
    p.noise(pal('#5c9e31', '#56962d', '#62a636'));
    for (let x = 1; x < 16; x += 4) for (let y = 0; y < 16; y++) p.set(x + (y % 6 < 3 ? 0 : 1), y, H('#3e7a1f'));
  });
  tex('cactus', p => {
    for (let y = 0; y < TS; y++) for (let x = 2; x < 14; x++) p.set(x, y, pal('#3e8f3a', '#388533', '#449a3f')[p.ri(3)]);
    for (let y = 0; y < 16; y++) { p.set(5, y, H('#5fb35a')); p.set(10, y, H('#5fb35a')); p.set(2, y, H('#2d6f2a')); p.set(13, y, H('#2d6f2a')); }
    for (let y = 1; y < 16; y += 4) { p.set(1, y, H('#efe9bd')); p.set(14, y + 2, H('#efe9bd')); }
  });
  tex('farmland', p => {
    p.noise(pal('#5e3d27', '#563722', '#66432b'));
    for (let x = 0; x < 16; x++) { const f = x % 4 < 2; p.set(x, 0, f ? H('#4a2f1d') : H('#7a5233')); p.set(x, 1, f ? H('#4a2f1d') : H('#6b4329')); }
  });
  tex('path', p => {
    p.noise(pal('#a07a4e', '#94704a', '#8a6643'));
    p.rect(0, 0, 16, 2, H('#b38c5c')); p.speck(H('#c2a06f'), 5);
  });
  for (const [k, c] of [['white', '#eeeeee'], ['red', '#c93a35'], ['orange', '#ea8a2c'], ['yellow', '#f0cf3a'], ['green', '#4caf50'], ['blue', '#3b6fd1'], ['purple', '#8a4fc7'], ['pink', '#f08bb4'], ['black', '#2b2d31']]) {
    tex('cloth_' + k, p => paintCloth(p, c));
  }

  // furniture & decoration (transparent sprites)
  const WOOD = H('#9b6b3f'), WOOD_D = H('#6e4829'), WOOD_L = H('#b98a58');
  tex('bookshelf', p => {
    p.fill(WOOD_D);
    p.rect(1, 1, 14, 6, H('#3b2616')); p.rect(1, 9, 14, 6, H('#3b2616'));
    const books = pal('#c0392b', '#2e86c1', '#27ae60', '#f1c40f', '#8e44ad', '#d35400', '#ecf0f1');
    for (const top of [1, 9]) { let x = 1; while (x < 15) { const w = 1 + p.ri(2), h = 4 + p.ri(3); p.rect(x, top + 6 - h, w, h, books[p.ri(books.length)]); x += w; } }
    p.rect(0, 7, 16, 2, WOOD); p.rect(0, 0, 16, 1, WOOD_L);
  });
  tex('table', p => {
    p.rect(0, 5, 16, 3, WOOD); p.rect(0, 5, 16, 1, WOOD_L); p.rect(0, 7, 16, 1, WOOD_D);
    p.rect(2, 8, 2, 8, WOOD_D); p.rect(12, 8, 2, 8, WOOD_D);
  });
  tex('chair', p => {
    p.rect(3, 1, 2, 9, WOOD_D); p.rect(3, 8, 10, 2, WOOD); p.rect(3, 8, 10, 1, WOOD_L);
    p.rect(3, 10, 2, 6, WOOD_D); p.rect(11, 10, 2, 6, WOOD_D);
  });
  tex('bed', p => {
    p.rect(0, 4, 2, 12, WOOD_D); p.rect(0, 12, 16, 2, WOOD_D); p.rect(14, 13, 2, 3, WOOD_D);
    p.rect(2, 9, 14, 3, H('#f1ede4'));
    p.rect(2, 7, 4, 3, H('#ffffff')); p.rect(2, 9, 4, 1, H('#d9d4c8'));
    p.rect(6, 8, 10, 4, H('#c0392b')); p.rect(6, 8, 10, 1, H('#e05a48'));
  });
  tex('chest', p => {
    p.rect(1, 4, 14, 12, WOOD); p.rect(1, 4, 14, 1, WOOD_L);
    p.rect(1, 4, 1, 12, WOOD_D); p.rect(14, 4, 1, 12, WOOD_D); p.rect(1, 15, 14, 1, WOOD_D); p.rect(1, 8, 14, 1, WOOD_D);
    p.rect(7, 7, 2, 3, H('#d8c35a'));
  });
  tex('workbench', p => {
    p.rect(0, 5, 16, 3, WOOD_L); p.rect(0, 7, 16, 1, WOOD_D); p.rect(1, 8, 2, 8, WOOD_D); p.rect(13, 8, 2, 8, WOOD_D);
    p.rect(3, 2, 5, 2, H('#9aa3ab')); p.rect(7, 1, 1, 4, WOOD_D); // saw
    p.rect(10, 1, 4, 2, H('#6f777e')); p.rect(11, 3, 1, 2, WOOD_D); // hammer
    p.rect(3, 10, 10, 1, WOOD); p.rect(3, 10, 10, 1, WOOD);
  });
  tex('flowerpot', p => {
    p.rect(4, 10, 8, 2, H('#c76b43')); p.rect(5, 12, 6, 4, H('#b5603a')); p.rect(5, 10, 6, 1, H('#5e3d27'));
    stem(p, 8, 4, 9, H('#3f8f28')); leaf(p, 8, 8, -1, H('#4fa52f')); leaf(p, 8, 7, 1, H('#4fa52f'));
    p.rect(7, 2, 3, 3, H('#e0457b')); p.set(8, 3, H('#ffd34d'));
  });
  tex('lantern', p => {
    p.rect(7, 0, 2, 3, H('#3b3b3b'));
    p.rect(4, 3, 8, 11, H('#2e2e2e')); p.rect(5, 5, 6, 7, H('#ffd36b')); p.rect(6, 6, 4, 5, H('#fff3c4'));
    p.rect(3, 3, 10, 1, H('#4a4a4a')); p.rect(3, 13, 10, 1, H('#4a4a4a'));
  });
  tex('torch', p => {
    p.rect(7, 7, 2, 9, H('#7a5332')); p.rect(7, 7, 1, 9, H('#93683f'));
    p.rect(6, 3, 4, 4, H('#ff8a2a')); p.rect(7, 2, 2, 5, H('#ffd34d')); p.rect(7, 4, 2, 2, H('#fff6c9'));
  });
  tex('glowblock', p => {
    p.fill(H('#e5a93a'));
    p.rect(1, 1, 14, 14, H('#ffd56b'));
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if ((x + y) % 5 === 0 || (x - y + 20) % 5 === 0) p.set(x, y, H('#fff2b8'));
  });
  tex('neon_pink', p => {
    p.fill(H('#2a1030'));
    p.rect(2, 2, 12, 2, H('#ff5fd2')); p.rect(2, 12, 12, 2, H('#ff5fd2')); p.rect(2, 2, 2, 12, H('#ff5fd2')); p.rect(12, 2, 2, 12, H('#ff5fd2'));
    p.rect(3, 2, 10, 1, H('#ffc2f0')); p.rect(6, 6, 4, 4, H('#ff5fd2')); p.rect(7, 7, 2, 2, H('#ffc2f0'));
  });
  tex('neon_cyan', p => {
    p.fill(H('#0f2630'));
    for (let k = 0; k < 3; k++) { p.rect(2, 3 + k * 4, 12, 2, H('#5ff4ff')); p.rect(2, 3 + k * 4, 12, 1, H('#d4fdff')); }
  });
  tex('streetlamp', p => {
    p.rect(7, 13, 2, 3, H('#4b5258'));
    p.rect(2, 6, 12, 4, H('#4b5258')); p.rect(2, 6, 12, 1, H('#6c757c'));
    p.rect(4, 10, 8, 3, H('#fff1b8')); p.rect(5, 10, 6, 1, H('#ffffff'));
  });
  tex('lamppost', p => { p.rect(7, 0, 2, 16, H('#4b5258')); p.rect(7, 0, 1, 16, H('#6c757c')); });
  tex('redlight', p => {
    p.rect(6, 12, 4, 4, H('#3b3b3b'));
    blob(p, 8, 8, 3, pal('#ff3b3b', '#e82e2e')); p.rect(7, 6, 2, 2, H('#ffb3b3'));
  });
  tex('ladder', p => {
    p.rect(2, 0, 2, 16, H('#8b5e34')); p.rect(12, 0, 2, 16, H('#8b5e34'));
    p.rect(2, 0, 1, 16, H('#a87445')); p.rect(12, 0, 1, 16, H('#a87445'));
    for (const y of [2, 7, 12]) { p.rect(2, y, 12, 2, H('#9b6b3f')); p.rect(2, y, 12, 1, H('#b98a58')); }
  });
  tex('fence', p => {
    p.rect(6, 0, 4, 16, WOOD); p.rect(6, 0, 1, 16, WOOD_L); p.rect(9, 0, 1, 16, WOOD_D);
    p.rect(0, 3, 16, 2, WOOD); p.rect(0, 10, 16, 2, WOOD); p.rect(0, 3, 16, 1, WOOD_L); p.rect(0, 10, 16, 1, WOOD_L);
  });
  const doorPanel = (p, top, open) => {
    if (open) { p.rect(1, 0, 3, 16, WOOD_D); p.rect(1, 0, 1, 16, WOOD); if (!top) p.set(3, 2, H('#d8c35a')); return; }
    p.rect(2, 0, 12, 16, WOOD); p.rect(2, 0, 1, 16, WOOD_D); p.rect(13, 0, 1, 16, WOOD_D);
    for (let y = 0; y < 16; y += 5) p.rect(3, y, 10, 1, WOOD_L);
    if (top) { p.rect(0, 0, 16, 1, WOOD_D); p.rect(5, 3, 6, 7, H('#bfe6ff'), 160); p.rect(5, 3, 6, 1, WOOD_D); p.rect(7, 3, 1, 7, WOOD_D); }
    else { p.rect(11, 1, 2, 2, H('#d8c35a')); }
  };
  tex('door_b', p => doorPanel(p, false, false));
  tex('door_t', p => doorPanel(p, true, false));
  tex('door_b_open', p => doorPanel(p, false, true));
  tex('door_t_open', p => doorPanel(p, true, true));
  tex('icon_door', p => {
    p.rect(4, 0, 8, 16, WOOD); p.rect(4, 0, 8, 1, WOOD_D); p.rect(4, 0, 1, 16, WOOD_D); p.rect(11, 0, 1, 16, WOOD_D);
    p.rect(6, 2, 4, 4, H('#bfe6ff')); p.rect(9, 9, 1, 2, H('#d8c35a'));
  });
  tex('platform', p => {
    p.rect(0, 0, 16, 4, H('#a77a48')); p.rect(0, 0, 16, 1, H('#c39463')); p.rect(0, 3, 16, 1, H('#6e4829'));
    p.rect(1, 4, 2, 3, H('#6e4829')); p.rect(13, 4, 2, 3, H('#6e4829'));
  });

  // parkour & special
  tex('bounce', p => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, H('#5fd35a'), 235);
    p.rect(0, 0, 16, 1, H('#3a9d36')); p.rect(0, 15, 16, 1, H('#3a9d36')); p.rect(0, 0, 1, 16, H('#3a9d36')); p.rect(15, 0, 1, 16, H('#3a9d36'));
    p.rect(3, 3, 10, 10, H('#9cf28f'), 220); p.rect(3, 3, 4, 2, H('#ffffff'), 220);
  });
  for (let f = 0; f < 2; f++) tex('boost' + f, p => {
    p.fill(H('#2d3440')); p.rect(0, 0, 16, 2, H('#ffcf3a'));
    for (let c = 0; c < 2; c++) {
      const ox = c * 7 + f * 3 - 2;
      for (let k = 0; k < 5; k++) { p.set(ox + k, 4 + k, H('#ffcf3a')); p.set(ox + k, 12 - k, H('#ffcf3a')); p.set(ox + k + 1, 4 + k, H('#ff9f1a')); p.set(ox + k + 1, 12 - k, H('#ff9f1a')); }
    }
  });
  tex('crumble', p => {
    p.noise(pal('#c9a66b', '#bd9a60', '#d4b277'));
    for (let k = 0; k < 4; k++) { let x = p.ri(16), y = p.ri(16); for (let j = 0; j < 5; j++) { p.set(x, y, H('#7d5f35')); x += p.ri(3) - 1; y += 1; } }
    p.rect(0, 0, 16, 1, H('#e0c38a'));
  });
  tex('cloud', p => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, y > 11 ? H('#dfe8f3') : H('#ffffff'), 238);
    [[0, 0], [15, 0], [0, 15], [15, 15]].forEach(([x, y]) => p.clear(x, y));
    p.speck(H('#eef4fb'), 12, 238);
  });
  tex('spring', p => {
    paintBricks(p, pal('#8e9296', '#868a8e', '#979b9f'), H('#5e6266'), 8, 16);
    p.rect(4, 4, 8, 8, H('#3aa0ff')); p.rect(5, 5, 4, 2, H('#8fd0ff')); p.rect(4, 4, 8, 1, H('#1f6fc2'));
  });
  tex('sponge', p => {
    p.noise(pal('#e3cf4a', '#d9c443', '#ead656'));
    for (let k = 0; k < 12; k++) { const x = p.ri(15), y = p.ri(15); p.rect(x, y, 2, 1 + p.ri(2), H('#b89d2a')); }
  });
  tex('boom', p => {
    p.noise(pal('#d43c2c', '#c93527', '#dc4433'));
    p.rect(0, 5, 16, 6, H('#f1ede4'));
    for (const x of [4, 11]) { p.rect(x, 6, 2, 3, H('#222222')); p.rect(x, 9, 2, 1, H('#222222')); }
    p.rect(0, 0, 16, 1, H('#a42a1e'));
  });
  for (const [k, c] of [['start', '#3fbf4f'], ['check', '#3b8ff0'], ['finish', null]]) {
    tex('flag_' + k, p => {
      p.rect(3, 1, 2, 15, H('#d9d9d9')); p.rect(3, 1, 1, 15, H('#ffffff')); p.rect(2, 14, 4, 2, H('#7a7a7a'));
      for (let y = 1; y < 8; y++) for (let x = 5; x < 14; x++) {
        const col = c ? shadeRgb(H(c), y === 1 ? 1.15 : 1) : (((x >> 1) + (y >> 1)) % 2 ? H('#111111') : H('#ffffff'));
        p.set(x, y, col);
      }
    });
  }
  for (let f = 0; f < 4; f++) tex('lava' + f, p => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const v = fbm2(x / 5 + f * 0.9, y / 5 + f * 0.6, 77, 2);
      const c = v < 0.38 ? H('#a3220f') : v < 0.52 ? H('#e2501c') : v < 0.66 ? H('#ff8a24') : H('#ffd35a');
      p.set(x, y, c);
    }
  });
  for (let k = 0; k < 4; k++) tex('crack' + k, p => {
    const n = 3 + k * 4;
    for (let s = 0; s < n; s++) {
      let x = 4 + p.ri(8), y = 4 + p.ri(8);
      const dx = p.ri(3) - 1, dy = p.ri(3) - 1;
      for (let j = 0; j < 3 + k; j++) { p.set(x, y, H('#000000'), 150); x += dx || 1; y += dy; }
    }
  });

  // icons for items that are not plain blocks
  tex('icon_bucket', p => {
    for (let y = 5; y < 15; y++) { const inset = Math.floor((y - 5) / 4); p.rect(3 + inset, y, 10 - inset * 2, 1, H('#9aa3ab')); }
    p.rect(4, 5, 8, 3, H('#3a8ff0')); p.rect(4, 5, 8, 1, H('#8fd0ff'));
    p.rect(3, 4, 10, 1, H('#6f777e'));
    p.set(3, 2, H('#6f777e')); p.set(4, 1, H('#6f777e')); p.rect(5, 0, 6, 1, H('#6f777e')); p.set(11, 1, H('#6f777e')); p.set(12, 2, H('#6f777e'));
  });
  tex('icon_fertilizer', p => {
    p.rect(4, 5, 8, 10, H('#c9a66b')); p.rect(5, 3, 6, 2, H('#b08f58')); p.rect(6, 2, 4, 1, H('#8f6f3f'));
    p.rect(4, 14, 8, 1, H('#9a7a48'));
    stem(p, 8, 8, 12, H('#3f8f28')); leaf(p, 8, 10, -1, H('#5fb83a')); leaf(p, 8, 9, 1, H('#5fb83a'));
    [[2, 2], [13, 4], [1, 9], [14, 11]].forEach(([x, y]) => { p.set(x, y, H('#fff6a0')); });
  });
  tex('icon_wonder', p => {
    blob(p, 8, 9, 4, pal('#b07cff', '#ff7ad9', '#7cd7ff'));
    p.rect(6, 7, 2, 2, H('#ffffff'));
    [[2, 2], [13, 3], [3, 13], [13, 13], [8, 1]].forEach(([x, y]) => { p.set(x, y, H('#fff6a0')); p.set(x + 1, y, H('#fff6a0')); });
  });
  tex('icon_house_seed', p => {
    blob(p, 8, 11, 4, pal('#a0703f', '#8f6233'));
    p.rect(5, 6, 6, 5, H('#f3efe6')); p.rect(7, 8, 2, 3, H('#7a5332'));
    for (let k = 0; k < 4; k++) p.rect(4 + k, 5 - k, 8 - k * 2, 1, H('#c0392b'));
  });
  tex('icon_tower_seed', p => {
    blob(p, 8, 12, 3, pal('#a0703f', '#8f6233'));
    p.rect(6, 3, 4, 9, H('#8e9296')); p.rect(6, 3, 4, 1, H('#b4b8bc')); p.rect(7, 6, 2, 2, H('#ffd36b'));
    p.rect(5, 1, 6, 2, H('#3d6ab5'));
  });

  // plants ------------------------------------------------------------------
  const GR = H('#4fa52f'), GRD = H('#3a8a24'), GRL = H('#7fd457');
  tex('tallgrass', p => {
    for (let k = 0; k < 7; k++) {
      let x = 1 + p.ri(14); const h = 5 + p.ri(8); const lean = p.r() < 0.5 ? -1 : 1;
      for (let j = 0; j < h; j++) { p.set(x, 15 - j, j > h - 3 ? GRL : (p.r() < 0.5 ? GR : GRD)); if (j % 4 === 3) x += lean; }
    }
  });
  tex('deadbush', p => {
    const c = H('#8a6a3f');
    stem(p, 8, 9, 15, c);
    for (let k = 0; k < 5; k++) { let x = 8, y = 10 + p.ri(4); const d = p.r() < 0.5 ? -1 : 1; for (let j = 0; j < 4; j++) { x += d; y -= 1; p.set(x, y, c); } }
  });
  const sprout = (p) => { stem(p, 8, 12, 15, GRD); p.set(7, 12, GR); p.set(6, 11, GR); p.set(9, 12, GR); p.set(10, 11, GR); };
  const flower = (name, petal, center, tall = false) => {
    tex(name + '0', sprout);
    tex(name + '1', p => {
      const top = tall ? 3 : 7;
      stem(p, 8, top, 15, GRD); leaf(p, 8, 12, -1, GR); leaf(p, 8, 10, 1, GR);
      p.rect(7, top - 2, 2, 3, H(petal)); p.set(7, top - 2, GRL);
    });
    tex(name + '2', p => {
      const top = tall ? 5 : 8;
      stem(p, 8, top, 15, GRD); leaf(p, 8, 13, -1, GR); leaf(p, 8, 11, 1, GR);
      const r = tall ? 3 : 2; const c = H(petal);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (Math.abs(x) + Math.abs(y) <= r + (tall ? 1 : 0)) p.set(8 + x, top - r + y, c);
      p.rect(7, top - r - (tall ? 1 : 0), tall ? 3 : 2, tall ? 3 : 2, H(center));
    });
  };
  flower('rose', '#d6283a', '#ffd34d');
  flower('tulip', '#f07c3c', '#ffd34d');
  flower('daisy', '#ffffff', '#f2c230');
  flower('bluebell', '#5b7cf2', '#e0e8ff');
  flower('sunflower', '#ffd02a', '#7a4a1f', true);

  const crop = (name, stagesFn) => stagesFn.forEach((fn, i) => tex(name + i, fn));
  const tufts = (p, h, c, cTop) => {
    for (const x of [2, 5, 8, 11, 14]) for (let j = 0; j < h; j++) p.set(x + (j > h * 0.6 && x % 2 ? 1 : 0), 15 - j, j >= h - 2 ? cTop : c);
  };
  crop('wheat', [
    p => tufts(p, 3, GR, GRL),
    p => tufts(p, 6, GR, GRL),
    p => tufts(p, 11, GRD, GR),
    p => { tufts(p, 12, H('#c9a23c'), H('#e8c45a')); for (const x of [2, 5, 8, 11, 14]) p.rect(x - 1, 4, 2, 4, H('#d9b44a')); },
  ]);
  crop('carrot', [
    sprout,
    p => { for (const x of [4, 8, 12]) { stem(p, x, 10, 15, GR); p.set(x - 1, 10, GRL); p.set(x + 1, 11, GRL); } },
    p => { for (const x of [3, 7, 11]) { stem(p, x, 6, 15, GR); stem(p, x + 1, 8, 15, GRD); p.set(x - 1, 7, GRL); p.set(x + 2, 8, GRL); } },
    p => { for (const x of [3, 7, 11]) { stem(p, x, 5, 13, GR); stem(p, x + 1, 7, 13, GRD); p.set(x - 1, 6, GRL); p.rect(x, 13, 2, 3, H('#e8862a')); } },
  ]);
  crop('corn', [
    sprout,
    p => { stem(p, 8, 8, 15, GR); stem(p, 7, 10, 15, GRD); leaf(p, 8, 11, 1, GRL); leaf(p, 7, 12, -1, GRL); },
    p => { p.rect(7, 1, 2, 15, GR); for (let y = 4; y < 15; y += 3) { leaf(p, 8, y, 1, GRL); leaf(p, 7, y + 1, -1, GRD); } },
    p => { p.rect(7, 1, 2, 15, H('#7fae3a')); for (let y = 4; y < 15; y += 3) { leaf(p, 8, y, 1, H('#9bc94a')); } p.rect(9, 6, 2, 5, H('#f2d14a')); p.rect(4, 9, 2, 4, H('#f2d14a')); p.set(10, 5, H('#c9a23c')); },
  ]);
  crop('tomato', [
    sprout,
    p => blob(p, 8, 12, 3, [GR, GRD]),
    p => { stem(p, 13, 2, 15, H('#8a6a3f')); blob(p, 8, 10, 5, [GR, GRD]); [[5, 8], [10, 7], [7, 12]].forEach(([x, y]) => p.set(x, y, H('#ffd34d'))); },
    p => { stem(p, 13, 2, 15, H('#8a6a3f')); blob(p, 8, 10, 5, [GR, GRD]); [[5, 8], [10, 6], [7, 12], [10, 12]].forEach(([x, y]) => { p.rect(x, y, 2, 2, H('#e0392b')); p.set(x, y, H('#ff8a7a')); }); },
  ]);
  crop('berrybush', [
    sprout,
    p => blob(p, 8, 11, 4, [H('#3a8a3a'), H('#2f7a30'), H('#46a046')]),
    p => { blob(p, 8, 10, 5, [H('#3a8a3a'), H('#2f7a30'), H('#46a046')]); for (let k = 0; k < 7; k++) { const x = 4 + p.ri(9), y = 6 + p.ri(8); p.set(x, y, H('#c2185b')); p.set(x + 1, y, H('#e94b85')); } },
  ]);
  crop('pumpkin_plant', [
    sprout,
    p => { for (let x = 2; x < 14; x++) p.set(x, 14 + (x % 3 === 0 ? -1 : 0), GR); blob(p, 5, 12, 2, [GR, GRD]); blob(p, 11, 12, 2, [GR, GRD]); },
    p => { for (let x = 1; x < 15; x++) p.set(x, 15, GR); blob(p, 4, 12, 2, [GR, GRD]); blob(p, 10, 12, 3, [H('#e8862a'), H('#e07d22')]); p.set(10, 9, H('#5b8a2e')); },
  ]);
  crop('melon_plant', [
    sprout,
    p => { for (let x = 2; x < 14; x++) p.set(x, 14 + (x % 3 === 0 ? -1 : 0), GR); blob(p, 5, 12, 2, [GR, GRD]); blob(p, 11, 12, 2, [GR, GRD]); },
    p => { for (let x = 1; x < 15; x++) p.set(x, 15, GR); blob(p, 4, 12, 2, [GR, GRD]); blob(p, 10, 12, 3, [H('#5c9e31'), H('#3e7a1f')]); },
  ]);
  const sapling = (name, trunk, leafPal, shape) => {
    tex(name + '0', p => { stem(p, 8, 10, 15, H(trunk)); blob(p, 8, 9, 2, leafPal); });
    tex(name + '1', p => {
      stem(p, 8, 7, 15, H(trunk)); stem(p, 7, 11, 15, H(trunk));
      if (shape === 'pine') { for (let y = 1; y < 12; y++) { const w = Math.floor((y - 1) / 2) % 3 + Math.floor(y / 4); p.rect(8 - w, y, w * 2 + 1, 1, leafPal[y % leafPal.length]); } }
      else if (shape === 'palm') { for (let k = 0; k < 6; k++) { p.set(8 - k, 5 + Math.floor(k * k / 6), leafPal[0]); p.set(8 + k, 5 + Math.floor(k * k / 6), leafPal[1]); } }
      else blob(p, 8, 5, 4, leafPal);
    });
  };
  sapling('sap_oak', '#7a5532', pal('#3f9b2f', '#358a28', '#4cae38'));
  sapling('sap_birch', '#e8e4d8', pal('#7cbf3f', '#6fae37', '#8bcf4a'));
  sapling('sap_pine', '#5b3f26', pal('#2b6b3a', '#245c31', '#327a43'), 'pine');
  sapling('sap_cherry', '#6b3a3a', pal('#f2a7c3', '#eb93b4', '#ffffff'));
  sapling('sap_palm', '#b08d57', pal('#5cb83a', '#4ea32f'), 'palm');
  crop('mushroom', [
    p => { p.rect(7, 12, 2, 4, H('#e6dcc4')); p.rect(5, 10, 6, 2, H('#c8322b')); p.set(7, 10, H('#ffffff')); },
    p => { p.rect(7, 9, 3, 7, H('#e6dcc4')); p.rect(3, 6, 10, 3, H('#c8322b')); p.rect(4, 5, 8, 1, H('#c8322b')); p.set(5, 6, H('#ffffff')); p.set(9, 7, H('#ffffff')); p.set(11, 6, H('#ffffff')); },
  ]);
  tex('sugarcane', p => {
    for (const x of [3, 8, 12]) for (let y = 0; y < 16; y++) { p.set(x, y, y % 5 === 0 ? H('#5f9a3a') : H('#8fd06a')); p.set(x + 1, y, H('#7fbe5a')); }
    leaf(p, 4, 6, 1, H('#6fae37')); leaf(p, 12, 11, -1, H('#6fae37'));
  });
  tex('bamboo', p => {
    for (let y = 0; y < 16; y++) { const j = y % 6 === 0; p.rect(6, y, 4, 1, j ? H('#4e8a34') : H('#6ab04c')); p.set(7, y, j ? H('#4e8a34') : H('#8fd06a')); }
    leaf(p, 9, 4, 1, H('#5cb83a')); leaf(p, 6, 10, -1, H('#5cb83a'));
  });
  crop('wonder', [
    p => { sprout(p); p.rect(8, 10, 2, 2, H('#d29bff')); },
    p => { stem(p, 8, 7, 15, GRD); leaf(p, 8, 12, -1, GR); leaf(p, 8, 10, 1, GR); blob(p, 8, 5, 2, pal('#b07cff', '#ff7ad9')); },
    p => { stem(p, 8, 7, 15, GRD); leaf(p, 8, 12, -1, GR); leaf(p, 8, 10, 1, GR); blob(p, 8, 5, 3, pal('#b07cff', '#ff7ad9', '#7cd7ff')); p.set(8, 5, H('#ffffff')); [[2, 3], [13, 2], [12, 9]].forEach(([x, y]) => p.set(x, y, H('#fff6a0'))); },
  ]);
  crop('houseseed', [
    p => { sprout(p); p.set(8, 11, H('#c0392b')); },
    p => { stem(p, 8, 9, 15, GRD); leaf(p, 8, 13, -1, GR); p.rect(5, 5, 6, 4, H('#f3efe6')); for (let k = 0; k < 3; k++) p.rect(4 + k, 4 - k, 8 - k * 2, 1, H('#c0392b')); p.rect(7, 7, 2, 2, H('#7a5332')); },
  ]);
  crop('towerseed', [
    p => { sprout(p); p.set(8, 11, H('#3d6ab5')); },
    p => { stem(p, 8, 10, 15, GRD); leaf(p, 8, 13, 1, GR); p.rect(6, 3, 4, 7, H('#8e9296')); p.rect(5, 1, 6, 2, H('#3d6ab5')); p.set(7, 5, H('#ffd36b')); },
  ]);

  // interface icons (same pixel style as the world)
  const INK = H('#f4efe1');
  tex('ui_bag', p => {
    p.rect(4, 2, 8, 2, H('#7a5332')); p.rect(3, 4, 10, 11, H('#b07a42')); p.rect(3, 4, 10, 1, H('#cf9a5e'));
    p.rect(5, 8, 6, 5, H('#8f6233')); p.rect(7, 9, 2, 1, H('#f2c94c')); p.rect(3, 14, 10, 1, H('#6e4829'));
  });
  tex('ui_map', p => {
    p.rect(1, 3, 14, 11, H('#e9d8a6')); p.rect(5, 3, 1, 11, H('#cdb980')); p.rect(10, 3, 1, 11, H('#cdb980'));
    [[3, 11], [4, 10], [6, 9], [8, 9], [9, 8]].forEach(([x, y]) => p.set(x, y, H('#7a5332')));
    p.set(11, 6, H('#d6283a')); p.set(13, 6, H('#d6283a')); p.set(12, 7, H('#d6283a')); p.set(11, 8, H('#d6283a')); p.set(13, 8, H('#d6283a'));
    p.rect(1, 13, 14, 1, H('#b9a46c'));
  });
  tex('ui_menu', p => { for (const y of [3, 7, 11]) p.rect(2, y, 12, 2, INK); });
  tex('ui_sun', p => {
    blob(p, 8, 8, 4, pal('#ffd34d', '#ffcb2f'));
    [[8, 1], [8, 14], [1, 8], [14, 8], [3, 3], [12, 3], [3, 12], [12, 12]].forEach(([x, y]) => p.rect(x, y, 1, 1, H('#ffe58a')));
  });
  tex('ui_moon', p => {
    blob(p, 8, 8, 5, pal('#e9ecf5'));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x - 11) ** 2 + (y - 6) ** 2 < 20) p.clear(x, y);
  });
  tex('ui_rain', p => {
    blob(p, 6, 6, 3, pal('#c9d2de')); blob(p, 10, 6, 3, pal('#c9d2de')); p.rect(3, 7, 10, 2, H('#c9d2de'));
    [[4, 11], [8, 12], [12, 11], [6, 14], [10, 14]].forEach(([x, y]) => p.rect(x, y, 1, 2, H('#7cc4ff')));
  });
  tex('ui_pin', p => {
    blob(p, 8, 6, 4, pal('#e0453a')); p.rect(7, 5, 2, 2, H('#ffffff'));
    for (let y = 10; y < 15; y++) p.rect(8 - Math.max(0, 2 - (y - 10)), y, 1 + Math.max(0, 2 - (y - 10)) * 2, 1, H('#b8332a'));
  });
  tex('ui_pick', p => {
    for (let k = 0; k < 10; k++) p.rect(4 + k, 13 - k, 2, 2, H('#8b5e34'));
    for (let x = 2; x < 13; x++) p.set(x, 3 + Math.round(((x - 7.5) ** 2) / 9), H('#b4bcc4'));
    for (let x = 3; x < 12; x++) p.set(x, 4 + Math.round(((x - 7.5) ** 2) / 9), H('#8e979f'));
  });
  tex('ui_wing', p => {
    for (let r = 0; r < 4; r++) p.rect(3 + r, 4 + r * 2, 10 - r * 2, 2, r % 2 ? H('#dfe7ef') : INK);
    p.rect(11, 3, 2, 8, H('#dfe7ef'));
  });
  tex('ui_wall', p => {
    paintBricks(p, pal('#6a7280', '#5e6672', '#737b88'), H('#3c424b'));
    p.rect(5, 5, 6, 11, H('#f4efe1'), 120);
  });
  tex('ui_dice', p => {
    p.rect(2, 2, 12, 12, INK); p.rect(2, 13, 12, 1, H('#b8b2a3')); p.rect(13, 2, 1, 12, H('#b8b2a3'));
    [[4, 4], [10, 4], [7, 7], [4, 10], [10, 10]].forEach(([x, y]) => p.rect(x, y, 2, 2, H('#2a2622')));
  });
  tex('ui_house', p => {
    p.rect(3, 8, 10, 7, H('#e6d3a8')); p.rect(7, 11, 2, 4, H('#7a5332')); p.rect(4, 9, 2, 2, H('#7cc4ff')); p.rect(10, 9, 2, 2, H('#7cc4ff'));
    for (let k = 0; k < 6; k++) p.rect(1 + k, 8 - k, 14 - k * 2, 1, H('#c0392b'));
  });
  tex('ui_city', p => {
    p.rect(1, 6, 4, 10, H('#7a8a9a')); p.rect(6, 1, 5, 15, H('#9aa8b6')); p.rect(12, 8, 3, 8, H('#6a7a8a'));
    for (let y = 3; y < 15; y += 2) { p.set(7, y, H('#ffd36b')); p.set(9, y, H('#7cc4ff')); }
    for (let y = 8; y < 15; y += 2) { p.set(2, y, H('#ffd36b')); p.set(13, y + 1, H('#ffd36b')); }
  });
  tex('ui_player', p => {
    p.rect(4, 2, 8, 8, H('#f1c27d')); p.rect(4, 2, 8, 2, H('#5a3825')); p.rect(4, 2, 2, 5, H('#5a3825'));
    p.rect(8, 5, 1, 2, H('#1d1d24')); p.rect(10, 5, 1, 2, H('#1d1d24'));
    p.rect(5, 10, 6, 5, H('#2f9e8f')); p.rect(3, 10, 3, 2, H('#d84343'));
  });
  tex('ui_lake', p => {
    p.rect(1, 9, 14, 5, H('#3a8ff0')); p.rect(1, 9, 14, 1, H('#8fd0ff')); p.rect(3, 11, 3, 1, H('#8fd0ff')); p.rect(9, 12, 4, 1, H('#8fd0ff'));
  });
}

// --- extra textures for the 3D world: block tops, items and tools -------------------
function paintRings(p, bark, inner, ring) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    let c = d > 6.6 ? H(bark) : (Math.floor(d) % 3 === 0 ? H(ring) : H(inner));
    p.set(x, y, shadeRgb(c, 0.94 + p.r() * 0.1));
  }
}
function paintTool(p, kind, head, dark) {
  const wood = H('#8b5e34'), wd = H('#5e3d22');
  for (let k = 0; k < 10; k++) { p.set(3 + k, 13 - k, wood); p.set(3 + k, 14 - k, wd); }
  const hc = H(head), hd = H(dark);
  if (kind === 'pick') {
    for (let x = 2; x < 14; x++) { const y = 2 + Math.round(((x - 8) ** 2) / 10); p.set(x, y, hc); p.set(x, y + 1, hd); }
    p.set(9, 4, hc); p.set(10, 4, hd);
  } else if (kind === 'axe') {
    p.rect(9, 2, 4, 5, hc); p.rect(12, 1, 2, 7, hc); p.rect(9, 6, 4, 1, hd); p.rect(13, 2, 1, 5, hd);
  } else if (kind === 'shovel') {
    p.rect(10, 1, 4, 4, hc); p.rect(11, 0, 2, 1, hc); p.rect(10, 4, 4, 1, hd); p.rect(13, 1, 1, 3, hd);
  }
}

function buildTextures3D() {
  tex('grass_top', p => { p.noise(pal('#5fb83a', '#55ab33', '#68c242', '#4ea32f')); p.speck(H('#7fd457'), 10); });
  tex('log_oak_top', p => paintRings(p, '#5a3d22', '#b8945f', '#9a7547'));
  tex('log_birch_top', p => paintRings(p, '#e8e4d8', '#d7c48e', '#bba872'));
  tex('log_pine_top', p => paintRings(p, '#3f2a18', '#8a6239', '#6e4c2b'));
  tex('log_cherry_top', p => paintRings(p, '#4a2626', '#d99a8f', '#b97a70'));
  tex('sandstone_top', p => { p.noise(pal('#e6d49c', '#dfcc92', '#ead9a6')); });
  tex('craft_top', p => {
    paintPlanks(p, '#b8945f');
    p.rect(0, 0, 16, 1, H('#6e4829')); p.rect(0, 15, 16, 1, H('#6e4829')); p.rect(0, 0, 1, 16, H('#6e4829')); p.rect(15, 0, 1, 16, H('#6e4829'));
    for (let k = 1; k < 4; k++) { p.rect(k * 4, 1, 1, 14, H('#7a5332')); p.rect(1, k * 4, 14, 1, H('#7a5332')); }
  });
  tex('craft_side', p => {
    paintPlanks(p, '#9b6b3f');
    p.rect(0, 0, 16, 3, H('#b98a58'));
    p.rect(3, 6, 5, 2, H('#9aa3ab')); p.rect(7, 5, 1, 6, H('#5e3d22'));
    p.rect(10, 6, 4, 2, H('#6f777e')); p.rect(11, 8, 1, 5, H('#5e3d22'));
  });
  tex('pumpkin_top', p => { p.noise(pal('#e8862a', '#e07d22')); p.rect(7, 6, 2, 3, H('#5b8a2e')); });
  tex('cactus_side', p => {
    p.noise(pal('#3e8f3a', '#388533', '#449a3f'));
    for (let y = 0; y < 16; y++) { p.set(4, y, H('#5fb35a')); p.set(11, y, H('#5fb35a')); p.set(0, y, H('#2d6f2a')); p.set(15, y, H('#2d6f2a')); }
    for (let y = 1; y < 16; y += 4) { p.set(2, y, H('#efe9bd')); p.set(13, y + 2, H('#efe9bd')); p.set(7, y + 1, H('#efe9bd')); }
  });
  tex('cactus_top', p => { p.noise(pal('#4ea34a', '#449a3f')); p.rect(0, 0, 16, 1, H('#2d6f2a')); p.rect(0, 15, 16, 1, H('#2d6f2a')); p.rect(0, 0, 1, 16, H('#2d6f2a')); p.rect(15, 0, 1, 16, H('#2d6f2a')); });
  tex('hay_top', p => { p.noise(pal('#d9b44a', '#c9a23c', '#ecc964')); p.rect(7, 0, 2, 16, H('#a8452f')); });
  tex('chest_side', p => {
    paintPlanks(p, '#9b6b3f');
    p.rect(0, 0, 16, 1, H('#5e3d22')); p.rect(0, 15, 16, 1, H('#5e3d22')); p.rect(0, 0, 1, 16, H('#5e3d22')); p.rect(15, 0, 1, 16, H('#5e3d22'));
    p.rect(0, 5, 16, 1, H('#5e3d22')); p.rect(7, 4, 2, 4, H('#d8c35a'));
  });
  tex('chest_top', p => { paintPlanks(p, '#a77a48'); p.rect(0, 0, 16, 1, H('#5e3d22')); p.rect(0, 15, 16, 1, H('#5e3d22')); });
  tex('bed_top', p => { p.fill(H('#c0392b')); p.rect(0, 0, 16, 5, H('#f1ede4')); p.rect(0, 5, 16, 1, H('#e05a48')); for (let x = 0; x < 16; x += 4) p.rect(x, 9, 2, 1, H('#a93226')); });
  tex('bed_side', p => { p.fill(H('#c0392b')); p.rect(0, 9, 16, 7, H('#7a5332')); p.rect(0, 0, 4, 9, H('#f1ede4')); });
  tex('boom_top', p => { p.noise(pal('#d43c2c', '#c93527')); p.rect(6, 6, 4, 4, H('#2a2a2a')); p.rect(7, 4, 2, 2, H('#8a8a8a')); });
  tex('water', p => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, shadeRgb(H('#2f78d6'), 0.92 + p.r() * 0.12), 175);
    for (let k = 0; k < 5; k++) { const y = p.ri(16), x = p.ri(12); p.rect(x, y, 4, 1, H('#8fc7ff'), 190); }
  });
  tex('conveyor', p => {
    p.fill(H('#2d3440'));
    p.rect(0, 0, 1, 16, H('#ffcf3a')); p.rect(15, 0, 1, 16, H('#ffcf3a'));
    for (const oy of [1, 9]) for (let k = 0; k < 5; k++) { p.set(3 + k, oy + 4 - k, H('#ffcf3a')); p.set(12 - k, oy + 4 - k, H('#ffcf3a')); p.set(3 + k, oy + 5 - k, H('#ff9f1a')); p.set(12 - k, oy + 5 - k, H('#ff9f1a')); }
  });
  tex('check_pad', p => {
    p.fill(H('#1f6f8b')); p.rect(1, 1, 14, 14, H('#33b5d6')); p.rect(3, 3, 10, 10, H('#7ee7ff'));
    p.rect(6, 6, 4, 4, H('#ffffff'));
  });
  tex('finish_pad', p => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, ((x >> 2) + (y >> 2)) % 2 ? H('#111111') : H('#f4f4f4')); });
  tex('gate', p => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, H('#ff5d8f'), 120);
    p.rect(0, 0, 16, 2, H('#ffffff'), 220); p.rect(0, 14, 16, 2, H('#ffffff'), 220);
    for (let k = 0; k < 16; k += 4) p.rect(k, 2, 2, 12, H('#ffd0e0'), 170);
  });
  tex('snow_layer', p => p.noise(pal('#f4f8ff', '#e9f1fb', '#ffffff')));

  // materials and food
  tex('stick', p => { for (let k = 0; k < 11; k++) { p.set(3 + k, 13 - k, H('#8b5e34')); p.set(4 + k, 13 - k, H('#5e3d22')); } });
  tex('coal', p => { blob(p, 8, 9, 4, pal('#2b2b2e', '#3a3a40', '#1f1f22')); p.set(6, 7, H('#5a5a64')); });
  tex('iron_ingot', p => { for (let y = 6; y < 11; y++) p.rect(3 + (10 - y) * 0, y, 11, 1, y === 6 ? H('#f2f4f6') : H('#c9ced3')); p.rect(3, 10, 11, 1, H('#8e979f')); p.rect(4, 7, 3, 1, H('#ffffff')); });
  tex('gold_ingot', p => { for (let y = 6; y < 11; y++) p.rect(3, y, 11, 1, y === 6 ? H('#fff1a8') : H('#f2c94c')); p.rect(3, 10, 11, 1, H('#c9962a')); p.rect(4, 7, 3, 1, H('#ffffff')); });
  tex('gem', p => {
    for (let y = 3; y < 13; y++) { const w = y < 7 ? y - 2 : 13 - y; for (let x = 8 - w; x <= 7 + w; x++) p.set(x, y, x < 8 ? H('#7ff0e5') : H('#36c2b6')); }
    p.set(6, 5, H('#ffffff'));
  });
  tex('wheat_item', p => { for (const x of [5, 8, 11]) { stem(p, x, 6, 15, H('#c9a23c')); p.rect(x - 1, 2, 2, 5, H('#e8c45a')); } });
  tex('seeds', p => { [[5, 9], [8, 7], [10, 10], [7, 11], [11, 6], [4, 6]].forEach(([x, y]) => { p.rect(x, y, 2, 2, H('#8fb04a')); p.set(x, y, H('#c4dc7a')); }); });
  tex('apple', p => { blob(p, 8, 9, 5, pal('#d6283a', '#c21f30')); p.rect(8, 2, 1, 3, H('#5e3d22')); p.rect(9, 3, 3, 2, H('#4fa52f')); p.rect(5, 7, 2, 2, H('#ff8a8a')); });
  tex('bread', p => { for (let y = 6; y < 12; y++) p.rect(2 + Math.abs(9 - y) * 0, y, 12, 1, y === 6 ? H('#e8b56a') : H('#c98a3c')); p.rect(3, 5, 10, 1, H('#d9a058')); [4, 8, 12].forEach(x => p.set(x, 7, H('#a46a2a'))); });
  tex('bucket', p => {
    for (let y = 5; y < 15; y++) { const inset = Math.floor((y - 5) / 4); p.rect(3 + inset, y, 10 - inset * 2, 1, H('#9aa3ab')); }
    p.rect(4, 5, 8, 2, H('#3a3f45')); p.rect(3, 4, 10, 1, H('#6f777e'));
    p.set(3, 2, H('#6f777e')); p.set(4, 1, H('#6f777e')); p.rect(5, 0, 6, 1, H('#6f777e')); p.set(11, 1, H('#6f777e')); p.set(12, 2, H('#6f777e'));
  });
  const MATS = { wood: ['#a77a48', '#7a5332'], stone: ['#9aa0a6', '#62676c'], iron: ['#e3e7eb', '#a3abb3'], gem: ['#56e6d8', '#2fa89d'] };
  for (const [m, [a, b]] of Object.entries(MATS)) for (const k of ['pick', 'axe', 'shovel']) tex(`${k}_${m}`, p => paintTool(p, k, a, b));

  // hud
  const heart = (p, fill, half) => {
    const shape = ['..XX..XX..', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXXXXXXXXX', '.XXXXXXXX.', '..XXXXXX..', '...XXXX...', '....XX....'];
    shape.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== 'X') return;
      const inside = fill && (!half || x < 5);
      p.set(x + 3, y + 4, inside ? (y < 2 && x > 1 && x < 4 ? H('#ff9a9a') : H('#e8333d')) : H('#3a1f24'));
    }));
  };
  tex('ui_heart', p => heart(p, true, false));
  tex('ui_heart_half', p => heart(p, true, true));
  tex('ui_heart_empty', p => heart(p, false, false));
  tex('ui_bubble', p => { blob(p, 8, 8, 4, pal('#8fd0ff')); p.rect(6, 6, 2, 2, H('#ffffff')); });
  tex('ui_crown', p => {
    p.rect(2, 7, 12, 6, H('#f2c94c')); p.rect(2, 12, 12, 1, H('#c9962a'));
    [[2, 3], [7, 2], [12, 3]].forEach(([x, y]) => p.rect(x, y, 2, 5, H('#f2c94c')));
    p.set(8, 9, H('#d6283a')); p.set(4, 9, H('#36c2b6')); p.set(11, 9, H('#36c2b6'));
  });
  tex('ui_hammer', p => { for (let k = 0; k < 9; k++) p.rect(3 + k, 13 - k, 2, 1, H('#8b5e34')); p.rect(8, 1, 6, 4, H('#9aa3ab')); p.rect(8, 4, 6, 1, H('#6f777e')); });
  tex('ui_mine', p => paintTool(p, 'pick', '#cfd5da', '#8e979f'));
  tex('ui_jump', p => { for (let k = 0; k < 6; k++) p.rect(8 - k, 3 + k, 1 + k * 2 - 1 + 1, 1, H('#f4efe1')); p.rect(6, 9, 4, 5, H('#f4efe1')); });
  tex('ui_camera', p => { p.rect(2, 5, 12, 8, H('#cfd5da')); p.rect(5, 3, 4, 2, H('#cfd5da')); blob(p, 8, 9, 2, pal('#2a2622')); });
}

// --- block & item registry -------------------------------------------------------
// Faces: 0 +x, 1 -x, 2 +y (top), 3 -y (bottom), 4 +z, 5 -z
const BLOCKS = [];
const B = {};
const CATEGORIES = [
  { id: 'all', name: 'All' }, { id: 'build', name: 'Building' }, { id: 'nature', name: 'Nature' },
  { id: 'plants', name: 'Plants' }, { id: 'home', name: 'Home' }, { id: 'light', name: 'Lights' },
  { id: 'color', name: 'Colors' }, { id: 'fun', name: 'Water & Parkour' }, { id: 'items', name: 'Tools & Items' },
];

function def(key, name, p = {}) {
  const d = Object.assign({
    id: BLOCKS.length, key, name, cat: 'build', solid: true, opaque: true, shape: 'cube',
    light: 0, hardness: 1, tool: null, tier: 0, drop: key, sound: 'stone', stack: 64,
  }, p);
  if (typeof d.tex === 'string' || !d.tex) d.tex = { all: d.tex || key };
  BLOCKS.push(d); B[key] = d.id;
  return d;
}
const plantDef = (key, name, p = {}) => def(key, name, Object.assign({
  cat: 'plants', solid: false, opaque: false, shape: 'cross', hardness: 0, sound: 'plant', plant: true,
}, p));
const itemDef = (key, name, p = {}) => def(key, name, Object.assign({
  cat: 'items', solid: false, opaque: false, shape: 'none', item: true, hardness: 0,
}, p));

function defineBlocks() {
  def('air', 'Air', { solid: false, opaque: false, shape: 'none', cat: 'hidden', tex: 'dirt', drop: null });
  // nature
  const dirtish = { cat: 'nature', sound: 'dirt', hardness: 0.55, tool: 'shovel' };
  def('grass', 'Grass Block', Object.assign({}, dirtish, { tex: { top: 'grass_top', side: 'grass', bottom: 'dirt' }, drop: 'dirt', hardness: 0.6, soil: true }));
  def('dirt', 'Dirt', Object.assign({}, dirtish, { soil: true }));
  def('farmland', 'Farmland', Object.assign({}, dirtish, { tex: { top: 'farmland', side: 'dirt', bottom: 'dirt' }, soil: true, drop: 'dirt' }));
  def('sand', 'Sand', Object.assign({}, dirtish, { sound: 'sand', sandy: true }));
  def('gravel', 'Gravel', Object.assign({}, dirtish, { sound: 'sand' }));
  def('clay', 'Clay', Object.assign({}, dirtish));
  def('path', 'Dirt Path', Object.assign({}, dirtish, { tex: { top: 'path', side: 'dirt', bottom: 'dirt' }, drop: 'dirt', soil: true }));
  def('snowgrass', 'Snowy Grass', Object.assign({}, dirtish, { tex: { top: 'snow', side: 'snowgrass', bottom: 'dirt' }, drop: 'dirt', soil: true, sound: 'snow' }));
  def('snow', 'Snow', Object.assign({}, dirtish, { sound: 'snow', hardness: 0.4 }));
  const rock = { cat: 'nature', tool: 'pick', tier: 1, hardness: 1.2 };
  def('stone', 'Stone', Object.assign({}, rock, { drop: 'cobble' }));
  def('cobble', 'Cobblestone', Object.assign({}, rock, { cat: 'build', hardness: 1.4 }));
  def('sandstone', 'Sandstone', Object.assign({}, rock, { cat: 'build', tex: { top: 'sandstone_top', side: 'sandstone', bottom: 'sandstone_top' }, hardness: 0.9 }));
  def('ice', 'Ice', { cat: 'nature', opaque: false, sound: 'glass', hardness: 0.4, slip: true, drop: null });
  def('bedrock', 'Bedrock', { cat: 'hidden', hardness: Infinity, drop: null });
  def('darkstone', 'Deep Stone', Object.assign({}, rock, { hardness: 1.6 }));
  def('basalt', 'Basalt', Object.assign({}, rock));
  def('coal_ore', 'Coal Ore', Object.assign({}, rock, { hardness: 1.5, drop: 'coal' }));
  def('iron_ore', 'Iron Ore', Object.assign({}, rock, { hardness: 1.8, tier: 2 }));
  def('gold_ore', 'Gold Ore', Object.assign({}, rock, { hardness: 1.8, tier: 3 }));
  def('gem_ore', 'Gem Ore', Object.assign({}, rock, { hardness: 2, tier: 3, drop: 'gem' }));
  const wood = { cat: 'nature', tool: 'axe', hardness: 1, sound: 'wood' };
  for (const t of ['oak', 'birch', 'pine', 'cherry']) {
    const n = t[0].toUpperCase() + t.slice(1);
    def('log_' + t, n + ' Log', Object.assign({}, wood, { tex: { top: 'log_' + t + '_top', side: 'log_' + t, bottom: 'log_' + t + '_top' } }));
  }
  for (const t of ['oak', 'birch', 'pine', 'cherry']) {
    const n = t[0].toUpperCase() + t.slice(1);
    def('leaves_' + t, n + ' Leaves', { cat: 'nature', opaque: false, leaves: true, hardness: 0.2, sound: 'plant', drop: null, sapling: 'sapling_' + t });
  }
  def('leaves_rainbow', 'Rainbow Leaves', { cat: 'nature', opaque: false, leaves: true, hardness: 0.2, sound: 'plant' });
  def('cactus', 'Cactus', { cat: 'nature', tex: { top: 'cactus_top', side: 'cactus_side', bottom: 'cactus_top' }, hardness: 0.4, sound: 'cloth', hurt: 1 });
  def('mushroom_cap', 'Mushroom Cap', { cat: 'nature', hardness: 0.3, sound: 'cloth', tool: 'axe' });
  def('mushroom_stem', 'Mushroom Stem', { cat: 'nature', hardness: 0.3, sound: 'cloth', tool: 'axe' });
  def('crystal', 'Crystal', { cat: 'light', opaque: false, shape: 'cross', solid: false, light: 11, hardness: 0.6, tool: 'pick', sound: 'glass' });
  def('water', 'Water', { cat: 'fun', solid: false, opaque: false, shape: 'liquid', liquid: true, hardness: Infinity, drop: null, sound: 'water' });
  def('lava', 'Lava', { cat: 'fun', solid: false, opaque: true, shape: 'cube', tex: 'lava0', liquid: true, light: 14, hurt: 4, hardness: Infinity, drop: null, sound: 'water' });

  // building
  const plank = { hardness: 0.9, tool: 'axe', sound: 'wood' };
  for (const t of ['oak', 'birch', 'pine', 'cherry', 'dark']) def('planks_' + t, t[0].toUpperCase() + t.slice(1) + ' Planks', Object.assign({}, plank, { group: 'planks' }));
  const brick = { tool: 'pick', tier: 1, hardness: 1.3 };
  def('bricks', 'Bricks', brick);
  def('stonebricks', 'Stone Bricks', brick);
  def('sandbricks', 'Sand Bricks', brick);
  def('glass', 'Glass', { opaque: false, sound: 'glass', hardness: 0.3, drop: null });
  def('window', 'Wood Window', { opaque: false, sound: 'glass', hardness: 0.3 });
  def('cityglass', 'Blue Glass', { opaque: false, sound: 'glass', hardness: 0.3 });
  def('litwindow', 'Lit Window', { cat: 'light', opaque: false, light: 11, sound: 'glass', hardness: 0.3 });
  for (const [k, n] of [['roof_red', 'Red Roof'], ['roof_blue', 'Blue Roof'], ['roof_green', 'Green Roof'], ['roof_dark', 'Slate Roof']]) def(k, n, brick);
  def('plaster', 'White Plaster', { hardness: 0.8, tool: 'pick' });
  def('concrete_gray', 'Gray Concrete', Object.assign({ cat: 'color' }, brick));
  def('concrete_white', 'White Concrete', Object.assign({ cat: 'color' }, brick));
  def('concrete_dark', 'Dark Concrete', Object.assign({ cat: 'color' }, brick));
  def('asphalt', 'Asphalt', brick);
  def('road', 'Road', Object.assign({ tex: { top: 'road', side: 'asphalt', bottom: 'asphalt' } }, brick));
  def('metal', 'Metal', { tool: 'pick', tier: 1, hardness: 1.6, sound: 'metal' });
  def('gold_block', 'Gold Block', { tool: 'pick', tier: 2, hardness: 1.6, sound: 'metal' });
  def('gem_block', 'Gem Block', { tool: 'pick', tier: 2, hardness: 1.6, sound: 'glass' });
  def('hay', 'Hay Bale', { tex: { top: 'hay_top', side: 'hay', bottom: 'hay_top' }, hardness: 0.4, sound: 'plant' });
  def('pumpkin', 'Pumpkin', { cat: 'plants', tex: { top: 'pumpkin_top', side: 'pumpkin', bottom: 'pumpkin_top' }, hardness: 0.6, tool: 'axe', sound: 'plant' });
  def('melon', 'Melon', { cat: 'plants', hardness: 0.6, tool: 'axe', sound: 'plant' });
  for (const [k, n] of [['white', 'White'], ['red', 'Red'], ['orange', 'Orange'], ['yellow', 'Yellow'], ['green', 'Green'], ['blue', 'Blue'], ['purple', 'Purple'], ['pink', 'Pink'], ['black', 'Black']]) {
    def('cloth_' + k, n + ' Cloth', { cat: 'color', hardness: 0.4, sound: 'cloth' });
  }

  // home
  def('workbench', 'Workbench', { cat: 'home', tex: { top: 'craft_top', side: 'craft_side', bottom: 'planks_oak' }, hardness: 1, tool: 'axe', sound: 'wood' });
  def('bookshelf', 'Bookshelf', { cat: 'home', tex: { top: 'planks_oak', side: 'bookshelf', bottom: 'planks_oak' }, hardness: 0.8, tool: 'axe', sound: 'wood' });
  def('chest', 'Chest', { cat: 'home', shape: 'box', box: [1, 0, 1, 15, 14, 15], opaque: false, tex: { top: 'chest_top', side: 'chest_side', bottom: 'chest_top' }, hardness: 1, tool: 'axe', sound: 'wood' });
  def('bed', 'Bed', { cat: 'home', shape: 'box', box: [0, 0, 0, 16, 9, 16], opaque: false, tex: { top: 'bed_top', side: 'bed_side', bottom: 'planks_oak' }, hardness: 0.5, sound: 'cloth', bed: true });
  def('door', 'Door', { cat: 'home', shape: 'panel', solid: false, opaque: false, tex: 'door_b', icon: 'icon_door', hardness: 0.8, tool: 'axe', sound: 'wood', door: 'bottom' });
  def('door_top', 'Door', { cat: 'hidden', shape: 'panel', solid: false, opaque: false, tex: 'door_t', hardness: 0.8, tool: 'axe', sound: 'wood', door: 'top', drop: 'door' });
  def('ladder', 'Ladder', { cat: 'home', solid: false, opaque: false, climb: true, shape: 'panel', hardness: 0.4, tool: 'axe', sound: 'wood' });
  def('fence', 'Fence', { cat: 'home', shape: 'box', box: [6, 0, 6, 10, 16, 10], opaque: false, hardness: 0.8, tool: 'axe', sound: 'wood' });
  def('flowerpot', 'Flower Pot', { cat: 'home', shape: 'cross', solid: false, opaque: false, hardness: 0.1, sound: 'stone' });

  // lights
  def('torch', 'Torch', { cat: 'light', shape: 'box', box: [7, 0, 7, 9, 10, 9], solid: false, opaque: false, light: 14, hardness: 0, sound: 'wood', torch: true });
  def('lantern', 'Lantern', { cat: 'light', shape: 'box', box: [4, 0, 4, 12, 13, 12], solid: false, opaque: false, light: 15, hardness: 0.4, sound: 'metal' });
  def('glowblock', 'Glow Block', { cat: 'light', light: 15, hardness: 0.4, sound: 'glass' });
  def('neon_pink', 'Pink Neon', { cat: 'light', light: 12, hardness: 0.4, sound: 'glass' });
  def('neon_cyan', 'Cyan Neon', { cat: 'light', light: 12, hardness: 0.4, sound: 'glass' });
  def('streetlamp', 'Street Lamp', { cat: 'light', light: 15, hardness: 0.6, sound: 'metal', tex: { top: 'metal', side: 'glowblock', bottom: 'glowblock' } });

  // plants & seeds
  for (const [k, n] of [['tallgrass', 'Tall Grass'], ['deadbush', 'Dry Bush']]) plantDef(k, n, { cat: 'nature', drop: null, replaceable: true });
  for (const [k, n] of [['rose', 'Rose'], ['tulip', 'Tulip'], ['daisy', 'Daisy'], ['bluebell', 'Bluebell'], ['sunflower', 'Sunflower']]) plantDef(k, n, { tex: k + '2', flower: true });
  plantDef('mushroom', 'Mushroom', { tex: 'mushroom1', soil: 'any', grow: { time: 40, into: 'mushroom' } });
  plantDef('wheat', 'Wheat', { tex: 'wheat3', stages: ['wheat0', 'wheat1', 'wheat2', 'wheat3'], grow: { time: 25 }, drop: null, crop: true, cat: 'hidden' });
  for (const [k, n] of [['oak', 'Oak'], ['birch', 'Birch'], ['pine', 'Pine'], ['cherry', 'Cherry']]) plantDef('sapling_' + k, n + ' Sapling', { tex: 'sap_' + k + '1', grow: { time: 45, into: k } });
  plantDef('houseseed', 'House Seed', { tex: 'houseseed1', icon: 'icon_house_seed', grow: { time: 8, into: 'house' } });
  plantDef('wonderseed', 'Wonder Seed', { tex: 'wonder2', icon: 'icon_wonder', light: 6, grow: { time: 8, into: 'wonder' } });

  // water & parkour
  def('bounce', 'Bounce Pad', { cat: 'fun', bounce: true, opaque: false, hardness: 0.4, sound: 'cloth' });
  def('conveyor', 'Conveyor', { cat: 'fun', conveyor: true, tex: { top: 'conveyor', side: 'metal', bottom: 'metal' }, hardness: 0.6, sound: 'metal' });
  def('crumble', 'Crumble Block', { cat: 'fun', crumble: true, hardness: 0.3, sound: 'sand' });
  def('check_pad', 'Checkpoint Pad', { cat: 'fun', light: 8, hardness: 0.5, sound: 'metal' });
  def('finish_pad', 'Finish Pad', { cat: 'fun', finish: true, hardness: 0.5, sound: 'metal' });
  def('gate', 'Start Gate', { cat: 'hidden', opaque: false, hardness: Infinity, sound: 'glass', drop: null });
  def('boom', 'Boom Block', { cat: 'fun', boom: true, tex: { top: 'boom_top', side: 'boom', bottom: 'boom_top' }, hardness: 0.3, sound: 'cloth' });
  def('sponge', 'Sponge', { cat: 'fun', sponge: true, hardness: 0.4, sound: 'cloth' });

  // items
  itemDef('stick', 'Stick');
  itemDef('coal', 'Coal');
  itemDef('iron_ingot', 'Iron Ingot');
  itemDef('gold_ingot', 'Gold Ingot');
  itemDef('gem', 'Gem');
  itemDef('wheat_item', 'Wheat');
  itemDef('seeds', 'Wheat Seeds', { places: 'wheat', cat: 'plants' });
  itemDef('apple', 'Apple', { food: 4 });
  itemDef('bread', 'Bread', { food: 7 });
  itemDef('bucket', 'Bucket', { stack: 16, bucket: 'empty' });
  itemDef('water_bucket', 'Water Bucket', { tex: 'icon_bucket', stack: 1, bucket: 'water', cat: 'fun' });
  itemDef('fertilizer', 'Fertilizer', { tex: 'icon_fertilizer', cat: 'plants' });
  const tiers = [['wood', 'Wooden', 1, 2], ['stone', 'Stone', 2, 3.2], ['iron', 'Iron', 3, 4.5], ['gem', 'Gem', 4, 6.5]];
  for (const [m, n, tier, speed] of tiers) {
    itemDef(`pick_${m}`, `${n} Pickaxe`, { stack: 1, toolKind: 'pick', toolTier: tier, toolSpeed: speed });
    itemDef(`axe_${m}`, `${n} Axe`, { stack: 1, toolKind: 'axe', toolTier: tier, toolSpeed: speed });
    itemDef(`shovel_${m}`, `${n} Shovel`, { stack: 1, toolKind: 'shovel', toolTier: tier, toolSpeed: speed });
  }
}

// Recipes: "in" uses item keys or groups (planks, log).
const GROUPS = {
  planks: ['planks_oak', 'planks_birch', 'planks_pine', 'planks_cherry', 'planks_dark'],
  log: ['log_oak', 'log_birch', 'log_pine', 'log_cherry'],
};
const RECIPES = [
  { out: ['planks_oak', 4], in: [['log_oak', 1]], cat: 'Basics' },
  { out: ['planks_birch', 4], in: [['log_birch', 1]], cat: 'Basics' },
  { out: ['planks_pine', 4], in: [['log_pine', 1]], cat: 'Basics' },
  { out: ['planks_cherry', 4], in: [['log_cherry', 1]], cat: 'Basics' },
  { out: ['stick', 4], in: [['planks', 2]], cat: 'Basics' },
  { out: ['torch', 4], in: [['coal', 1], ['stick', 1]], cat: 'Basics' },
  { out: ['pick_wood', 1], in: [['planks', 3], ['stick', 2]], cat: 'Tools' },
  { out: ['axe_wood', 1], in: [['planks', 3], ['stick', 2]], cat: 'Tools' },
  { out: ['shovel_wood', 1], in: [['planks', 1], ['stick', 2]], cat: 'Tools' },
  { out: ['pick_stone', 1], in: [['cobble', 3], ['stick', 2]], cat: 'Tools' },
  { out: ['axe_stone', 1], in: [['cobble', 3], ['stick', 2]], cat: 'Tools' },
  { out: ['shovel_stone', 1], in: [['cobble', 1], ['stick', 2]], cat: 'Tools' },
  { out: ['pick_iron', 1], in: [['iron_ingot', 3], ['stick', 2]], cat: 'Tools' },
  { out: ['axe_iron', 1], in: [['iron_ingot', 3], ['stick', 2]], cat: 'Tools' },
  { out: ['shovel_iron', 1], in: [['iron_ingot', 1], ['stick', 2]], cat: 'Tools' },
  { out: ['pick_gem', 1], in: [['gem', 3], ['stick', 2]], cat: 'Tools' },
  { out: ['axe_gem', 1], in: [['gem', 3], ['stick', 2]], cat: 'Tools' },
  { out: ['shovel_gem', 1], in: [['gem', 1], ['stick', 2]], cat: 'Tools' },
  { out: ['bucket', 1], in: [['iron_ingot', 3]], cat: 'Tools' },
  { out: ['iron_ingot', 1], in: [['iron_ore', 1], ['coal', 1]], cat: 'Smelt' },
  { out: ['gold_ingot', 1], in: [['gold_ore', 1], ['coal', 1]], cat: 'Smelt' },
  { out: ['glass', 2], in: [['sand', 2], ['coal', 1]], cat: 'Smelt' },
  { out: ['stone', 4], in: [['cobble', 4], ['coal', 1]], cat: 'Smelt' },
  { out: ['bricks', 4], in: [['clay', 4], ['coal', 1]], cat: 'Smelt' },
  { out: ['bread', 1], in: [['wheat_item', 3]], cat: 'Food & Farm' },
  { out: ['fertilizer', 4], in: [['wheat_item', 1], ['dirt', 1]], cat: 'Food & Farm' },
  { out: ['cloth_white', 1], in: [['wheat_item', 4]], cat: 'Food & Farm' },
  { out: ['hay', 1], in: [['wheat_item', 6]], cat: 'Food & Farm' },
  { out: ['stonebricks', 4], in: [['stone', 4]], cat: 'Building' },
  { out: ['sandstone', 1], in: [['sand', 4]], cat: 'Building' },
  { out: ['sandbricks', 4], in: [['sandstone', 4]], cat: 'Building' },
  { out: ['window', 2], in: [['glass', 2], ['stick', 1]], cat: 'Building' },
  { out: ['roof_red', 4], in: [['bricks', 2], ['rose', 1]], cat: 'Building' },
  { out: ['roof_blue', 4], in: [['bricks', 2], ['bluebell', 1]], cat: 'Building' },
  { out: ['roof_dark', 4], in: [['cobble', 4]], cat: 'Building' },
  { out: ['plaster', 4], in: [['sand', 2], ['clay', 2]], cat: 'Building' },
  { out: ['metal', 1], in: [['iron_ingot', 4]], cat: 'Building' },
  { out: ['gold_block', 1], in: [['gold_ingot', 4]], cat: 'Building' },
  { out: ['gem_block', 1], in: [['gem', 4]], cat: 'Building' },
  { out: ['door', 1], in: [['planks', 6]], cat: 'Home' },
  { out: ['ladder', 3], in: [['stick', 7]], cat: 'Home' },
  { out: ['fence', 3], in: [['planks', 2], ['stick', 4]], cat: 'Home' },
  { out: ['workbench', 1], in: [['planks', 4]], cat: 'Home' },
  { out: ['chest', 1], in: [['planks', 8]], cat: 'Home' },
  { out: ['bookshelf', 1], in: [['planks', 6], ['wheat_item', 3]], cat: 'Home' },
  { out: ['bed', 1], in: [['cloth_white', 3], ['planks', 3]], cat: 'Home' },
  { out: ['lantern', 1], in: [['iron_ingot', 1], ['torch', 1]], cat: 'Home' },
  { out: ['glowblock', 1], in: [['glass', 1], ['torch', 2]], cat: 'Home' },
  { out: ['cloth_red', 1], in: [['cloth_white', 1], ['rose', 1]], cat: 'Colors' },
  { out: ['cloth_orange', 1], in: [['cloth_white', 1], ['tulip', 1]], cat: 'Colors' },
  { out: ['cloth_yellow', 1], in: [['cloth_white', 1], ['sunflower', 1]], cat: 'Colors' },
  { out: ['cloth_blue', 1], in: [['cloth_white', 1], ['bluebell', 1]], cat: 'Colors' },
  { out: ['cloth_green', 1], in: [['cloth_white', 1], ['cactus', 1]], cat: 'Colors' },
  { out: ['cloth_black', 1], in: [['cloth_white', 1], ['coal', 1]], cat: 'Colors' },
  { out: ['cloth_pink', 2], in: [['cloth_white', 1], ['cloth_red', 1]], cat: 'Colors' },
  { out: ['cloth_purple', 2], in: [['cloth_red', 1], ['cloth_blue', 1]], cat: 'Colors' },
  { out: ['houseseed', 1], in: [['planks', 16], ['glass', 4], ['door', 1]], cat: 'Magic' },
  { out: ['wonderseed', 1], in: [['gem', 1], ['seeds', 1]], cat: 'Magic' },
  { out: ['boom', 1], in: [['coal', 4], ['sand', 4]], cat: 'Magic' },
];

function buildAtlas() {
  const n = TEX.list.length;
  const rows = Math.ceil(n / TEX.cols);
  const c = document.createElement('canvas');
  c.width = TEX.cols * TS; c.height = Math.max(1, rows) * TS;
  const g = c.getContext('2d');
  TEX.list.forEach((t, i) => g.putImageData(new ImageData(t.data, TS, TS), (i % TEX.cols) * TS, Math.floor(i / TEX.cols) * TS));
  TEX.atlas = c;
  TEX.rows = rows;
}
function texIndex(name) {
  const i = TEX.index[name];
  if (i === undefined) throw new Error('Missing texture ' + name);
  return i;
}
function makeIconURL(name) {
  if (TEX.icons[name]) return TEX.icons[name];
  const c = document.createElement('canvas');
  c.width = TS; c.height = TS;
  c.getContext('2d').putImageData(new ImageData(TEX.list[texIndex(name)].data, TS, TS), 0, 0);
  TEX.icons[name] = c.toDataURL();
  return TEX.icons[name];
}
function itemIcon(id) { return makeIconURL(BLOCKS[id].icon); }

function initBlocks() {
  buildTextures();
  buildTextures3D();
  defineBlocks();
  buildAtlas();
  for (const d of BLOCKS) {
    const t = d.tex;
    const side = t.side || t.all, top = t.top || t.all, bottom = t.bottom || t.all;
    d.faces = [side, side, top, bottom, side, side].map(texIndex);
    if (d.stages) d.stageTi = d.stages.map(texIndex);
    if (!d.icon) d.icon = d.shape === 'cube' || d.shape === 'box' ? (t.side || t.all) : (t.all || t.side);
    if (d.key === 'grass') d.icon = 'grass';
    if (d.key === 'water') d.icon = 'icon_bucket';
    d.iconTi = texIndex(d.icon);
    const data = TEX.list[d.faces[2]].data;
    let r = 0, g = 0, b = 0, k = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 100) { r += data[i]; g += data[i + 1]; b += data[i + 2]; k++; }
    d.color = k ? [r / k / 255, g / k / 255, b / k / 255] : [0.5, 0.5, 0.5];
  }
  // resolve drops and recipes to ids
  for (const d of BLOCKS) d.dropId = d.drop ? B[d.drop] : -1;
  for (const r of RECIPES) {
    r.outId = B[r.out[0]]; r.outN = r.out[1];
    r.ins = r.in.map(([k, n]) => ({ ids: GROUPS[k] ? GROUPS[k].map(g => B[g]) : [B[k]], n, label: GROUPS[k] ? 'Any planks' : BLOCKS[B[k]].name, key: k }));
    if (r.outId === undefined || r.ins.some(i => i.ids.some(x => x === undefined))) throw new Error('Bad recipe ' + r.out[0]);
  }
}

const isPlaceable = d => !d.item || !!d.places || !!d.bucket;
function pickableItems() { return BLOCKS.filter(d => d.cat !== 'hidden' && d.id !== 0); }
function isSoil(id, kind) {
  const d = BLOCKS[id];
  if (!d) return false;
  if (kind === 'any') return d.solid && d.opaque;
  return !!d.soil;
}
