'use strict';
// ---------------------------------------------------------------------------
// Renderer: sky, parallax scenery, blocks, water, entities, smooth lighting,
// glow, weather and in-world overlays.
// ---------------------------------------------------------------------------

const SKY = {
  nightTop: hexRgb('#060a1c'), nightBot: hexRgb('#1a2246'),
  dayTop: hexRgb('#4a96e4'), dayBot: hexRgb('#c3e5ff'),
  duskTop: hexRgb('#46508f'), duskBot: hexRgb('#ff9a62'),
  rain: hexRgb('#6c7584'),
};

function makeGlowSprite(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(${color},0.9)`);
  grd.addColorStop(0.35, `rgba(${color},0.35)`);
  grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return c;
}

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d');
    this.lightImg = null;
    this.glowSprites = {
      warm: makeGlowSprite('255,190,110'), cyan: makeGlowSprite('110,240,255'), pink: makeGlowSprite('255,110,220'),
      red: makeGlowSprite('255,70,60'), violet: makeGlowSprite('190,130,255'), lava: makeGlowSprite('255,120,40'),
      cone: makeGlowSprite('255,240,190'),
    };
    this.glows = [];
    this.stars = [];
    for (let i = 0; i < 160; i++) this.stars.push({ x: Math.random(), y: Math.random() * 0.75, s: Math.random() < 0.15 ? 2 : 1, p: Math.random() * TAU });
    this.clouds = [];
    for (let i = 0; i < 26; i++) this.clouds.push(this.newCloud(Math.random() * 4000));
    this.rain = [];
    this.lightBuf = { sky: null, blk: null, att: null, n: 0 };
    this.visibleEmitters = [];
    this.night = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  newCloud(x) {
    const puffs = [];
    const n = 3 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) puffs.push({ dx: k * (0.6 + Math.random() * 0.5), dy: (Math.random() - 0.5) * 0.4, w: 1 + Math.random() * 1.2, h: 0.5 + Math.random() * 0.5 });
    return { x, y: 0.05 + Math.random() * 0.3, scale: 30 + Math.random() * 40, puffs, speed: 4 + Math.random() * 6 };
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.W = this.canvas.width; this.H = this.canvas.height;
    this.vignette = null;
  }
  sx(wx) { return (wx - this.left) * this.bs; }
  sy(wy) { return (wy - this.top) * this.bs; }
  toWorld(px, py) { return { x: this.left + (px * this.dpr) / this.bs, y: this.top + (py * this.dpr) / this.bs }; }
  drawTile(ti, wx, wy, scale = 1, atlas = TEX.atlas, alpha = 1) {
    const ctx = this.ctx, bs = this.bs;
    const s = bs * scale;
    const x = this.sx(wx) + (bs - s) / 2, y = this.sy(wy) + (bs - s) / 2;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(atlas, (ti % TEX.cols) * TS, Math.floor(ti / TEX.cols) * TS, TS, TS, Math.floor(x), Math.floor(y), Math.ceil(s), Math.ceil(s));
    if (alpha < 1) ctx.globalAlpha = 1;
  }

  // --- sky ---------------------------------------------------------------------
  skyState(t, rain) {
    const a = t * TAU, sunH = Math.sin(a);
    const day = smoothstep(-0.18, 0.22, sunH);
    const tw = smoothstep(0.42, 0, Math.abs(sunH));
    let top = mixRgb(SKY.nightTop, SKY.dayTop, day), bot = mixRgb(SKY.nightBot, SKY.dayBot, day);
    top = mixRgb(top, SKY.duskTop, tw * 0.55); bot = mixRgb(bot, SKY.duskBot, tw * 0.8);
    if (rain > 0) { top = mixRgb(top, shadeRgb(SKY.rain, 0.4 + day * 0.6), rain * 0.65); bot = mixRgb(bot, shadeRgb(SKY.rain, 0.5 + day * 0.6), rain * 0.65); }
    return { sunH, day, tw, top, bot };
  }

  drawSky(game, st) {
    const ctx = this.ctx, W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgbCss(st.top)); g.addColorStop(1, rgbCss(st.bot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const t = game.time;
    // stars
    const starA = (1 - st.day) * (1 - game.weather.rain);
    if (starA > 0.02) {
      for (const s of this.stars) {
        const tw = 0.6 + 0.4 * Math.sin(game.clock * 2 + s.p);
        ctx.fillStyle = `rgba(255,255,240,${starA * tw})`;
        const x = ((s.x * W - game.cam.x * 0.4) % W + W) % W;
        ctx.fillRect(x, s.y * H, s.s * this.dpr, s.s * this.dpr);
      }
    }
    // sun & moon
    const horizon = H * 0.78, px = Math.max(3, Math.round(this.bs / 8));
    const drawDisc = (cx, cy, r, color, glow) => {
      if (glow) {
        const gg = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 4);
        gg.addColorStop(0, glow); gg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gg; ctx.fillRect(cx - r * 4, cy - r * 4, r * 8, r * 8);
      }
      ctx.fillStyle = color;
      for (let yy = -r; yy <= r; yy += px) {
        const hw = Math.floor(Math.sqrt(Math.max(0, r * r - yy * yy)) / px) * px;
        ctx.fillRect(Math.round(cx - hw), Math.round(cy + yy), hw * 2, px);
      }
    };
    const sunT = ((t % 1) + 1) % 1;
    if (sunT < 0.55) {
      const u = sunT / 0.5;
      drawDisc(W * (0.06 + 0.88 * u), horizon - Math.sin(u * Math.PI) * H * 0.62, px * 6, '#fff3c4', `rgba(255,220,150,${0.45 * (1 - game.weather.rain)})`);
    }
    const moonT = (sunT + 0.5) % 1;
    if (moonT < 0.55) {
      const u = moonT / 0.5;
      const mx = W * (0.06 + 0.88 * u), my = horizon - Math.sin(u * Math.PI) * H * 0.58;
      drawDisc(mx, my, px * 5, '#e9ecf5', 'rgba(200,210,255,0.18)');
      drawDisc(mx + px * 2, my - px, px * 4, rgbCss(st.top));
    }
    // parallax mountains
    const layers = [
      { f: 0.1, amp: 26, scale: 90, col: hexRgb('#6d84a8'), seed: 11 },
      { f: 0.2, amp: 20, scale: 60, col: hexRgb('#557093'), seed: 12 },
      { f: 0.34, amp: 14, scale: 38, col: hexRgb('#3f5a72'), seed: 13 },
    ];
    const bs = this.bs, step = Math.max(2, Math.round(bs / 6));
    const lightK = 0.25 + st.day * 0.75;
    layers.forEach((L, li) => {
      const baseY = H * 0.6 + (SEA_LEVEL - 12 - game.cam.y) * bs * L.f;
      let col = mixRgb(shadeRgb(L.col, lightK), st.bot, 0.55 - li * 0.15);
      if (st.tw > 0.2) col = mixRgb(col, hexRgb('#7a4a6a'), st.tw * 0.25);
      ctx.fillStyle = rgbCss(col);
      const off = game.cam.x * bs * L.f;
      for (let x = 0; x < W; x += step) {
        const u = (x + off) / (bs * L.scale * 0.1);
        const h = (fbm1(u * 0.1, L.seed + game.world.seed % 1000, 4) * 1.4 - 0.2) * L.amp * bs * 0.6;
        const y = Math.round(baseY - h);
        if (y < H) ctx.fillRect(x, y, step, H - y);
      }
      if (li === 1) this.drawSkyline(game, st, baseY);
    });
    // clouds
    const cloudA = (0.35 + st.day * 0.55) * (1 - game.weather.rain * 0.3);
    const cc = mixRgb(hexRgb('#ffffff'), st.bot, 0.25 + st.tw * 0.3);
    const cdark = shadeRgb(cc, 0.86);
    for (const c of this.clouds) {
      c.x += c.speed * game.dt;
      const span = 4000;
      const cx = (((c.x - game.cam.x * bs * 0.08) % span) + span) % span - 300;
      if (cx > W + 200) continue;
      const cy = c.y * H + (SEA_LEVEL - game.cam.y) * bs * 0.05;
      const sc = c.scale * this.dpr;
      for (const p of c.puffs) {
        ctx.fillStyle = rgbCss(cdark, cloudA);
        ctx.fillRect(Math.round(cx + p.dx * sc), Math.round(cy + (p.dy + 0.15) * sc), Math.round(p.w * sc), Math.round(p.h * sc));
        ctx.fillStyle = rgbCss(cc, cloudA);
        ctx.fillRect(Math.round(cx + p.dx * sc), Math.round(cy + p.dy * sc), Math.round(p.w * sc), Math.round(p.h * sc * 0.8));
      }
    }
  }

  drawSkyline(game, st, baseY) {
    const city = game.world.zones.find(z => z.type === 'city');
    if (!city) return;
    const cc = (city.x0 + city.x1) / 2;
    const d = Math.abs(game.cam.x - cc);
    const a = smoothstep(560, 240, d);
    if (a <= 0.01) return;
    const ctx = this.ctx, W = this.W, H = this.H, f = 0.22;
    const unit = H * 0.05;
    const off = (game.cam.x - cc) * this.bs * f;
    const night = 1 - st.day;
    const col = mixRgb(shadeRgb(hexRgb('#46536e'), 0.35 + st.day * 0.55), st.bot, 0.45);
    const ws = Math.max(2, Math.round(unit * 0.14));
    for (let k = -26; k <= 26; k++) {
      const x = W / 2 + k * unit * 1.5 - off;
      const bw = unit * (0.9 + hash1(k, 99) * 0.9);
      if (x + bw < 0 || x > W) continue;
      const centre = 1 - Math.abs(k) / 26;
      const bh = H * (0.05 + centre * (0.12 + hash1(k, 98) * 0.2));
      const y = baseY - bh;
      ctx.fillStyle = rgbCss(col, a);
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(bw), Math.ceil(H - y));
      if (hash1(k, 97) < 0.3) ctx.fillRect(Math.round(x + bw / 2 - 1), Math.round(y - unit * 0.6), Math.max(2, Math.round(unit * 0.06)), Math.round(unit * 0.6));
      if (night > 0.3) {
        ctx.fillStyle = `rgba(255,214,120,${a * night * 0.75})`;
        for (let wy = y + unit * 0.4; wy < baseY + unit; wy += unit * 0.35) for (let wx = x + unit * 0.15; wx < x + bw - ws; wx += unit * 0.3) {
          if (hash2(Math.floor(wx / ws), Math.floor(wy / ws), k) < 0.3) ctx.fillRect(Math.round(wx), Math.round(wy), ws, ws);
        }
      }
    }
  }

  // --- world ---------------------------------------------------------------------
  render(game) {
    const ctx = this.ctx, world = game.world;
    const W = this.W, H = this.H;
    this.bs = game.cam.bs;
    const bs = this.bs;
    const shake = game.shakeAmt > 0 ? game.shakeAmt * bs * 0.6 : 0;
    const camX = game.cam.x + (shake ? (Math.random() - 0.5) * shake / bs : 0);
    const camY = game.cam.y + (shake ? (Math.random() - 0.5) * shake / bs : 0);
    this.left = camX - W / (2 * bs); this.top = camY - H / (2 * bs);
    this.glows.length = 0;
    const st = this.skyState(game.time, game.weather.rain);
    this.night = 1 - st.day;
    ctx.imageSmoothingEnabled = false;
    this.drawSky(game, st);

    const tx0 = Math.floor(this.left), ty0 = Math.floor(this.top);
    const tx1 = Math.floor(this.left + W / bs), ty1 = Math.floor(this.top + H / bs);
    const tw = tx1 - tx0 + 1, th = ty1 - ty0 + 1;
    const xs = new Int32Array(tw + 1), ys = new Int32Array(th + 1);
    for (let i = 0; i <= tw; i++) xs[i] = Math.floor((tx0 + i - this.left) * bs);
    for (let j = 0; j <= th; j++) ys[j] = Math.floor((ty0 + j - this.top) * bs);
    const fg = world.fg, bgA = world.bg, meta = world.meta, WW = world.W;
    const atlas = TEX.atlas, atlasBg = TEX.atlasBg, C = TEX.cols;
    const now = performance.now();
    const clock = game.clock;
    const waterCells = [], flags = [], lights = [];
    this.visibleEmitters.length = 0;
    const pl = game.player;
    const p16 = bs / 16;

    for (let j = 0; j < th; j++) {
      const y = ty0 + j;
      if (y < 0 || y >= world.H) continue;
      const sy = ys[j], hgt = ys[j + 1] - sy;
      for (let i = 0; i < tw; i++) {
        const x = tx0 + i;
        if (x < 0 || x >= WW) continue;
        const k = y * WW + x;
        const id = fg[k];
        const d = BLOCKS[id];
        const sx = xs[i], wid = xs[i + 1] - sx;
        if (!d.opaque) {
          const b = bgA[k];
          if (b) { const ti = BLOCKS[b].ti[0]; ctx.drawImage(atlasBg, (ti % C) * TS, ((ti / C) | 0) * TS, TS, TS, sx, sy, wid, hgt); }
        }
        if (id === 0) continue;
        if (d.light) lights.push(x, y, id);
        let ti = d.ti[0];
        switch (d.render) {
          case 'water': waterCells.push(x, y, k); continue;
          case 'flag': flags.push(x, y, d.flag); continue;
          case 'lava': ti = d.ti[Math.floor(clock * 3 + x * 0.5) % 4]; break;
          case 'anim': ti = d.ti[Math.floor(clock * 6) % d.ti.length]; break;
          case 'door': ti = d.ti[game.doorsOpen.has(d.door === 'top' ? k + WW : k) ? 1 : 0]; break;
          case 'plant': {
            ti = d.ti[Math.min(meta[k], d.ti.length - 1)];
            let sway = Math.sin(clock * 1.7 + x * 0.7) * 0.9 * (1 + game.weather.rain);
            if (Math.abs(pl.x - (x + 0.5)) < 0.9 && pl.y > y && pl.y - pl.h < y + 1) sway += (x + 0.5 > pl.x ? 2.5 : -2.5);
            const pop = world.pops.get(k);
            let sc = 1;
            if (pop !== undefined) { const t = (now - pop) / 220; if (t >= 1) world.pops.delete(k); else sc = 0.3 + 0.7 * easeOutBack(t); }
            const srcX = (ti % C) * TS, srcY = ((ti / C) | 0) * TS;
            for (let s = 0; s < 4; s++) {
              const off = sway * (1 - (s * 4 + 2) / 16) * p16;
              const yy = sy + hgt * (1 - sc) + s * 4 * p16 * sc;
              ctx.drawImage(atlas, srcX, srcY + s * 4, TS, 4, Math.floor(sx + off + wid * (1 - sc) / 2), Math.floor(yy), Math.ceil(wid * sc), Math.ceil(4 * p16 * sc) + 1);
            }
            continue;
          }
          case 'crumble': {
            const tm = world.timers.get(k);
            if (tm && tm.kind === 'shake') {
              const j2 = (Math.random() - 0.5) * p16 * 2;
              ctx.drawImage(atlas, (ti % C) * TS, ((ti / C) | 0) * TS, TS, TS, sx + j2, sy + j2 * 0.5, wid, hgt);
              continue;
            }
            break;
          }
          case 'boom': {
            const tm = world.timers.get(k);
            ctx.drawImage(atlas, (ti % C) * TS, ((ti / C) | 0) * TS, TS, TS, sx, sy, wid, hgt);
            if (tm && tm.kind === 'boom' && Math.floor(tm.t * 8) % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(sx, sy, wid, hgt); }
            continue;
          }
          case 'torch':
            if (Math.random() < 0.012) this.visibleEmitters.push(['ember', x + 0.5, y + 0.2]);
            break;
          default: break;
        }
        const pop = world.pops.get(k);
        if (pop !== undefined) {
          const t = (now - pop) / 180;
          if (t >= 1) world.pops.delete(k);
          else {
            const sc = 0.55 + 0.45 * easeOutBack(t);
            const w2 = wid * sc, h2 = hgt * sc;
            ctx.drawImage(atlas, (ti % C) * TS, ((ti / C) | 0) * TS, TS, TS, Math.floor(sx + (wid - w2) / 2), Math.floor(sy + (hgt - h2) / 2), Math.ceil(w2), Math.ceil(h2));
            continue;
          }
        }
        ctx.drawImage(atlas, (ti % C) * TS, ((ti / C) | 0) * TS, TS, TS, sx, sy, wid, hgt);
        if (d.leaves && id === B.leaves_cherry && Math.random() < 0.0015) this.visibleEmitters.push(['petal', x + Math.random(), y + 1]);
      }
    }

    // flags
    for (let n = 0; n < flags.length; n += 3) this.drawFlag(flags[n], flags[n + 1], flags[n + 2], clock, game);

    // mining cracks + build preview
    if (game.mining && game.mining.progress > 0) {
      const stage = Math.min(3, Math.floor(game.mining.progress * 4));
      this.drawTile(texIndex('crack' + stage), game.mining.x, game.mining.y);
    }

    // entities
    for (const e of game.entities) if (!(e instanceof Car)) e.draw(ctx, this);
    if (!game.hidePlayer) pl.draw(ctx, this);
    for (const e of game.entities) if (e instanceof Car) e.draw(ctx, this);

    // water
    if (waterCells.length) {
      for (let n = 0; n < waterCells.length; n += 3) {
        const x = waterCells[n], y = waterCells[n + 1], k = waterCells[n + 2];
        const full = fg[k - WW] === B.water;
        const h = full ? 1 : meta[k] / WATER_MAX;
        const sx = Math.floor((x - this.left) * bs), sx2 = Math.floor((x + 1 - this.left) * bs);
        const sy0 = (y - this.top) * bs;
        const falling = !full && y + 1 < world.H && (fg[k + WW] === B.air);
        const top = falling ? sy0 : sy0 + (1 - h) * bs;
        ctx.fillStyle = 'rgba(40,112,214,0.56)';
        ctx.fillRect(sx, Math.floor(top), sx2 - sx, Math.ceil(sy0 + bs - top));
        if (!full) {
          const wave = Math.sin(clock * 2.4 + x * 0.9) * p16 * 0.8;
          ctx.fillStyle = 'rgba(175,220,255,0.7)';
          ctx.fillRect(sx, Math.floor(top + wave), sx2 - sx, Math.max(1, Math.round(p16 * 1.3)));
        }
      }
    }

    game.fx.draw(ctx, this);
    this.drawLight(game, world, tx0, ty0, tw, th, st);

    // glows from light sources (additive)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glowA = 0.12 + this.night * 0.38;
    for (let n = 0; n < lights.length; n += 3) {
      const d = BLOCKS[lights[n + 2]];
      if (!d.glow) continue;
      const spr = this.glowSprites[d.glow];
      const flick = d.render === 'torch' ? 0.85 + Math.sin(clock * 13 + lights[n] * 3) * 0.08 + Math.random() * 0.07 : 1;
      const r = d.light * 0.32 * bs * flick;
      ctx.globalAlpha = glowA * flick;
      ctx.drawImage(spr, this.sx(lights[n] + 0.5) - r, this.sy(lights[n + 1] + 0.5) - r, r * 2, r * 2);
    }
    for (const g of this.glows) {
      const spr = this.glowSprites[g.color] || this.glowSprites.warm;
      ctx.globalAlpha = 0.5 * this.night;
      const r = g.r * bs;
      if (g.color === 'cone') ctx.drawImage(spr, this.sx(g.x) - r, this.sy(g.y) - r * 0.35, r * 2, r * 0.7);
      else ctx.drawImage(spr, this.sx(g.x) - r, this.sy(g.y) - r, r * 2, r * 2);
    }
    ctx.restore();
    game.fx.drawGlow(ctx, this);

    if (pl.headInWater) { ctx.fillStyle = 'rgba(20,70,150,0.22)'; ctx.fillRect(0, 0, W, H); }
    this.drawWeather(game, st);
    this.drawTarget(game);
    this.drawSpeech(game);
    this.drawVignette(game.cinematicAmt || 0);
  }

  drawFlag(x, y, type, clock, game) {
    const ctx = this.ctx, p = this.bs / 16;
    const sx = this.sx(x), sy = this.sy(y);
    ctx.fillStyle = '#7a7a7a'; ctx.fillRect(sx + 2 * p, sy + 14 * p, 4 * p, 2 * p);
    ctx.fillStyle = '#e6e6e6'; ctx.fillRect(sx + 3 * p, sy + p, 2 * p, 14 * p);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(sx + 3 * p, sy + p, p, 14 * p);
    const col = type === 'start' ? '#3fbf4f' : type === 'check' ? '#3b8ff0' : null;
    const active = game.parkour && game.parkour.isActiveFlag(x, y);
    for (let c = 0; c < 9; c++) {
      const wave = Math.sin(clock * 6 - c * 0.7) * 1.2 * (c / 8);
      for (let r = 0; r < 3; r++) {
        ctx.fillStyle = col ? (active ? '#ffd34d' : (r === 0 ? rgbCss(shadeRgb(hexRgb(col), 1.15)) : col)) : (((c >> 1) + r) % 2 ? '#111111' : '#ffffff');
        ctx.fillRect(Math.floor(sx + (5 + c) * p), Math.floor(sy + (1 + wave + r * 2.2) * p), Math.ceil(p) + 1, Math.ceil(2.3 * p));
      }
    }
  }

  drawLight(game, world, tx0, ty0, tw, th, st) {
    const M = 15;
    const lw = tw + M * 2, lh = th + M * 2;
    const n = lw * lh;
    const L = this.lightBuf;
    if (L.n < n) { L.sky = new Uint8Array(n); L.blk = new Uint8Array(n); L.att = new Uint8Array(n); L.n = n; }
    world.computeLight(tx0 - M, ty0 - M, lw, lh, L.sky, L.blk, L.att);
    if (this.lightCanvas.width !== tw || this.lightCanvas.height !== th) {
      this.lightCanvas.width = tw; this.lightCanvas.height = th;
      this.lightImg = this.lightCtx.createImageData(tw, th);
    }
    const img = this.lightImg, data = img.data;
    const dayMul = (0.22 + st.day * 0.78) * (1 - game.weather.rain * 0.25);
    const tint = mixRgb(hexRgb('#05081a'), hexRgb('#140c08'), 0.0);
    let o = 0;
    for (let j = 0; j < th; j++) {
      let k = (j + M) * lw + M;
      for (let i = 0; i < tw; i++, k++, o += 4) {
        const s = L.sky[k] * dayMul, b = L.blk[k];
        const v = (s > b ? s : b) / 15;
        const a = v >= 1 ? 0 : (1 - v) * (1 - v * 0.25);
        data[o] = tint[0]; data[o + 1] = tint[1]; data[o + 2] = tint[2];
        data[o + 3] = a * 245;
      }
    }
    this.lightCtx.putImageData(img, 0, 0);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.lightCanvas, 0, 0, tw, th, this.sx(tx0), this.sy(ty0), tw * this.bs, th * this.bs);
    ctx.imageSmoothingEnabled = false;
  }

  drawWeather(game, st) {
    const ctx = this.ctx, W = this.W, H = this.H;
    const amt = game.weather.rain;
    const underground = game.cam.y > game.world.terrainY[clamp(Math.floor(game.cam.x), 0, game.world.W - 1)] + 8;
    if (amt < 0.02 || underground) { this.rain.length = 0; return; }
    const snowy = BIOMES[game.world.biome[clamp(Math.floor(game.cam.x), 0, game.world.W - 1)]].key === 'snow';
    const want = Math.floor(amt * (snowy ? 140 : 220));
    while (this.rain.length < want) this.rain.push({ x: Math.random() * W, y: Math.random() * H, v: 0.7 + Math.random() * 0.6 });
    if (this.rain.length > want) this.rain.length = want;
    const dt = game.dt;
    ctx.save();
    if (snowy) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const r of this.rain) {
        r.y += H * 0.12 * r.v * dt; r.x += Math.sin(game.clock + r.v * 9) * 20 * dt * this.dpr;
        if (r.y > H) { r.y = -5; r.x = Math.random() * W; }
        const s = Math.round(2 * this.dpr * r.v);
        ctx.fillRect(r.x, r.y, s, s);
      }
    } else {
      ctx.strokeStyle = 'rgba(180,200,235,0.45)'; ctx.lineWidth = Math.max(1, this.dpr);
      ctx.beginPath();
      for (const r of this.rain) {
        r.y += H * 1.4 * r.v * dt; r.x -= H * 0.25 * r.v * dt;
        if (r.y > H || r.x < 0) { r.y = -10; r.x = Math.random() * W * 1.2; }
        ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + 4 * this.dpr, r.y - 16 * this.dpr * r.v);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTarget(game) {
    const t = game.target;
    if (!t || game.hideCursor) return;
    const ctx = this.ctx, bs = this.bs;
    const x = Math.floor(this.sx(t.x)), y = Math.floor(this.sy(t.y));
    const lw = Math.max(2, Math.round(bs / 14));
    if (t.preview >= 0 && t.ok) {
      ctx.globalAlpha = 0.4;
      ctx.drawImage(TEX.atlas, (t.preview % TEX.cols) * TS, Math.floor(t.preview / TEX.cols) * TS, TS, TS, x, y, Math.ceil(bs), Math.ceil(bs));
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = t.ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,90,90,0.9)';
    ctx.lineWidth = lw;
    ctx.strokeRect(x + lw / 2, y + lw / 2, Math.ceil(bs) - lw, Math.ceil(bs) - lw);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, Math.ceil(bs) + 1, Math.ceil(bs) + 1);
  }

  drawSpeech(game) {
    const ctx = this.ctx;
    const fs = Math.round(Math.max(12 * this.dpr, this.bs * 0.36));
    ctx.font = `500 ${fs}px 'Pixelify Sans', 'Trebuchet MS', sans-serif`;
    for (const e of game.entities) {
      if (!e.talk || e.talkT <= 0) continue;
      const a = clamp(e.talkT, 0, 1) * clamp((4.5 - e.talkT) * 4, 0, 1);
      const x = this.sx(e.x), y = this.sy(e.y - e.h - 0.35);
      const tw = ctx.measureText(e.talk).width, pad = fs * 0.5;
      const bw = tw + pad * 2, bh = fs * 1.7;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fbf7ee';
      ctx.fillRect(Math.round(x - bw / 2), Math.round(y - bh), Math.round(bw), Math.round(bh));
      ctx.fillRect(Math.round(x - fs * 0.25), Math.round(y), Math.round(fs * 0.5), Math.round(fs * 0.35));
      ctx.fillStyle = '#2a2622';
      ctx.fillRect(Math.round(x - bw / 2), Math.round(y - bh), Math.round(bw), Math.max(1, this.dpr));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.talk, x, y - bh / 2 + 1);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  drawVignette(amount) {
    const ctx = this.ctx, W = this.W, H = this.H;
    if (!this.vignette) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(128, 128, 70, 128, 128, 182);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.85)');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      this.vignette = c;
    }
    ctx.globalAlpha = 0.28 + amount * 0.45;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.vignette, 0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
  }
}
