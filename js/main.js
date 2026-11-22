'use strict';
// ---------------------------------------------------------------------------
// Game: modes (survival, creative, parkour), main loop, chunk streaming,
// camera, mining and building, survival rules, cinematics and races.
// ---------------------------------------------------------------------------

const STEP = 1 / 60;
const DAY_LEN = 600;
const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CREATIVE_BAR = ['grass', 'planks_oak', 'stonebricks', 'glass', 'door', 'torch', 'water', 'houseseed', 'wonderseed'];
const SPIRAL = (() => {
  const s = [];
  for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) s.push([dx, dz, dx * dx + dz * dz]);
  return s.sort((a, b) => a[2] - b[2]);
})();
const VILLAGER_LINES = [
  'Hi there! Mine a tree to get started.', 'Turn logs into planks, then make a pickaxe!', 'Stone needs a pickaxe to break.',
  'Cook iron ore with coal to make ingots.', 'Apples fall from oak leaves sometimes.', 'Sleep in a bed when it gets dark.',
  'A House Seed grows a whole cottage!', 'Torches keep the caves bright.', 'Have you seen the big city to the east?',
  'Gems hide deep underground.', 'Plant seeds on grass and watch them grow.',
];

const game = {
  state: 'boot', mode: null, world: null, player: null, r: null,
  particles: new Particles(), sound: Sound, ui: UI,
  cam: { yaw: 0, pitch: 0, view: 'first', dist: 4.5, eye: [0, 0, 0], fwd: [0, 0, -1] },
  inv: new Array(36).fill(null), sel: 0, hp: 20, air: 10, time: 0.04, day: 1,
  drops: [], animals: [], villagers: [], race: null, cup: null,
  mining: null, swing: 0, placeCd: 0, mineCd: 0, target: null,
  distLevel: 1, spawnPoint: null, hurtT: 9, regenT: 0, acc: 0, lastT: 0, slowMo: 0,
  cinemaMode: false, shake: 0, tick: { water: 0, grow: 0, spawn: 0, save: 0 },

  boot() {
    initBlocks(); buildTables();
    try { this.r = new Renderer3D(document.getElementById('game')); }
    catch (e) { document.getElementById('nogl').hidden = false; document.getElementById('title-screen').hidden = true; console.error(e); return; }
    if (Input.isTouch || window.matchMedia('(pointer: coarse)').matches) { this.r.maxDpr = 1.5; this.r.resize(); }
    Input.init(this.r.canvas);
    Input.onUnlock = () => { if ((this.state === 'play' || this.state === 'race') && !UI.open && !this.cinemaMode) UI.openPanel('pause'); };
    UI.init(this);
    const st = Store.get('pr3d.settings', {});
    if (st.sound === false) this.sound.setEnabled(false);
    if (st.music === false) this.sound.setMusic(false);
    if (st.dist !== undefined) this.distLevel = st.dist;
    else if (window.matchMedia('(pointer: coarse)').matches) this.distLevel = 0;
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveNow(true); });
    this.showTitle();
    requestAnimationFrame(t => this.loop(t));
  },
  saveSettings() { Store.set('pr3d.settings', { sound: this.sound.enabled, music: this.sound.musicOn, dist: this.distLevel }); },
  viewRadius() { return (Input.isTouch ? [3, 4, 6] : [4, 6, 8])[this.distLevel]; },
  cycleDistance() { this.distLevel = (this.distLevel + 1) % 3; this.saveSettings(); },

  // --- screens ---------------------------------------------------------------------
  showTitle() {
    this.state = 'title'; this.mode = 'title'; this.race = null; this.cup = null;
    document.body.classList.remove('playing');
    this.setupWorld('creative', randomSeed());
    const reg = this.world.gen.regionInfo(0, 0);
    this.titleCenter = [reg.cx + 0.5, reg.gy + 2, reg.cz + 0.5];
    this.titleAngle = Math.random() * TAU;
    this.time = 0.3;
    this.cinemaMode = false;
    this.bars(false);
    UI.setMode('title');
    UI.showTitle();
  },
  setupWorld(mode, seed) {
    if (this.world) for (const c of this.world.chunks.values()) this.r.freeChunk(c);
    const w = new World(seed, mode, null);
    w.gen = new Terrain(w.seed);
    this.world = w;
    this.drops = []; this.animals = []; this.villagers = []; this.particles.list.length = 0;
    this.spawnedRegions = new Set();
    const reg = w.gen.regionInfo(0, 0);
    const sx = reg.cx - 34, sz = reg.cz;
    w.spawn = { x: sx + 0.5, z: sz + 0.5, y: reg.gy };
    this.player = new Body(w.spawn.x, w.spawn.y, w.spawn.z, 0.3, 1.75);
    this.player.look = beanLook(new RNG(7), '#2fb4a4');
    this.player.look.hat = 'none';
    this.cam.yaw = -Math.PI / 2; this.cam.pitch = -0.1;
    this.hp = 20; this.air = 10; this.day = 1; this.time = 0.04; this.spawnPoint = null;
    this.inv = new Array(36).fill(null); this.sel = 0;
    if (mode === 'creative') CREATIVE_BAR.forEach((k, i) => { this.inv[i] = { id: B[k], n: 1 }; });
  },
  loadAround(x, z, r) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    for (const [dx, dz, d2] of SPIRAL) { if (d2 > (r + 1) * (r + 1)) break; this.world.ensureChunk(cx + dx, cz + dz); }
    for (const [dx, dz, d2] of SPIRAL) {
      if (d2 > r * r) break;
      const c = this.world.getChunk(cx + dx, cz + dz);
      if (c) this.r.uploadChunk(c, buildChunkMesh(this.world, c));
      this.world.dirty.delete(CK(cx + dx, cz + dz)); this.world.urgent.delete(CK(cx + dx, cz + dz));
    }
  },

  newWorld(mode, seed) {
    this.sound.init();
    UI.showLoading(true, mode === 'survival' ? 'Growing trees and hiding ores…' : 'Building your world…');
    this.state = 'loading';
    setTimeout(() => {
      this.mode = mode;
      this.setupWorld(mode, seed);
      const p = this.player;
      this.loadAround(p.x, p.z, 3);
      p.y = this.world.topY(Math.floor(p.x), Math.floor(p.z)) + 1;
      UI.setMode(mode);
      UI.refreshHotbar();
      UI.showLoading(false);
      UI.hideTitle();
      this.startIntro();
    }, 40);
  },
  continueWorld(mode) {
    const data = Save.read(mode);
    if (!data) return;
    this.sound.init();
    UI.showLoading(true, 'Loading your world…');
    this.state = 'loading';
    setTimeout(() => {
      this.mode = mode;
      this.setupWorld(mode, data.seed);
      const map = Save.restore(this.world, data);
      const p = this.player, d = data.player;
      p.x = d.x; p.y = d.y; p.z = d.z; p.fly = !!d.fly;
      this.cam.yaw = d.yaw || 0; this.cam.pitch = d.pitch || 0; this.cam.view = data.view || 'first';
      this.hp = d.hp || 20; this.time = data.time || 0.1; this.day = data.day || 1;
      this.spawnPoint = data.spawn || null; this.sel = data.sel || 0;
      this.inv = (data.inv || []).map(s => (s && map[s[0]] ? { id: map[s[0]], n: s[1] } : null));
      while (this.inv.length < 36) this.inv.push(null);
      this.loadAround(p.x, p.z, 3);
      UI.setMode(mode); UI.refreshHotbar();
      UI.showLoading(false); UI.hideTitle();
      this.fade(1, 0); setTimeout(() => this.fade(0, 600), 60);
      this.startPlaying();
      this.cineTitle('Welcome back', `Day ${this.day} · Seed ${data.seed}`);
    }, 40);
  },
  startPlaying() {
    this.state = 'play';
    document.body.classList.add('playing');
    UI.showHUD(true);
    this.bars(false);
    Input.enabled = true;
  },
  quitToTitle() {
    this.saveNow(true);
    Input.releaseLock();
    Input.enabled = false;
    UI.closeResults();
    this.fade(1, 300);
    setTimeout(() => { this.showTitle(); this.fade(0, 500); }, 320);
  },

  // --- cinematics ----------------------------------------------------------------------
  bars(on) { document.getElementById('cine-bars').classList.toggle('on', on); },
  fade(a, ms = 400) { const f = document.getElementById('fade'); f.style.transitionDuration = ms + 'ms'; f.style.opacity = a; },
  flashFade() { this.fade(0.85, 80); setTimeout(() => this.fade(0, 350), 120); },
  cineTitle(main, sub, cls = '', ms = 3800) {
    const t = document.getElementById('cine-title');
    clearTimeout(this.titleTimer);
    t.className = cls;
    t.querySelector('.cine-main').textContent = main;
    t.querySelector('.cine-sub').textContent = sub || '';
    void t.offsetWidth; t.classList.add('show');
    this.titleTimer = setTimeout(() => t.classList.remove('show'), ms);
  },
  startIntro() {
    const reg = this.world.gen.regionInfo(0, 0), p = this.player;
    const c = [reg.cx + 0.5, reg.gy + 2, reg.cz + 0.5];
    const eye = [p.x, p.y + 1.55, p.z];
    this.intro = {
      t: 0, shot: 0,
      shots: [
        { dur: 6.5, path: u => { const a = 0.4 + u * 1.4, R = 40 - u * 8; return { eye: [c[0] + Math.cos(a) * R, c[1] + 22 - u * 6, c[2] + Math.sin(a) * R], look: c }; }, main: 'PIXEL REALMS', sub: this.mode === 'survival' ? 'Survival · mine, craft, build' : 'Creative · build anything', cls: 'logo' },
        { dur: 4.2, path: u => { const k = easeInOut(u); const s = [c[0] - 6, c[1] + 16, c[2] + 26]; return { eye: [lerp(s[0], eye[0], k), lerp(s[1], eye[1], k), lerp(s[2], eye[2], k)], look: [lerp(c[0], eye[0] - 10, k), lerp(c[1], eye[1] - 0.6, k), lerp(c[2], eye[2], k)] }; }, main: `Seed: ${this.world.seedStr}`, sub: 'Your adventure begins' },
      ],
    };
    this.state = 'intro';
    this.bars(true);
    UI.showHUD(false);
    this.fade(0, 600);
    this.cineTitle(this.intro.shots[0].main, this.intro.shots[0].sub, 'logo', 5600);
    this.sound.play('discover');
  },
  updateIntro(dt) {
    const I = this.intro;
    I.t += dt;
    let s = I.shots[I.shot];
    if (I.t >= s.dur) {
      I.shot++; I.t = 0;
      if (I.shot >= I.shots.length) { this.endIntro(); return; }
      s = I.shots[I.shot];
      this.cineTitle(s.main, s.sub, s.cls || '', s.dur * 1000 - 500);
    }
    const { eye, look } = s.path(clamp(I.t / s.dur, 0, 1));
    this.cam.eye = eye;
    const dx = look[0] - eye[0], dy = look[1] - eye[1], dz = look[2] - eye[2];
    this.cam.yawI = Math.atan2(-dx, -dz); this.cam.pitchI = Math.atan2(dy, Math.hypot(dx, dz));
    this.time = (0.965 + 0.075 * clamp(((I.shot ? I.shots[0].dur : 0) + I.t) / 10.7, 0, 1)) % 1;
  },
  skipIntro() { if (this.state === 'intro') { this.fade(1, 150); setTimeout(() => { this.endIntro(); this.fade(0, 400); }, 160); } },
  endIntro() {
    if (this.state !== 'intro') return;
    this.intro = null;
    this.time = 0.04;
    document.getElementById('cine-title').classList.remove('show');
    this.startPlaying();
    const touch = Input.isTouch;
    if (this.mode === 'survival') {
      setTimeout(() => UI.toast(touch ? 'Hold the pickaxe button on a tree to collect wood.' : 'Click to look around. Hold left click on a tree to collect wood.'), 600);
      setTimeout(() => UI.toast('Open Inventory (E) to make planks, sticks and a pickaxe.'), 4400);
    } else {
      setTimeout(() => UI.toast(touch ? 'Tap to place blocks, hold to break them.' : 'Click to look around. Left click breaks, right click places.'), 600);
      setTimeout(() => UI.toast('Press E for every block. Press F to fly.'), 4400);
    }
  },
  setCinema(on) {
    this.cinemaMode = on;
    this.bars(on);
    UI.showHUD(!on);
    if (on) { this.prevView = this.cam.view; this.cam.view = 'third'; UI.toast('Cinematic camera. Press C or Esc to exit.'); }
    else if (this.prevView) this.cam.view = this.prevView;
  },

  // --- main loop -----------------------------------------------------------------------
  loop(now) {
    const dt = Math.min(0.1, (now - (this.lastT || now)) / 1000);
    this.lastT = now;
    this.dt = dt;
    Input.update();
    const running = ['play', 'intro', 'title', 'race'].includes(this.state);
    if (running) {
      if (this.slowMo > 0) this.slowMo -= dt;
      this.acc += dt * (this.slowMo > 0 ? 0.4 : 1);
      let n = 0;
      while (this.acc >= STEP && n < 5) { this.update(STEP); this.acc -= STEP; n++; }
      if (n >= 5) this.acc = 0;
      if (n) Input.endFrame();
    } else {
      this.menuKeys();
      Input.endFrame();
    }
    if (this.world && this.state !== 'boot') {
      this.stream(this.state === 'loading' ? 30 : 7);
      this.updateCamera(dt);
      this.render();
      UI.updateHUD(dt);
    }
    this.sound.musicTick();
    requestAnimationFrame(t => this.loop(t));
  },

  stream(budget) {
    const w = this.world;
    if (this.mode === 'parkour') {
      const t0 = performance.now();
      for (const k of [...w.urgent, ...w.dirty]) {
        const c = w.chunks.get(k);
        w.urgent.delete(k); w.dirty.delete(k);
        if (c) this.r.uploadChunk(c, buildChunkMesh(w, c));
        if (performance.now() - t0 > budget) break;
      }
      return;
    }
    const t0 = performance.now();
    const fx = this.state === 'title' ? this.titleCenter[0] : this.player.x, fz = this.state === 'title' ? this.titleCenter[2] : this.player.z;
    const R = this.state === 'title' ? 4 : this.viewRadius();
    const cx = Math.floor(fx / CS), cz = Math.floor(fz / CS);
    // urgent remeshes (block edits) first
    for (const k of w.urgent) {
      const c = w.chunks.get(k);
      w.urgent.delete(k); w.dirty.delete(k);
      if (c) this.r.uploadChunk(c, buildChunkMesh(w, c));
      if (performance.now() - t0 > budget * 0.6) break;
    }
    for (const [dx, dz, d2] of SPIRAL) {
      if (d2 > (R + 1) * (R + 1) || performance.now() - t0 > budget) break;
      const k = CK(cx + dx, cz + dz);
      if (!w.chunks.has(k)) { w.ensureChunk(cx + dx, cz + dz); continue; }
      if (d2 <= R * R && w.dirty.has(k)) {
        // only mesh when the neighbours exist, so the borders are right
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => w.chunks.has(CK(cx + dx + a, cz + dz + b)))) {
          w.dirty.delete(k);
          this.r.uploadChunk(w.chunks.get(k), buildChunkMesh(w, w.chunks.get(k)));
        }
      }
    }
    // unload far chunks
    if (Math.random() < 0.05) {
      for (const c of [...w.chunks.values()]) {
        if (Math.abs(c.cx - cx) > R + 3 || Math.abs(c.cz - cz) > R + 3) { this.r.freeChunk(c); w.unload(c.cx, c.cz); }
      }
    }
  },

  update(dt) {
    const w = this.world;
    w.clock += dt;
    if (this.state === 'title') {
      this.titleAngle += dt * 0.06;
      this.time += dt / 140;
      if (this.time >= 1) this.time -= 1;
      for (const a of this.animals) a.update(dt, w, this);
      return;
    }
    if (this.mode === 'parkour') { this.updateRace(dt); return; }
    if (this.state === 'intro') {
      this.updateIntro(dt);
      if (Input.was('Escape', 'Space', 'Enter') || Input.mouse.leftPress || Input.tapPlace) this.skipIntro();
    }
    if (this.state === 'play') { this.time += dt / DAY_LEN; if (this.time >= 1) { this.time -= 1; this.day++; } }
    this.sound.night = this.isNight();
    if (this.state === 'play') this.keys();
    this.updatePlayer(dt);
    if (this.state === 'play') this.interact(dt);
    this.tick.water += dt;
    if (this.tick.water > 0.2) { this.tick.water = 0; w.waterStep(); }
    this.tick.grow += dt;
    if (this.tick.grow > 1) { w.growStep(this.tick.grow, { night: this.isNight() }); this.tick.grow = 0; }
    w.jobStep(dt);
    w.timerStep(dt, (x, y, z) => this.occupied(x, y, z));
    this.worldEvents();
    for (const d of this.drops) d.update(dt, w, this);
    this.drops = this.drops.filter(d => !d.dead);
    for (const a of this.animals) a.update(dt, w, this);
    for (const v of this.villagers) this.updateVillager(v, dt);
    this.particles.update(dt, w);
    this.tick.spawn += dt;
    if (this.tick.spawn > 2) { this.tick.spawn = 0; this.spawnLife(); }
    this.tick.save += dt;
    if (this.tick.save > 60 && this.state === 'play') { this.tick.save = 0; this.saveNow(true); }
    this.shake = Math.max(0, this.shake - dt * 2);
  },

  keys() {
    if (Input.was('Escape')) { if (this.cinemaMode) this.setCinema(false); else UI.openPanel('pause'); return; }
    if (Input.was('KeyE', 'KeyI')) { UI.openPanel('inv'); return; }
    if (Input.was('KeyH', 'F1')) { UI.openPanel('help'); return; }
    if (Input.was('KeyF')) this.toggleFly();
    if (Input.was('KeyV', 'F5')) this.toggleView();
    if (Input.was('KeyC')) this.setCinema(!this.cinemaMode);
    for (let i = 1; i <= 9; i++) if (Input.was('Digit' + i)) this.selectSlot(i - 1);
    if (Input.mouse.wheel) this.selectSlot((this.sel + Input.mouse.wheel + 9) % 9);
    if (Input.was('MousePick') && this.target && this.mode === 'creative') {
      let id = this.world.get(this.target.x, this.target.y, this.target.z);
      if (id === B.door_top) id = B.door;
      if (id && BLOCKS[id].cat !== 'hidden') this.setHotbarItem(this.sel, id);
    }
  },
  menuKeys() {
    if (!UI.open) return;
    if (Input.was('Escape') && UI.open !== 'results') UI.closePanels();
    else if (Input.was('KeyE') && UI.open === 'inv' && document.activeElement !== document.getElementById('pick-search')) UI.closePanels();
  },

  // --- player ----------------------------------------------------------------------------
  wish(inp) {
    const y = this.cam.yaw, s = Math.sin(y), c = Math.cos(y);
    let mx = -s * inp.mz + c * inp.mx, mz = -c * inp.mz - s * inp.mx;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    return { mx, mz };
  },
  updatePlayer(dt) {
    const p = this.player, w = this.world;
    if (!w.isLoaded(Math.floor(p.x), Math.floor(p.z))) return;
    const inp = this.state === 'play' && !UI.open ? Input.state() : { mx: 0, mz: 0 };
    const v = this.wish(inp);
    const P = { speed: 4.3, sprint: 6.2, jump: 8.8, accel: 12, air: 3, fly: p.fly };
    const env = {
      onLand: (b, fall) => {
        if (fall > 1) this.sound.play('land', { vol: Math.min(1, fall / 8) });
        if (this.mode === 'survival' && fall > 3.6 && !b.inWater) this.hurt(Math.floor(fall - 3), 'You fell from too high.');
      },
      onJump: () => this.sound.play('jump'),
      onBounce: () => this.sound.play('bounce'),
      onHurt: (b, n, why) => { if (this.mode === 'survival' && this.hurtT > 0.6) this.hurt(n, 'A cactus poked you.'); },
    };
    controlBody(p, { mx: v.mx, mz: v.mz, jump: inp.jump, jumpHeld: inp.jumpHeld, sprint: inp.sprint, down: inp.down, up: inp.up }, P, w, dt, env);
    p.yawVis = this.cam.yaw;
    if (p.onGround && Math.hypot(p.vx, p.vz) > 1.5 && Math.floor(p.walk * 1.3) !== Math.floor((p.walk - Math.hypot(p.vx, p.vz) * dt * 2.2) * 1.3)) this.sound.play('step', { block: w.get(p.gx, p.gy, p.gz) });
    if (p.y < -20) { p.y = w.topY(Math.floor(p.x), Math.floor(p.z)) + 2; p.vy = 0; if (this.mode === 'survival') this.hurt(6, 'You fell out of the world.'); }
    // survival rules
    this.hurtT += dt;
    if (this.mode === 'survival') {
      if (p.headInWater) { this.air -= dt * 0.7; if (this.air < 0) { this.air = 0; this.drownT = (this.drownT || 0) + dt; if (this.drownT > 1) { this.drownT = 0; this.hurt(2, 'You ran out of air.'); } } }
      else this.air = Math.min(10, this.air + dt * 4);
      if (overlapsBlock(p, w, id => id === B.lava) && this.hurtT > 0.5) this.hurt(4, 'Lava is very hot.');
      if (this.hp < 20 && this.hurtT > 5) { this.regenT += dt; if (this.regenT > 3) { this.regenT = 0; this.hp++; } }
    } else { this.hp = 20; this.air = 10; }
    if (p.inWater && !this.wasWater && Math.abs(p.vy) > 3) { this.sound.play('splash'); this.particles.burst(p.x, p.y + 0.6, p.z, [0.6, 0.8, 1], 12, 3); }
    this.wasWater = p.inWater;
    this.swing = Math.max(0, this.swing - dt * 3);
  },
  hurt(n, cause) {
    if (this.mode !== 'survival' || this.state !== 'play' || this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - n); this.hurtT = 0; this.regenT = 0;
    UI.hurtFlash(); this.sound.play('hurt'); this.shake = 0.3;
    if (this.hp <= 0) {
      this.state = 'dead';
      Input.releaseLock();
      UI.showDeath(cause);
    }
  },
  respawn() {
    UI.hideDeath();
    const s = this.spawnPoint || this.world.spawn, p = this.player;
    p.x = s.x; p.z = s.z; p.vx = p.vy = p.vz = 0;
    this.loadAround(p.x, p.z, 2);
    p.y = this.world.topY(Math.floor(p.x), Math.floor(p.z)) + 1;
    p.maxY = p.y;
    this.hp = 20; this.air = 10;
    this.state = 'play';
    this.fade(1, 0); setTimeout(() => this.fade(0, 500), 50);
  },

  // --- camera ----------------------------------------------------------------------------
  updateCamera(dt) {
    const cam = this.cam, p = this.player;
    if (this.state === 'title') {
      const c = this.titleCenter, a = this.titleAngle, R = 44;
      cam.eye = [c[0] + Math.cos(a) * R, c[1] + 20, c[2] + Math.sin(a) * R];
      cam.yawI = Math.atan2(-(c[0] - cam.eye[0]), -(c[2] - cam.eye[2]));
      cam.pitchI = Math.atan2(c[1] - cam.eye[1], R);
      return;
    }
    if (this.state === 'intro' || (this.mode === 'parkour' && this.race && this.race.camOverride)) return;
    if (this.state === 'play' || this.state === 'race' || this.state === 'dead') {
      const [dx, dy] = Input.takeLook();
      const sens = Input.isTouch ? 0.0042 : 0.0025;
      cam.yaw -= dx * sens; cam.pitch = clamp(cam.pitch - dy * sens, -1.5, 1.5);
    } else Input.takeLook();
    cam.yawI = cam.yaw; cam.pitchI = cam.pitch;
    const third = this.mode === 'parkour' || cam.view === 'third' || this.cinemaMode;
    const head = [p.x, p.y + (third ? 1.35 : 1.58), p.z];
    if (!third) {
      const bob = p.onGround ? Math.sin(p.walk * 3.2) * 0.04 * Math.min(1, Math.hypot(p.vx, p.vz) / 4) : 0;
      cam.eye = [head[0], head[1] + bob, head[2]];
    } else {
      const f = forwardVec(cam.yaw, cam.pitch);
      let dist = this.mode === 'parkour' ? 6 : (this.cinemaMode ? 6.5 : cam.dist);
      // pull the camera in front of walls
      for (let d = 0.3; d < dist; d += 0.25) {
        if (OPAQUE[this.world.get(Math.floor(head[0] - f[0] * d), Math.floor(head[1] - f[1] * d), Math.floor(head[2] - f[2] * d))]) { dist = Math.max(0.6, d - 0.3); break; }
      }
      const target = [head[0] - f[0] * dist, head[1] - f[1] * dist, head[2] - f[2] * dist];
      const k = 1 - Math.exp(-dt * (this.cinemaMode ? 3 : 18));
      cam.eye = cam.eye.map((v, i) => (Math.abs(v - target[i]) > 8 ? target[i] : v + (target[i] - v) * k));
    }
    if (this.shake > 0 && !REDUCED_MOTION) cam.eye = cam.eye.map(v => v + (Math.random() - 0.5) * this.shake * 0.3);
  },
  toggleView() {
    if (this.mode === 'parkour') return;
    this.cam.view = this.cam.view === 'first' ? 'third' : 'first';
    UI.toast(this.cam.view === 'first' ? 'First person view' : 'Third person view');
  },
  toggleFly() {
    if (this.mode !== 'creative') { if (this.mode === 'survival') UI.toast('Flying is only in Creative.'); return; }
    this.player.fly = !this.player.fly;
    UI.toast(this.player.fly ? 'Flying: Space to rise, Shift to sink.' : 'Flying off.');
  },

  // --- blocks: aim, mine, place ----------------------------------------------------------------
  raycast(maxD, withWater) {
    const w = this.world, eye = this.cam.eye, f = forwardVec(this.cam.yawI, this.cam.pitchI);
    let x = Math.floor(eye[0]), y = Math.floor(eye[1]), z = Math.floor(eye[2]);
    const sx = Math.sign(f[0]), sy = Math.sign(f[1]), sz = Math.sign(f[2]);
    const tdx = Math.abs(1 / f[0]), tdy = Math.abs(1 / f[1]), tdz = Math.abs(1 / f[2]);
    let tx = sx > 0 ? (x + 1 - eye[0]) * tdx : (eye[0] - x) * tdx;
    let ty = sy > 0 ? (y + 1 - eye[1]) * tdy : (eye[1] - y) * tdy;
    let tz = sz > 0 ? (z + 1 - eye[2]) * tdz : (eye[2] - z) * tdz;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 64 && t <= maxD; i++) {
      const id = w.get(x, y, z);
      if (id && (id !== B.water || (withWater && w.getMeta(x, y, z) === 0)) && id !== B.gate) return { x, y, z, nx, ny, nz, id, t };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  },
  reach() { return (this.mode === 'creative' ? 7 : 5) + (this.cam.view === 'third' ? this.cam.dist : 0); },
  interact(dt) {
    if (UI.open || this.cinemaMode) { this.mining = null; this.target = null; return; }
    const hit = this.raycast(this.reach());
    this.target = hit;
    this.placeCd -= dt; this.mineCd -= dt;
    const mineHeld = Input.mouse.left || Input.holdMine;
    if (mineHeld && hit) this.mineStep(hit, dt, Input.mouse.leftPress);
    else this.mining = null;
    const placeNow = Input.mouse.rightPress || Input.tapPlace || (Input.mouse.right && this.placeCd <= 0);
    if (placeNow) { this.placeCd = 0.22; this.useItem(hit); }
  },
  heldTool() { const s = this.slot(this.sel); return s && BLOCKS[s.id].toolKind ? BLOCKS[s.id] : null; },
  mineTime(id) {
    const d = BLOCKS[id];
    if (d.hardness === Infinity) return { time: Infinity, drop: false };
    if (this.mode === 'creative') return { time: 0, drop: false };
    const t = this.heldTool();
    let time = d.hardness, drop = true;
    const right = t && d.tool && t.toolKind === d.tool;
    if (d.tool === 'pick' && d.tier > 0 && (!right || t.toolTier < d.tier)) { time *= 4; drop = false; }
    else if (right) time /= t.toolSpeed;
    else if (d.tool) time *= 1.6;
    return { time: Math.max(0.05, time), drop };
  },
  mineStep(hit, dt, fresh) {
    const w = this.world, id = hit.id;
    const m = this.mining;
    if (!m || m.x !== hit.x || m.y !== hit.y || m.z !== hit.z) this.mining = { x: hit.x, y: hit.y, z: hit.z, p: 0 };
    const mt = this.mineTime(id);
    if (mt.time === Infinity) { if (fresh) UI.toast('That block can’t be broken.'); return; }
    this.swing = 1;
    if (mt.time === 0) { if (fresh || this.mineCd <= 0) { this.breakBlock(hit, false); this.mineCd = 0.2; } return; }
    this.mining.p += dt / mt.time;
    if (Math.random() < 0.25) { this.sound.play('dig', { block: id }); this.particles.burst(hit.x + 0.5 + hit.nx * 0.5, hit.y + 0.5 + hit.ny * 0.5, hit.z + 0.5 + hit.nz * 0.5, BLOCKS[id].color, 2, 1.5, 0.08); }
    if (this.mining.p >= 1) { this.breakBlock(hit, mt.drop); this.mining = null; }
  },
  breakBlock(hit, drop) {
    const w = this.world, id = w.get(hit.x, hit.y, hit.z), meta = w.getMeta(hit.x, hit.y, hit.z);
    w.set(hit.x, hit.y, hit.z, 0, 0, { quiet: true });
    this.particles.blockBreak(hit.x, hit.y, hit.z, id);
    this.sound.play('break', { block: id });
    if (drop) for (const [did, n] of this.dropsFor(id, meta)) this.drops.push(new ItemDrop(hit.x + 0.5, hit.y + 0.4, hit.z + 0.5, did, n));
  },
  dropsFor(id, meta) {
    const d = BLOCKS[id], out = [];
    if (d.leaves) {
      if (d.sapling && Math.random() < 0.07) out.push([B[d.sapling], 1]);
      if (id === B.leaves_oak && Math.random() < 0.05) out.push([B.apple, 1]);
      return out;
    }
    if (id === B.tallgrass) { if (Math.random() < 0.18) out.push([B.seeds, 1]); return out; }
    if (id === B.wheat) { if (meta >= 3) { out.push([B.wheat_item, 1]); out.push([B.seeds, 1 + (Math.random() < 0.5 ? 1 : 0)]); } else out.push([B.seeds, 1]); return out; }
    if (d.dropId >= 0) out.push([d.dropId, 1]);
    return out;
  },
  useItem(hit) {
    const w = this.world, s = this.slot(this.sel), d = s ? BLOCKS[s.id] : null;
    const sneak = Input.down('ShiftLeft', 'ShiftRight');
    if (hit && !sneak) {
      const tid = hit.id, td = BLOCKS[tid];
      if (td.bed) { this.useBed(hit); return; }
      if (tid === B.door || tid === B.door_top) {
        const by = tid === B.door ? hit.y : hit.y - 1;
        const m = w.getMeta(hit.x, by, hit.z) ^ 4;
        w.set(hit.x, by, hit.z, B.door, m, { quiet: true }); w.set(hit.x, by + 1, hit.z, B.door_top, m, { quiet: true });
        this.sound.play(m & 4 ? 'open' : 'close');
        return;
      }
      if (td.boom) { w.ignite(hit.x, hit.y, hit.z); UI.toast('Boom Block lit! Run!'); return; }
      if (tid === B.workbench && this.mode === 'survival') { UI.openPanel('inv'); return; }
    }
    if (!s) return;
    if (d.food) {
      if (this.mode === 'survival' && this.hp < 20) { this.hp = Math.min(20, this.hp + d.food); this.consume(1); this.sound.play('eat'); this.swing = 1; }
      else UI.toast('You are already at full health.');
      return;
    }
    if (d.bucket === 'empty') {
      const wh = this.raycast(this.reach(), true);
      if (wh && wh.id === B.water) {
        w.set(wh.x, wh.y, wh.z, 0, 0, { quiet: true }); this.sound.play('splash');
        this.consume(1); this.addItem(B.water_bucket, 1); this.swing = 1;
      }
      return;
    }
    if (s.id === B.fertilizer) {
      if (!hit) return;
      const td = BLOCKS[hit.id];
      if (td.grow && w.grow(hit.x, hit.y, hit.z)) { this.consume(1); this.particles.burst(hit.x + 0.5, hit.y + 0.6, hit.z + 0.5, [0.7, 1, 0.5], 14, 2.5); this.sound.play('grow'); }
      else if (hit.id === B.grass) {
        for (let k = 0; k < 10; k++) {
          const x = hit.x + Math.round((Math.random() - 0.5) * 6), z = hit.z + Math.round((Math.random() - 0.5) * 6);
          const y = w.topY(x, z);
          if (w.get(x, y, z) === B.grass && !w.get(x, y + 1, z)) w.set(x, y + 1, z, [B.rose, B.tulip, B.daisy, B.bluebell, B.tallgrass][k % 5], 0, { quiet: true });
        }
        this.consume(1); this.sound.play('grow');
      } else UI.toast('Use Fertilizer on a plant or on grass.');
      return;
    }
    if (!hit) return;
    if (!isPlaceable(d)) return;
    let placeId = d.places ? B[d.places] : (d.bucket === 'water' ? B.water : s.id);
    const pd = BLOCKS[placeId];
    let px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    if (BLOCKS[hit.id].replaceable) { px = hit.x; py = hit.y; pz = hit.z; }
    const cur = w.get(px, py, pz);
    if (!(cur === 0 || BLOCKS[cur].replaceable || (cur === B.water && placeId !== B.water))) return;
    if (!w.isLoaded(px, pz) || py < 1 || py >= CH - 1) return;
    const below = w.get(px, py - 1, pz);
    let meta = 0;
    if (pd.shape === 'cross' && pd.plant) {
      if (!isSoil(below, pd.soil || 'soil')) { UI.toast('Plant it on grass, dirt or farmland.'); return; }
      if (placeId === B.wheat && below !== B.farmland) w.set(px, py - 1, pz, B.farmland, 0, { quiet: true });
    }
    if (pd.torch || placeId === B.lantern || placeId === B.flowerpot) { if (!SOLIDT[below]) { UI.toast('Place it on top of a block.'); return; } }
    const yaw = this.cam.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const yawFace = Math.abs(fz) > Math.abs(fx) ? (fz < 0 ? 1 : 0) : (fx < 0 ? 3 : 2);
    if (placeId === B.ladder) meta = hit.nx === 1 ? 2 : hit.nx === -1 ? 3 : hit.nz === 1 ? 0 : hit.nz === -1 ? 1 : yawFace;
    if (placeId === B.door) {
      const up = w.get(px, py + 1, pz);
      if (!(up === 0 || BLOCKS[up].replaceable)) { UI.toast('A door needs two empty blocks.'); return; }
      if (this.blocked(px, py, pz) || this.blocked(px, py + 1, pz)) return;
      w.set(px, py, pz, B.door, yawFace); w.set(px, py + 1, pz, B.door_top, yawFace);
    } else {
      if ((pd.solid || placeId === B.door) && this.blocked(px, py, pz)) return;
      w.set(px, py, pz, placeId, meta);
      if (placeId === B.water) w.waterQ.add(`${px},${py},${pz}`);
    }
    if (this.mode === 'survival') {
      if (d.bucket === 'water') { this.consume(1); this.addItem(B.bucket, 1); }
      else this.consume(1);
    }
    this.sound.play(placeId === B.water ? 'splash' : 'place', { block: placeId });
    this.swing = 1;
  },
  blocked(x, y, z) {
    const hitB = b => b.x + b.hw > x && b.x - b.hw < x + 1 && b.y + b.h > y && b.y < y + 1 && b.z + b.hw > z && b.z - b.hw < z + 1;
    if (hitB(this.player)) return true;
    return this.animals.some(hitB) || this.villagers.some(hitB);
  },
  occupied(x, y, z) { return this.blocked(x, y, z); },
  useBed(hit) {
    this.spawnPoint = { x: hit.x + 0.5, y: hit.y + 1, z: hit.z + 0.5 };
    if (!this.isNight()) { UI.toast('Spawn point set. You can sleep once it gets dark.'); return; }
    this.bars(true); this.fade(1, 800); this.sound.play('sleep');
    this.state = 'sleep';
    setTimeout(() => {
      this.time = 0.02; this.day++;
      this.cineTitle('Good morning!', `Day ${this.day}`, '', 2800);
      this.fade(0, 1000); this.state = 'play';
      setTimeout(() => this.bars(false), 2000);
    }, 1400);
  },

  // --- inventory -------------------------------------------------------------------------
  slot(i) { return this.inv[i]; },
  selectSlot(i) {
    this.sel = i;
    UI.refreshHotbar();
    const s = this.slot(i);
    UI.showItemLabel(s ? BLOCKS[s.id].name : 'Empty hand');
    this.sound.play('click');
  },
  setHotbarItem(i, id) { this.inv[i] = { id, n: 1 }; this.selectSlot(i); },
  canPickup(id) { return this.mode === 'survival' && this.inv.some(s => !s || (s.id === id && s.n < BLOCKS[id].stack)); },
  addToRange(id, n, a, b) {
    const max = BLOCKS[id].stack;
    for (let i = a; i < b && n > 0; i++) { const s = this.inv[i]; if (s && s.id === id && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; } }
    for (let i = a; i < b && n > 0; i++) { if (!this.inv[i]) { const k = Math.min(n, max); this.inv[i] = { id, n: k }; n -= k; } }
    return n;
  },
  addItem(id, n) {
    const left = this.addToRange(id, n, 0, 36);
    if (left > 0) { const p = this.player; this.drops.push(new ItemDrop(p.x, p.y + 1, p.z, id, left)); }
    this.inventoryChanged();
  },
  giveBack(stack) { this.addItem(stack.id, stack.n); },
  pickup(drop) {
    this.addItem(drop.id, drop.n);
    this.sound.play('pop');
    UI.showItemLabel(`+${drop.n} ${BLOCKS[drop.id].name}`);
  },
  consume(n) {
    const s = this.inv[this.sel];
    if (!s || this.mode !== 'survival') return;
    s.n -= n;
    if (s.n <= 0) this.inv[this.sel] = null;
    this.inventoryChanged();
  },
  countItems(ids) { let n = 0; for (const s of this.inv) if (s && ids.includes(s.id)) n += s.n; return n; },
  canMake(r) { return r.ins.every(i => this.countItems(i.ids) >= i.n); },
  make(r, times = 1) {
    let made = 0;
    for (let t = 0; t < times && this.canMake(r); t++) {
      for (const ing of r.ins) {
        let need = ing.n;
        for (let i = 35; i >= 0 && need > 0; i--) {
          const s = this.inv[i];
          if (!s || !ing.ids.includes(s.id)) continue;
          const k = Math.min(need, s.n); s.n -= k; need -= k;
          if (!s.n) this.inv[i] = null;
        }
      }
      this.addToRange(r.outId, r.outN, 0, 36) && this.drops.push(new ItemDrop(this.player.x, this.player.y + 1, this.player.z, r.outId, 1));
      made++;
    }
    if (made) { this.sound.play('craft'); UI.toast(`Made ${BLOCKS[r.outId].name}${made > 1 ? ' × ' + made : ''}`); }
    this.inventoryChanged();
  },
  inventoryChanged() { UI.refreshHotbar(); },

  // --- life: animals and villagers -------------------------------------------------------------
  spawnLife() {
    const w = this.world, p = this.player;
    this.animals = this.animals.filter(a => Math.hypot(a.x - p.x, a.z - p.z) < 90);
    if (this.animals.length < 10 && !this.isNight()) {
      const a = Math.random() * TAU, d = 20 + Math.random() * 20;
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (w.isLoaded(x, z)) {
        const y = w.topY(x, z);
        if (w.get(x, y, z) === B.grass) {
          const kind = ['sheep', 'pig', 'chicken'][Math.floor(Math.random() * 3)];
          for (let k = 0; k < 2; k++) this.animals.push(new Animal(kind, x + 0.5 + k, y + 1, z + 0.5));
        }
      }
    }
    // villagers for nearby villages and cities
    const T = w.gen;
    for (let rx = Math.floor(p.x / REGION) - 1; rx <= Math.floor(p.x / REGION) + 1; rx++) for (let rz = Math.floor(p.z / REGION) - 1; rz <= Math.floor(p.z / REGION) + 1; rz++) {
      const r = T.regionInfo(rx, rz);
      const key = rx + ',' + rz;
      if (!r.type || this.spawnedRegions.has(key) || Math.hypot(r.cx - p.x, r.cz - p.z) > 110) continue;
      T.stamp(r);
      this.spawnedRegions.add(key);
      const rng = new RNG(hashString(key + w.seedStr));
      for (const n of (r.npcs || []).slice(0, 12)) {
        const v = new Body(n.x, n.y, n.z, 0.32, 1.45);
        v.look = beanLook(rng); v.home = [n.x, n.z]; v.timer = 0; v.dir = 0; v.moving = false; v.talkCd = rng.range(0, 6);
        v.name = rng.pick(BOT_NAMES);
        this.villagers.push(v);
      }
      if (Math.hypot(r.cx - p.x, r.cz - p.z) < 110) this.cineTitle(r.name, r.type === 'city' ? 'City' : 'Village', '', 3200);
    }
  },
  updateVillager(v, dt) {
    const w = this.world, p = this.player;
    if (!w.isLoaded(Math.floor(v.x), Math.floor(v.z)) || Math.hypot(v.x - p.x, v.z - p.z) > 100) return;
    v.timer -= dt; v.talkCd -= dt;
    if (v.timer <= 0) {
      v.moving = !v.moving && Math.random() < 0.6; v.timer = 1.5 + Math.random() * 3;
      v.dir = Math.random() * TAU;
      if (Math.hypot(v.x - v.home[0], v.z - v.home[1]) > 9) v.dir = Math.atan2(-(v.home[0] - v.x), -(v.home[1] - v.z));
    }
    const dist = Math.hypot(p.x - v.x, p.z - v.z);
    if (dist < 3 && v.talkCd <= 0 && this.state === 'play') {
      v.talkCd = 25; v.moving = false; v.timer = 3;
      UI.toast(`${v.name}: ${VILLAGER_LINES[Math.floor(Math.random() * VILLAGER_LINES.length)]}`);
      this.sound.play('talk');
    }
    const ctl = { mx: v.moving ? -Math.sin(v.dir) : 0, mz: v.moving ? -Math.cos(v.dir) : 0 };
    v.prevY = v.y;
    controlBody(v, ctl, { speed: 1.6, sprint: 1.6, jump: 8.6, accel: 10, air: 2 }, w, dt, {});
    if (v.hitWall && v.onGround) v.vy = 8.6;
    v.yawVis = dist < 3 ? Math.atan2(-(p.x - v.x), -(p.z - v.z)) : (v.yawTarget || 0);
  },
  near(b, d) { const e = this.cam.eye; return Math.hypot(b.x - e[0], b.z - e[2]) < d; },

  // --- world events ---------------------------------------------------------------------------------
  worldEvents() {
    const w = this.world;
    for (const ev of w.events) {
      const near = this.near(ev, 40);
      switch (ev.type) {
        case 'pop':
          if (near) this.particles.blockBreak(ev.x, ev.y, ev.z, ev.id);
          if (this.mode === 'survival') for (const [id, n] of this.dropsFor(ev.id, 0)) this.drops.push(new ItemDrop(ev.x + 0.5, ev.y + 0.3, ev.z + 0.5, id, n));
          break;
        case 'grow': if (near) { this.particles.burst(ev.x + 0.5, ev.y + 0.5, ev.z + 0.5, [0.7, 1, 0.5], 6, 1.5); this.sound.play('grow'); } break;
        case 'growBig': if (near) { this.sound.play('growBig'); this.particles.burst(ev.x + 0.5, ev.y + 1, ev.z + 0.5, [1, 0.95, 0.5], 30, 4); if (ev.label) UI.toast(`It grew into a ${ev.label}!`); } break;
        case 'build': if (near && Math.random() < 0.3) this.sound.play('place', { block: ev.id }); break;
        case 'crumble': if (near) { this.particles.blockBreak(ev.x, ev.y, ev.z, B.crumble); this.sound.play('break', { block: B.sand }); } break;
        case 'fuse': if (near) this.sound.play('fuse'); break;
        case 'explode': {
          const p = this.player, d = Math.hypot(p.x - ev.x, p.y - ev.y, p.z - ev.z);
          this.particles.burst(ev.x + 0.5, ev.y + 0.5, ev.z + 0.5, [1, 0.7, 0.3], 40, 9, 0.18, 6, 0.8);
          this.particles.burst(ev.x + 0.5, ev.y + 0.5, ev.z + 0.5, [0.4, 0.4, 0.42], 30, 5, 0.3, 2, 1.5);
          if (d < 50) { this.sound.play('explode'); this.shake = clamp(1.2 - d / 25, 0.15, 1); }
          if (d < ev.r + 2.5) { p.vy = 9; p.vx += Math.sign(p.x - ev.x) * 8; p.vz += Math.sign(p.z - ev.z) * 8; this.hurt(Math.ceil(8 - d * 1.5), 'A Boom Block went off.'); }
          break;
        }
        case 'debris': if (near) this.particles.blockBreak(ev.x, ev.y, ev.z, ev.id); break;
        default: break;
      }
    }
    w.events.length = 0;
  },

  // --- parkour ------------------------------------------------------------------------------------
  makeEntrants(n) {
    const rng = new RNG(Math.floor(Math.random() * 1e9));
    const names = rng.shuffle(BOT_NAMES.slice());
    const list = [{ name: 'You', look: Object.assign(beanLook(rng, '#2fb4a4'), { hat: 'cap', hatColor: [1, 0.8, 0.25] }), skill: 1, isPlayer: true }];
    for (let i = 0; i < n - 1; i++) list.push({ name: names[i], look: beanLook(rng), skill: rng.range(0.45, 0.98), isPlayer: false });
    return list;
  },
  startPractice(def) {
    this.cup = null;
    this.startRace(def, { qualify: 0, entrants: this.makeEntrants(12), round: 0, roundName: 'Practice' });
  },
  startCup() {
    const defs = new RNG(Date.now() >>> 0).shuffle(COURSES.slice()).slice(0, 3);
    this.cup = { round: 0, defs, rounds: [{ name: 'Round 1', qualify: 8 }, { name: 'Round 2', qualify: 4 }, { name: 'Final', qualify: 1 }], entrants: this.makeEntrants(12) };
    this.startCupRound();
  },
  startCupRound() {
    const c = this.cup, R = c.rounds[c.round];
    this.startRace(c.defs[c.round], { qualify: R.qualify, entrants: c.entrants, round: c.round, roundName: R.name });
  },
  startRace(def, opts) {
    this.sound.init();
    UI.closeResults();
    UI.showLoading(true, 'Building the course…');
    this.state = 'loading';
    setTimeout(() => {
      if (this.world) for (const c of this.world.chunks.values()) this.r.freeChunk(c);
      this.mode = 'parkour';
      opts.seed = def.random ? Math.floor(Math.random() * 1e9) : 1;
      const race = new Race(this, def, opts);
      this.race = race;
      this.world = race.world;
      this.player = race.player;
      this.drops = []; this.animals = []; this.villagers = []; this.particles.list.length = 0;
      for (const c of this.world.chunks.values()) { this.world.dirty.delete(CK(c.cx, c.cz)); this.r.uploadChunk(c, buildChunkMesh(this.world, c)); }
      this.world.urgent.clear();
      this.time = def.id === 'tower' ? 0.42 : def.id === 'belts' ? 0.05 : 0.2;
      this.cam.yaw = Math.PI; this.cam.pitch = -0.32;
      UI.setMode('parkour');
      document.body.classList.add('playing');
      UI.showLoading(false); UI.hideTitle();
      UI.showHUD(false);
      this.state = 'race';
      Input.enabled = true;
      this.raceIntro();
    }, 40);
  },
  raceIntro() {
    const race = this.race, wps = race.course.wps;
    race.camOverride = true;
    this.bars(true);
    const sub = race.qualify ? `${race.opts.roundName} · top ${race.qualify} go through` : race.def.desc;
    this.cineTitle(race.def.name, sub, '', 4200);
    this.sound.play('discover');
    race.intro = { t: 0, dur: 5.2 };
  },
  updateRace(dt) {
    const race = this.race;
    if (!race) return;
    const cam = this.cam;
    if (race.intro) {
      // fly from the finish back to the start
      const I = race.intro; I.t += dt;
      const u = easeInOut(clamp(I.t / I.dur, 0, 1));
      const z = lerp(race.course.finishZ + 6, 4, u);
      const wp = race.course.wps.reduce((a, w) => (Math.abs(w.z - z) < Math.abs(a.z - z) ? w : a), race.course.wps[0]);
      cam.eye = [10 - u * 8, wp.y + 9 - u * 3, z - 12 + u * 2];
      const look = [0.5, wp.y, z + 4];
      cam.yawI = Math.atan2(-(look[0] - cam.eye[0]), -(look[2] - cam.eye[2]));
      cam.pitchI = Math.atan2(look[1] - cam.eye[1], Math.hypot(look[0] - cam.eye[0], look[2] - cam.eye[2]));
      if (Input.was('Escape', 'Space', 'Enter') || Input.mouse.leftPress || Input.tapPlace) I.t = I.dur;
      if (I.t >= I.dur) { race.intro = null; race.camOverride = false; this.bars(false); this.beginCountdown(); }
    }
    if (this.state === 'race' && !UI.open) {
      if (Input.was('Escape')) UI.openPanel('pause');
      if (Input.was('KeyR') && race.state === 'run') race.respawn(race.player);
      if (Input.was('KeyH')) UI.openPanel('help');
    }
    const inp = Input.state();
    const v = this.wish(inp);
    race.update(dt, { mx: v.mx, mz: v.mz, jump: inp.jump, jumpHeld: inp.jumpHeld });
    if (race.orbit) {
      race.orbit.t += dt;
      const p = race.player, a = race.orbit.t * 0.5 + race.orbit.a0;
      cam.eye = [p.x + Math.sin(a) * 6, p.y + 2.6, p.z + Math.cos(a) * 6];
      cam.yawI = Math.atan2(-(p.x - cam.eye[0]), -(p.z - cam.eye[2]));
      cam.pitchI = -0.25;
    }
    this.particles.update(dt, this.world);
    this.world.timerStep(dt, (x, y, z) => race.racers.some(r => r.x + r.hw > x && r.x - r.hw < x + 1 && r.y < y + 1.01 && r.y + r.h > y && r.z + r.hw > z && r.z - r.hw < z + 1));
    this.worldEvents();
  },
  beginCountdown() {
    const race = this.race;
    race.state = 'countdown';
    UI.showHUD(true);
    const steps = ['3', '2', '1'];
    steps.forEach((s, i) => setTimeout(() => { if (this.race === race) { UI.countdown(s); this.sound.play('countdown'); } }, i * 850));
    setTimeout(() => {
      if (this.race !== race) return;
      UI.countdown('GO!', true); this.sound.play('go');
      race.openGate(); race.state = 'run';
      UI.toast(Input.isTouch ? 'Drag left to run, tap ▲ to jump.' : 'WASD to run, Space to jump, mouse to look.');
    }, steps.length * 850);
  },
  onPlayerFinished(race, r) {
    this.slowMo = 0.9;
    this.bars(true);
    const q = race.qualify;
    let main, cls = 'win';
    if (q) main = r.place <= q ? (q === 1 ? 'CHAMPION!' : 'QUALIFIED!') : 'Too slow!';
    else main = `${ordinal(r.place)} place!`;
    if (q && r.place > q) cls = 'lose';
    this.cineTitle(main, `Time ${formatTime(r.time)}`, cls, 3600);
    race.orbit = { t: 0, a0: Math.random() * TAU };
    race.camOverride = true;
    if (!q) {
      const best = Store.get('pr3d.parkour', {}), prev = best[race.def.id];
      if (!prev || r.place < prev.place || (r.place === prev.place && r.time < prev.time)) { best[race.def.id] = { place: r.place, time: r.time }; Store.set('pr3d.parkour', best); }
    }
  },
  onRaceOver(race) {
    setTimeout(() => {
      if (this.race !== race) return;
      this.bars(false);
      Input.releaseLock();
      const p = race.player, place = race.placeOf(p);
      if (!this.cup) {
        UI.showResults(race, { title: p.finished ? `${ordinal(p.place)} place!` : 'Race over', sub: `${race.def.name}${p.finished ? ' · ' + formatTime(p.time) : ''}`, next: false });
        return;
      }
      const c = this.cup, R = c.rounds[c.round];
      const qualified = p.finished && p.place <= R.qualify;
      c.entrants = race.racers.filter(x => x.finished && x.place <= R.qualify).map(x => ({ name: x.name, look: x.look, skill: x.skill, isPlayer: x.isPlayer }));
      if (qualified && c.round === c.rounds.length - 1) {
        Store.set('pr3d.cups', Store.get('pr3d.cups', 0) + 1);
        UI.showResults(race, { title: 'You won the Knockout Cup!', sub: 'The crown is yours.', next: false, againLabel: 'Play another cup' });
        this.sound.play('qualify');
      } else if (qualified) {
        UI.showResults(race, { title: 'Qualified!', sub: `${R.name} done. ${R.qualify} racers go through.`, next: true, nextLabel: `Go to ${c.rounds[c.round + 1].name}` });
      } else {
        UI.showResults(race, { title: 'Eliminated', sub: `You placed ${ordinal(place)}. Only the top ${R.qualify} went through.`, next: false, againLabel: 'Try another cup' });
        this.sound.play('eliminated');
      }
    }, race.player.finished ? 2200 : 600);
  },
  resultsAction(a) {
    UI.closeResults();
    if (a === 'menu') { this.quitToTitle(); return; }
    if (a === 'next' && this.cup) { this.cup.round++; this.startCupRound(); return; }
    if (this.cup) this.startCup(); else this.startPractice(this.race.def);
  },

  // --- saving & misc ------------------------------------------------------------------------------
  saveNow(silent) {
    if (!this.world || this.mode === 'parkour' || this.mode === 'title' || !['play', 'menu', 'dead'].includes(this.state)) return;
    const ok = Save.write(this);
    if (!silent) UI.toast(ok ? 'World saved.' : 'Couldn’t save: your browser’s storage is full or turned off.');
  },
  isNight() { return Math.sin(this.time * TAU) < -0.08; },
  locationName() {
    const p = this.player, w = this.world;
    if (!w.gen) return '';
    const r = w.gen.regionAt(p.x, p.z);
    if (r.type && Math.hypot(p.x - r.cx, p.z - r.cz) < r.r * 1.2) return r.name;
    if (p.y < w.gen.height(Math.floor(p.x), Math.floor(p.z)) - 6) return 'Underground';
    return BIOMES[w.gen.biome(Math.floor(p.x), Math.floor(p.z))];
  },

  // --- rendering ------------------------------------------------------------------------------------
  sky() {
    const a = this.time * TAU, sy = Math.sin(a);
    const day = smoothstep(-0.12, 0.22, sy), tw = smoothstep(0.38, 0, Math.abs(sy));
    const mix = (c1, c2, t) => c1.map((v, i) => v + (c2[i] - v) * t);
    let top = mix([0.02, 0.03, 0.08], [0.32, 0.56, 0.94], day);
    top = mix(top, [0.3, 0.3, 0.6], tw * 0.5);
    let hor = mix([0.05, 0.07, 0.15], [0.7, 0.85, 1.0], day);
    hor = mix(hor, [1.0, 0.6, 0.38], tw * 0.7);
    const sun = [Math.cos(a), sy, 0.3]; const l = Math.hypot(...sun);
    return { top, hor, sun: sun.map(v => v / l), sunCol: mix([1, 0.55, 0.3], [1, 0.96, 0.82], clamp(sy * 3, 0, 1)), day: 0.13 + 0.87 * day, night: 1 - day };
  },
  render() {
    const r = this.r, w = this.world, cam = this.cam, p = this.player;
    const s = this.sky();
    const third = this.mode === 'parkour' || cam.view === 'third' || this.cinemaMode || this.state === 'title' || this.state === 'intro';
    const headWater = w.get(Math.floor(cam.eye[0]), Math.floor(cam.eye[1]), Math.floor(cam.eye[2])) === B.water;
    const far = this.mode === 'parkour' ? 170 : (this.state === 'title' ? 70 : this.viewRadius() * CS);
    const F = {
      eye: cam.eye, yaw: cam.yawI !== undefined ? cam.yawI : cam.yaw, pitch: cam.pitchI !== undefined ? cam.pitchI : cam.pitch,
      fov: 1.22, far: headWater ? 22 : far, fog: headWater ? [0.1, 0.25, 0.5] : s.hor, skyTop: s.top, sun: s.sun, sunCol: s.sunCol,
      night: s.night, day: s.day, time: w.clock,
    };
    r.begin(F);
    r.drawWorld(w);
    r.beginBoxes();
    const L = b => {
      if (this.mode === 'parkour') return s.day;
      const top = w.topY(Math.floor(b.x), Math.floor(b.z));
      return b.y + 1 >= top ? s.day : 0.25 * s.day + 0.15;
    };
    if (this.mode === 'parkour' && this.race) {
      r.boxAt(cam.eye[0], 16, cam.eye[2] + 40, 1600, 0.2, 1600, [0.3, 0.62, 0.95], s.day);
      for (const o of this.race.obstacles) o.draw(r, s.day);
      for (const rc of this.race.racers) if (!rc.out) drawBean(r, rc, rc.look, s.day);
    } else {
      for (const a of this.animals) if (this.near(a, far)) a.draw(r, L(a));
      for (const v of this.villagers) if (this.near(v, far)) drawBean(r, v, v.look, L(v));
      if (third && this.state !== 'title' && this.state !== 'intro') { const s0 = this.slot(this.sel); drawBean(r, p, p.look, L(p), { held: s0 ? s0.id : undefined }); }
    }
    r.beginBoxes();
    this.particles.draw(r, s.day);
    for (const d of this.drops) d.draw(r, L(d), 0);
    if (this.target && this.state === 'play' && !this.cinemaMode) {
      const t = this.target;
      r.outline(t.x, t.y, t.z);
      if (this.mining && this.mining.p > 0) r.crack(t.x, t.y, t.z, Math.min(3, Math.floor(this.mining.p * 4)));
    }
    r.drawWater(w);
    r.drawClouds();
    if (!third && this.state === 'play' && !this.cinemaMode) {
      const sl = this.slot(this.sel);
      const bob = p.onGround ? Math.sin(p.walk * 3.2) * 0.03 * Math.min(1, Math.hypot(p.vx, p.vz) / 4) : 0;
      if (sl) r.held(sl.id, this.swing, bob, L(p), 0);
    }
  },
};

window.addEventListener('load', () => game.boot());
