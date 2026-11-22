'use strict';
// ---------------------------------------------------------------------------
// Game: state machine, main loop, interaction, ambient life and glue code.
// ---------------------------------------------------------------------------

const STEP = 1 / 60;
const REACH = 8;
const NO_INPUT = { left: false, right: false, up: false, down: false, jumpHeld: false, jumpPressed: false, sprint: false };
const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULT_HOTBAR = ['planks_oak', 'stonebricks', 'glass', 'door', 'torch', 'water', 'wheat', 'sap_oak', 'houseseed'];

const game = {
  state: 'boot', world: null, player: null, entities: [], fx: new FX(), sound: Sound,
  renderer: null, cine: null, parkour: null,
  cam: { x: 0, y: 0, zoomMul: 1, targetZoomMul: 1, bs: 32 }, userZoom: 1,
  time: 0.04, day: 1, clock: 0, dt: 0.016, slowMo: 0, acc: 0, lastT: 0,
  weather: { rain: 0, target: 0, timer: 240 },
  hotbar: [], sel: 0, wallMode: false, touchMode: 'mine',
  target: null, mining: null, placeCd: 0, placeHeld: false, lastPlaceKey: null,
  doorsOpen: new Set(), discovered: new Set(), spawnPoint: null,
  shakeAmt: 0, cinematicAmt: 0, cinemaMode: false, hidePlayer: false, teleporting: false,
  tick: { water: 0, grow: 0, ambient: 0, save: 0, zone: 0 },
  DAY_LEN: 600,

  boot() {
    initBlocks();
    this.renderer = new Renderer(document.getElementById('game'));
    Input.init(this.renderer.canvas);
    this.fx.onPop = () => this.sound.play('pop');
    this.cine = new Cinema(this);
    const st = Store.get('pixelrealms.settings', {});
    if (st.sound === false) this.sound.setEnabled(false);
    if (st.music === false) this.sound.setMusic(false);
    if (st.zoom) this.userZoom = clamp(st.zoom, 0.6, 1.8);
    this.hotbar = DEFAULT_HOTBAR.map(k => B[k]);
    UI.init(this);
    this.showTitle(null);
    document.addEventListener('visibilitychange', () => { if (document.hidden && (this.state === 'play' || this.state === 'menu')) this.saveNow(true); });
    requestAnimationFrame(t => this.loop(t));
  },
  saveSettings() { Store.set('pixelrealms.settings', { sound: this.sound.enabled, music: this.sound.musicOn, zoom: this.userZoom }); },

  // --- screens -------------------------------------------------------------------
  showTitle(world) {
    this.state = 'title';
    if (!world) {
      world = generateWorld(randomSeed());
      this.setupWorld(world, null);
    }
    this.hidePlayer = true;
    this.parkour.active = null;
    UI.hideParkour();
    this.cinemaMode = false; this.cine.bars(false);
    const v = world.zones.find(z => z.type === 'village' && z.x0 > world.spawn.x);
    this.titlePath = { x0: (v ? v.x0 : world.spawn.x) - 10, x1: world.spawn.x + 650 };
    this.cam.x = this.titlePath.x0; this.cam.y = this.groundAt(this.cam.x) - 8; this.cam.zoomMul = 0.85;
    this.time = 0.33;
    UI.showTitle();
  },

  newWorld(seedStr) {
    this.sound.init();
    this.sound.play('click');
    UI.showLoading(true);
    this.state = 'loading';
    setTimeout(() => {
      const w = generateWorld(seedStr);
      this.setupWorld(w, null);
      this.hidePlayer = false;
      UI.showLoading(false);
      UI.hideTitle();
      this.cine.fade(1, 0);
      this.cine.playIntro();
    }, 50);
  },

  continueWorld() {
    const data = Save.read();
    if (!data) return;
    this.sound.init();
    UI.showLoading(true);
    this.state = 'loading';
    setTimeout(() => {
      const w = generateWorld(data.seed);
      Save.apply(w, data);
      this.setupWorld(w, data);
      this.hidePlayer = false;
      UI.showLoading(false);
      UI.hideTitle();
      this.cine.fade(1, 0);
      setTimeout(() => this.cine.fade(0, 700), 50);
      this.startPlaying(false);
      this.cine.zoneTitle('Welcome back', `Day ${this.day} · Seed ${w.seedStr}`);
    }, 50);
  },

  setupWorld(world, data) {
    this.world = world;
    this.fx.clear();
    this.player = new Player(world.spawn.x, world.spawn.y);
    this.parkour = new Parkour(this);
    this.entities = [];
    this.spawnCreatures();
    this.time = 0.04; this.day = 1;
    this.weather = { rain: 0, target: 0, timer: 240 + Math.random() * 120 };
    this.discovered = new Set();
    this.spawnPoint = null;
    this.wallMode = false;
    this.cinemaMode = false;
    this.hotbar = DEFAULT_HOTBAR.map(k => B[k]);
    this.sel = 0;
    if (data) {
      this.player.x = data.player.x; this.player.y = data.player.y; this.player.fly = !!data.player.fly;
      this.time = data.time || 0.04; this.day = data.day || 1;
      if (Array.isArray(data.hotbar)) data.hotbar.forEach((k, i) => { if (B[k] !== undefined && i < 9) this.hotbar[i] = B[k]; });
      this.sel = clamp(data.sel || 0, 0, 8);
      this.discovered = new Set(data.discovered || []);
      this.spawnPoint = data.spawnPoint || null;
    }
    this.player.heldTi = BLOCKS[this.hotbar[this.sel]].iconTi;
    this.cam.x = this.player.x; this.cam.y = this.player.y - 1.4; this.cam.zoomMul = 1; this.cam.targetZoomMul = 1;
    UI.refreshHotbar(); UI.updateToggles(); UI.updateMenu();
  },

  spawnCreatures() {
    const w = this.world, rng = new RNG(w.seed ^ 0x5eed);
    for (const s of w.npcSpawns) {
      if (s.kind === 'animal') this.entities.push(new Animal(Object.assign({}, s, { y: this.groundAt(s.x) })));
      else this.entities.push(new NPC(s, rng));
    }
    for (const road of w.roads) for (let k = 0; k < 9; k++) this.entities.push(new Car(road, rng));
  },

  startPlaying(fresh) {
    this.state = 'play';
    this.hidePlayer = false;
    UI.showHUD(true);
    this.tick.zone = 1;
    if (fresh) {
      const touch = Input.touch.isTouch;
      setTimeout(() => UI.toast(touch ? 'Use ◀ ▶ to walk and ▲ to jump. Tap the world to dig.' : 'Walk with A and D, jump with Space. Left click digs, right click builds.'), 700);
      setTimeout(() => UI.toast(touch ? 'Switch Dig / Build above the hotbar. Tap the bag for all blocks.' : 'Press E for every block, M for the map, and H for help.'), 4300);
    }
  },

  quitToTitle() {
    this.saveNow(true);
    this.cine.flash(() => this.showTitle(this.world), 400);
  },

  // --- main loop ---------------------------------------------------------------------
  loop(now) {
    const dt = Math.min(0.1, (now - (this.lastT || now)) / 1000);
    this.lastT = now;
    this.dt = dt;
    const running = this.state === 'play' || this.state === 'intro' || this.state === 'title';
    if (running && this.world) {
      if (this.slowMo > 0) this.slowMo -= dt;
      this.acc += dt * (this.slowMo > 0 ? 0.45 : 1);
      let steps = 0;
      while (this.acc >= STEP && steps < 6) { this.update(STEP); this.acc -= STEP; steps++; }
      if (steps >= 6) this.acc = 0;
      if (steps > 0) Input.endFrame();
    } else {
      this.menuKeys();
      Input.endFrame();
    }
    if (this.world) {
      this.updateCamera(dt);
      this.renderer.render(this);
      UI.updateHUD(dt);
    }
    this.sound.musicTick();
    requestAnimationFrame(t => this.loop(t));
  },

  update(dt) {
    const w = this.world, p = this.player;
    this.clock += dt;
    w.clock += dt;
    w.focusX = this.state === 'title' ? this.cam.x : p.x;
    if (this.state === 'play') this.time += dt / this.DAY_LEN;
    else if (this.state === 'title') this.time += dt / 110;
    if (this.time >= 1) { this.time -= 1; this.day++; }
    this.updateWeather(dt);
    this.sound.night = this.isNight();

    if (UI.open) this.menuKeys();
    else if (this.state === 'play') this.keys();
    if (this.state === 'intro') {
      if (Input.was('Escape', 'Space', 'Enter')) this.cine.skipIntro();
      this.cine.updateIntro(dt);
    }
    if (this.state !== 'title' && !this.teleporting) {
      p.update(dt, this.state === 'play' ? Input.state() : NO_INPUT, w, this);
      this.parkour.update(dt);
    }
    const cx = this.cam.x;
    for (const e of this.entities) if (Math.abs(e.x - cx) < 110) e.update(dt, w, this);

    this.tick.water += dt;
    if (this.tick.water >= 1 / 12) { w.waterStep(); this.tick.water = 0; }
    this.tick.grow += dt;
    if (this.tick.grow >= 0.5) { w.growStep(this.tick.grow, { night: this.isNight(), rain: this.weather.rain > 0.5 }); this.tick.grow = 0; }
    w.timerStep(dt, (x, y) => this.occupied(x, y));
    w.jobStep(dt);
    this.worldEvents();
    this.fx.update(dt, w);
    if (this.state === 'play') this.interact(dt);
    this.updateDoors();
    this.tick.ambient += dt;
    if (this.tick.ambient >= 0.4) { this.ambient(); this.tick.ambient = 0; }
    if (this.state === 'play') {
      this.tick.zone += dt;
      if (this.tick.zone >= 0.5) { this.checkZone(); this.tick.zone = 0; }
      this.tick.save += dt;
      if (this.tick.save >= 60) { this.saveNow(true); this.tick.save = 0; }
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.6);
  },

  updateCamera(dt) {
    const cam = this.cam, w = this.world;
    const base = clamp(Math.min(window.innerWidth / (16 * 44), window.innerHeight / (16 * 26)), 1, 3.2);
    if (this.state === 'play' || this.state === 'menu' || this.state === 'loading') {
      const p = this.player;
      const tx = p.x + clamp(p.vx, -12, 12) * 0.22;
      const ty = p.y - 1.4 + (p.vy > 10 ? Math.min(4, (p.vy - 10) * 0.25) : 0);
      const k = 1 - Math.exp(-dt * (this.cinemaMode ? 2.2 : 6.5));
      const ky = 1 - Math.exp(-dt * (this.cinemaMode ? 2 : 5));
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * ky;
      const zt = this.cinemaMode ? 1.2 : cam.targetZoomMul;
      cam.zoomMul += (zt - cam.zoomMul) * (1 - Math.exp(-dt * 3));
    } else if (this.state === 'title' && this.titlePath) {
      cam.x += dt * 3.4;
      if (cam.x > this.titlePath.x1) cam.x = this.titlePath.x0;
      const gy = this.groundAt(cam.x) - 7;
      cam.y += (gy - cam.y) * (1 - Math.exp(-dt * 0.8));
    }
    cam.bs = 16 * base * this.userZoom * cam.zoomMul * this.renderer.dpr;
    const halfW = this.renderer.W / cam.bs / 2, halfH = this.renderer.H / cam.bs / 2;
    cam.x = clamp(cam.x, halfW, w.W - halfW);
    cam.y = clamp(cam.y, halfH, w.H - halfH);
    const want = this.cinemaMode || this.state === 'intro' ? 1 : 0;
    this.cinematicAmt += (want - this.cinematicAmt) * (1 - Math.exp(-dt * 3));
  },

  // --- keys ------------------------------------------------------------------------
  keys() {
    if (Input.was('Escape')) { if (this.cinemaMode) this.setCinema(false); else UI.openPanel('pause'); return; }
    if (Input.was('KeyE', 'KeyI', 'KeyB')) { UI.openPanel('inv'); return; }
    if (Input.was('KeyM')) { UI.openPanel('map'); return; }
    if (Input.was('KeyH', 'F1')) { UI.openPanel('help'); return; }
    if (Input.was('KeyF')) this.toggleFly();
    if (Input.was('Tab')) this.toggleWall();
    if (Input.was('KeyC')) this.setCinema(!this.cinemaMode);
    if (Input.was('KeyR')) this.retry();
    for (let i = 1; i <= 9; i++) if (Input.was('Digit' + i, 'Numpad' + i)) this.selectSlot(i - 1);
    if (Input.mouse.wheel) this.selectSlot((this.sel + Input.mouse.wheel + 9) % 9);
    if (Input.was('Equal', 'NumpadAdd', 'ZoomIn')) this.zoom(1.12);
    if (Input.was('Minus', 'NumpadSubtract', 'ZoomOut')) this.zoom(1 / 1.12);
    if (Input.was('MousePick')) this.pickBlock();
  },
  menuKeys() {
    if (!UI.open) return;
    if (Input.was('Escape')) UI.closePanels();
    else if (Input.was('KeyE') && UI.open === 'inv' && document.activeElement !== UI.el.search) UI.closePanels();
    else if (Input.was('KeyM') && UI.open === 'map') UI.closePanels();
    else if (Input.was('KeyH') && UI.open === 'help') UI.closePanels();
  },

  // --- interaction ----------------------------------------------------------------------
  interact(dt) {
    const m = Input.mouse, t = Input.touch, w = this.world, p = this.player;
    this.placeCd -= dt;
    const touch = t.isTouch;
    if (!m.inside || (touch && !t.world && !t.worldPressed)) { this.target = null; this.mining = null; this.placeHeld = false; return; }
    const wp = this.renderer.toWorld(m.x, m.y);
    const tx = Math.floor(wp.x), ty = Math.floor(wp.y);
    const dist = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - (p.y - 0.9));
    const ok = dist <= REACH && w.inb(tx, ty);
    const item = this.hotbar[this.sel], d = BLOCKS[item];
    const cur = w.get(tx, ty);
    const empty = this.wallMode ? w.getBg(tx, ty) === 0 && !BLOCKS[cur].opaque : (cur === B.air || BLOCKS[cur].replaceable || (cur === B.water && !d.liquid));
    const preview = empty && !d.item && !d.liquid ? d.ti[0] : -1;
    this.target = { x: tx, y: ty, ok, preview };
    const wantMine = touch ? this.touchMode === 'mine' : (m.left || m.leftPress);
    const wantPlace = touch ? this.touchMode === 'build' : (m.right || m.rightPress);
    if (wantMine && ok) this.mineStep(tx, ty, dt); else this.mining = null;
    if (wantPlace && ok) {
      const key = tx + ',' + ty;
      const fresh = !this.placeHeld;
      if (fresh || (key !== this.lastPlaceKey && this.placeCd <= 0)) { this.useAt(tx, ty, fresh); this.placeCd = 0.08; this.lastPlaceKey = key; }
      this.placeHeld = true;
    } else { this.placeHeld = false; this.lastPlaceKey = null; }
  },

  mineStep(tx, ty, dt) {
    const w = this.world, p = this.player;
    let id = w.get(tx, ty), layer = 'fg';
    if (this.wallMode || id === B.air) {
      const b = w.getBg(tx, ty);
      if (b && !BLOCKS[id].opaque && (this.wallMode || id === B.air)) { layer = 'bg'; id = b; }
      else { this.mining = null; return; }
    }
    if (layer === 'fg' && id === B.water) {
      w.set(tx, ty, B.air);
      this.fx.splash(tx + 0.5, ty + 0.5); this.sound.play('splash');
      return;
    }
    const d = BLOCKS[id];
    if (d.hardness === Infinity) {
      if (!this.mining || this.mining.x !== tx || this.mining.y !== ty) UI.toast('Bedrock can’t be broken.');
      this.mining = { x: tx, y: ty, layer, progress: 0, id };
      return;
    }
    if (!this.mining || this.mining.x !== tx || this.mining.y !== ty || this.mining.layer !== layer) this.mining = { x: tx, y: ty, layer, progress: 0, id };
    this.mining.progress += dt / Math.max(0.04, d.hardness);
    p.mineT = 0.25;
    p.facing = tx + 0.5 > p.x ? 1 : -1;
    if (Math.random() < 0.25) { this.sound.play('dig', { block: id }); this.fx.debris(tx, ty, id, 1); }
    if (this.mining.progress >= 1) { this.breakBlock(tx, ty, layer); this.mining = null; }
  },

  breakBlock(tx, ty, layer) {
    const w = this.world;
    if (layer === 'bg') {
      const id = w.getBg(tx, ty);
      w.setBg(tx, ty, 0);
      this.fx.debris(tx, ty, id, 6); this.sound.play('break', { block: id });
      return;
    }
    const id = w.get(tx, ty), d = BLOCKS[id], m = w.getMeta(tx, ty);
    w.set(tx, ty, B.air);
    this.fx.debris(tx, ty, id, 10);
    this.sound.play('break', { block: id });
    if (d.plant && d.plant.stages > 1 && m >= d.plant.stages - 1 && d.plant.final === 'stay') {
      this.fx.text(tx + 0.5, ty, '+1 ' + d.name.replace(' Seeds', ''), '#fff6a0');
      this.fx.sparkle(tx, ty, 6);
    }
  },

  useAt(tx, ty, fresh) {
    const w = this.world, p = this.player;
    const item = this.hotbar[this.sel], d = BLOCKS[item];
    const cur = w.get(tx, ty), cd = BLOCKS[cur];
    if (fresh && !this.wallMode) {
      if (cd.bed) { this.useBed(tx, ty); return; }
      if (cd.boom) { w.ignite(tx, ty); UI.toast('Boom Block lit! Stand back.'); return; }
    }
    if (item === B.fertilizer) { if (fresh) this.fertilize(tx, ty); return; }
    if (this.wallMode) {
      if (!(d.render === 'tile' || d.render === 'anim') || !d.solid || d.platform || d.plant || d.item || d.liquid || d.door) {
        if (fresh) UI.toast('Only full blocks can be used as back walls.');
        return;
      }
      if (w.getBg(tx, ty) || cd.opaque) return;
      w.setBg(tx, ty, item);
      this.sound.play('place', { block: item }); p.placeT = 0.15;
      return;
    }
    if (d.liquid) {
      if (w.addWater(tx, ty)) { this.sound.play('splash'); this.fx.splash(tx + 0.5, ty + 0.8); p.placeT = 0.15; }
      return;
    }
    if (!(cur === B.air || cd.replaceable || cur === B.water)) return;
    if (d.plant) {
      if (cur === B.water) { if (fresh) UI.toast('Plants can’t grow underwater.'); return; }
      if (!plantSupported(item, w.get(tx, ty + 1))) { if (fresh) { UI.toast(soilHint(d)); this.sound.play('error'); } return; }
    }
    if (d.door) {
      const above = w.get(tx, ty - 1);
      if (!(above === B.air || BLOCKS[above].replaceable)) { if (fresh) UI.toast('A door needs two empty blocks, one above the other.'); return; }
      w.set(tx, ty, B.door); w.set(tx, ty - 1, B.door_top);
    } else {
      if (d.solid && this.occupied(tx, ty)) return;
      w.set(tx, ty, item, 0);
    }
    this.sound.play('place', { block: item });
    p.placeT = 0.15;
    if (d.plant) this.fx.sparkle(tx, ty + 0.3, 4, '#c8ff9a');
  },

  fertilize(tx, ty) {
    const w = this.world, i = w.idx(tx, ty), id = w.get(tx, ty), d = BLOCKS[id];
    if (d.plant) {
      if (plantGrows(d, w.getMeta(tx, ty))) {
        w.advancePlant(i, true);
        this.fx.sparkle(tx, ty, 16, '#b6ff8a'); this.sound.play('grow');
      } else UI.toast(`${d.name.replace(' Seeds', '')} is fully grown.`);
      return;
    }
    if (d.soil) {
      let n = 0;
      for (let dx = -3; dx <= 3; dx++) {
        const x = tx + dx;
        for (let y = ty - 3; y <= ty + 3; y++) {
          if (BLOCKS[w.get(x, y)].soil && w.get(x, y - 1) === B.air && Math.random() < 0.55) {
            const pick = [B.rose, B.tulip, B.daisy, B.bluebell, B.tallgrass, B.tallgrass][Math.floor(Math.random() * 6)];
            w.set(x, y - 1, pick, BLOCKS[pick].plant.stages - 1);
            this.fx.sparkle(x, y - 1, 3, '#b6ff8a'); n++;
            break;
          }
        }
      }
      if (n) this.sound.play('grow'); else UI.toast('Nothing could sprout here.');
      return;
    }
    UI.toast('Use Fertilizer on a plant or on grass.');
  },

  useBed(tx, ty) {
    this.spawnPoint = { x: tx + 0.5, y: ty + 1 };
    if (!this.isNight()) { UI.toast('Spawn point set. You can sleep once it gets dark.'); this.sound.play('click'); return; }
    this.sleep();
  },
  sleep() {
    this.cine.bars(true);
    this.cine.fade(1, 900);
    this.sound.play('sleep');
    Input.blocked = true;
    setTimeout(() => {
      this.time = 0.02; this.day++;
      this.weather.rain = 0; this.weather.target = 0;
      this.cine.title('Good morning!', `Day ${this.day}`, 3000);
      this.cine.fade(0, 1200);
      Input.blocked = false;
      setTimeout(() => this.cine.bars(false), 2400);
    }, 1500);
  },

  pickBlock() {
    const t = this.target;
    if (!t) return;
    let id = this.world.get(t.x, t.y);
    if (id === B.air) id = this.world.getBg(t.x, t.y);
    if (id === B.door_top) id = B.door;
    if (!id || BLOCKS[id].cat === 'hidden') return;
    const at = this.hotbar.indexOf(id);
    if (at >= 0) this.selectSlot(at); else this.setHotbarItem(this.sel, id);
  },

  occupied(tx, ty) {
    const hit = e => e.x - e.w / 2 < tx + 1 && e.x + e.w / 2 > tx && e.y - e.h < ty + 1 && e.y > ty;
    if (hit(this.player)) return true;
    for (const e of this.entities) if ((e instanceof NPC || e instanceof Animal) && hit(e)) return true;
    return false;
  },

  // --- world events, doors, ambience ---------------------------------------------------
  worldEvents() {
    const w = this.world, cx = this.cam.x, cy = this.cam.y;
    for (const ev of w.events) {
      const near = Math.abs(ev.x - cx) < 45 && Math.abs(ev.y - cy) < 30;
      switch (ev.type) {
        case 'break': if (near) this.fx.debris(ev.x, ev.y, ev.id, 6); break;
        case 'fall': this.entities.push(new FallingBlock(ev.x, ev.y, ev.id)); break;
        case 'grow': if (near) { this.fx.sparkle(ev.x, ev.y, 5, '#c8ff9a'); this.sound.play('grow'); } break;
        case 'growBig':
          if (near) {
            this.fx.sparkle(ev.x - 1, ev.y - 2, 30); this.sound.play('growBig');
            if (ev.label) this.fx.text(ev.x + 0.5, ev.y - 2, ev.label, '#fff6a0');
          }
          break;
        case 'place':
          if (near && !ev.quiet) this.sound.play('place', { block: ev.id });
          if (near && BLOCKS[ev.id].leaves && Math.random() < 0.25) this.fx.leaf(ev.x + 0.5, ev.y + 0.5, ev.id === B.leaves_cherry ? '#f5b5cc' : '#5fb83a');
          break;
        case 'crumble': if (near) { this.fx.debris(ev.x, ev.y, B.crumble, 6); this.sound.play('break', { block: B.sand }); } break;
        case 'fuse': if (near) this.sound.play('fuse'); break;
        case 'explode': {
          const pl = this.player;
          const dd = Math.hypot(pl.x - ev.x, pl.y - 1 - ev.y);
          this.fx.explosion(ev.x + 0.5, ev.y + 0.5, ev.r);
          if (dd < 60) { this.sound.play('explode'); this.shake(clamp(1.2 - dd / 30, 0.2, 1)); }
          if (dd < ev.r + 2) { pl.vx += Math.sign(pl.x - ev.x || 1) * 12; pl.vy = -12; }
          break;
        }
        case 'debris': if (near) this.fx.debris(ev.x, ev.y, ev.id, 3); break;
        default: break;
      }
    }
    w.events.length = 0;
  },

  updateDoors() {
    const w = this.world, set = this.doorsOpen;
    const before = new Set(set);
    set.clear();
    const check = e => {
      const fx = Math.floor(e.x), fy = Math.floor(e.y - 0.5);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 0; dy++) {
        const x = fx + dx, y = fy + dy;
        if (w.get(x, y) === B.door && Math.abs(x + 0.5 - e.x) < 1.3) set.add(w.idx(x, y));
      }
    };
    if (!this.hidePlayer) check(this.player);
    for (const e of this.entities) if (e instanceof NPC && Math.abs(e.x - this.cam.x) < 60) check(e);
    if (this.state !== 'play') return;
    const p = this.player;
    for (const k of set) if (!before.has(k) && Math.abs((k % w.W) - p.x) < 3) { this.sound.play('open'); break; }
    for (const k of before) if (!set.has(k) && Math.abs((k % w.W) - p.x) < 3) { this.sound.play('close'); break; }
  },

  ambient() {
    const w = this.world, r = this.renderer, cam = this.cam;
    const halfW = r.W / cam.bs / 2, halfH = r.H / cam.bs / 2;
    const night = this.isNight();
    this.entities = this.entities.filter(e => !e.dead);
    const count = cls => { let n = 0; for (const e of this.entities) if (e instanceof cls) n++; return n; };
    const rnd = (a, b) => a + Math.random() * (b - a);
    const surfaceHere = this.groundAt(cam.x);
    if (!night && this.weather.rain < 0.5 && cam.y < surfaceHere + 4 && count(Bird) < 5 && Math.random() < 0.3) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const bx = cam.x + side * (halfW + 3), by = cam.y - halfH * rnd(0.3, 0.8);
      if (w.get(Math.floor(bx), Math.floor(by)) === B.air) { const b = new Bird(bx, by); b.vx = -side * Math.abs(b.vx); this.entities.push(b); }
    }
    if (count(Fish) < 8) {
      for (let k = 0; k < 8; k++) {
        const x = Math.floor(cam.x + rnd(-halfW, halfW)), y = Math.floor(cam.y + rnd(-halfH, halfH));
        if (w.get(x, y) === B.water && w.get(x, y - 1) === B.water && w.get(x, y + 1) === B.water) { this.entities.push(new Fish(x + 0.5, y + 0.5)); break; }
      }
    }
    if (!night && count(Butterfly) < 4 && Math.random() < 0.4) {
      const x = Math.floor(cam.x + rnd(-halfW, halfW));
      const y = this.groundAt(x) - 1;
      if (BLOCKS[w.get(x, y)].flower) this.entities.push(new Butterfly(x + 0.5, y - 1));
    }
    if (night) {
      for (let k = 0; k < 3; k++) {
        const x = Math.floor(cam.x + rnd(-halfW, halfW));
        const y = w.surfaceY(x);
        const top = w.get(x, y);
        if ((top === B.grass || top === B.tallgrass || BLOCKS[top].flower) && Math.abs(y - cam.y) < halfH) this.fx.firefly(x + Math.random(), y - 0.5 - Math.random() * 2.5);
      }
    }
    for (const em of w.emitters) {
      if (Math.abs(em.x - cam.x) < halfW + 4 && Math.abs(em.y - cam.y) < halfH + 6 && Math.random() < 0.7) this.fx.smoke(em.x, em.y);
    }
    for (const [kind, x, y] of r.visibleEmitters) {
      if (kind === 'ember') this.fx.add({ type: 'spark', x, y, vx: (Math.random() - 0.5) * 0.4, vy: -0.8 - Math.random(), life: 0.8, size: 0.07, color: '#ffb347', glow: true, fade: true });
      else if (kind === 'petal') this.fx.leaf(x, y, '#f5b5cc');
    }
    r.visibleEmitters.length = 0;
    if (this.weather.rain > 0.4) {
      for (let k = 0; k < 6; k++) {
        const x = Math.floor(cam.x + rnd(-halfW, halfW));
        const y = w.surfaceY(x);
        if (Math.abs(y - cam.y) < halfH) this.fx.add({ type: 'sq', x: x + Math.random(), y, vx: (Math.random() - 0.5) * 2, vy: -2, life: 0.25, size: 0.08, color: 'rgba(190,215,255,0.8)', g: 18, fade: true });
      }
    }
  },

  updateWeather(dt) {
    const wt = this.weather;
    wt.timer -= dt;
    if (wt.timer <= 0) {
      wt.target = wt.target > 0 ? 0 : (Math.random() < 0.55 ? 1 : 0);
      wt.timer = wt.target ? 70 + Math.random() * 70 : 200 + Math.random() * 200;
    }
    wt.rain += (wt.target - wt.rain) * Math.min(1, dt * 0.25);
  },

  // --- zones & places -------------------------------------------------------------------
  zoneAt(x) {
    let best = null;
    for (const z of this.world.zones) {
      if (z.quiet || x < z.x0 - 4 || x > z.x1 + 4) continue;
      if (!best || (z.x1 - z.x0) < (best.x1 - best.x0)) best = z;
    }
    return best;
  },
  checkZone() {
    const p = this.player, z = this.zoneAt(p.x);
    if (!z || this.discovered.has(z.name)) return;
    if (z.type === 'course' && z.course.type === 'rooftop' && p.y > z.course.fallY - 2) return;
    this.discovered.add(z.name);
    const sub = z.type === 'village' ? 'Village' : z.type === 'city' ? 'City' : 'Parkour · ' + (z.desc || '');
    this.cine.zoneTitle(z.name, sub);
    this.sound.play('discover');
  },
  locationInfo() {
    const p = this.player, w = this.world;
    if (!p || !w) return { name: '', icon: 'ui_pin' };
    if (p.y > w.terrainY[clamp(Math.floor(p.x), 0, w.W - 1)] + 6 && !p.fly) return { name: 'Underground', icon: 'ui_pick' };
    const z = this.zoneAt(p.x);
    if (z) return { name: z.name, icon: z.type === 'village' ? 'ui_house' : z.type === 'city' ? 'ui_city' : z.type === 'lake' ? 'ui_lake' : 'flag_start' };
    return { name: biomeAt(w, p.x).name, icon: 'ui_pin' };
  },
  places() {
    const w = this.world, list = [];
    list.push({ name: 'World spawn', short: 'Spawn', kind: 'Where you started', icon: 'ui_pin', x: w.spawn.x, y: w.spawn.y, feet: w.spawn.y });
    if (this.spawnPoint) list.push({ name: 'Your bed', short: 'Bed', kind: 'Your spawn point', icon: 'bed', x: this.spawnPoint.x, y: this.spawnPoint.y, feet: this.spawnPoint.y });
    for (const z of w.zones) {
      if (z.type === 'village') list.push({ name: z.name, short: z.name, kind: 'Village', icon: 'ui_house', x: (z.x0 + z.x1) / 2, y: z.gy, feet: z.gy });
      else if (z.type === 'city') list.push({ name: z.name, short: z.name, kind: 'City', icon: 'ui_city', x: z.x0 + 4, y: z.gy, feet: z.gy });
      else if (z.type === 'course') {
        const c = z.course;
        let x = c.x0 - 3;
        if (c.type === 'rooftop') x = c.start.x - 7;
        if (c.type === 'lava') x = c.start.x - 2;
        list.push({ name: c.name, short: c.name, kind: 'Parkour · ' + c.desc, icon: 'flag_start', x, y: c.topY, best: this.parkour.bestFor(c) });
      } else if (z.type === 'lake') list.push({ name: z.name, short: z.name, kind: 'Lake', icon: 'ui_lake', x: (z.x0 + z.x1) / 2, y: w.surfaceY((z.x0 + z.x1) / 2) });
    }
    return list.sort((a, b) => a.x - b.x);
  },
  travelTo(place) {
    UI.closePanels();
    if (this.parkour.active) this.parkour.cancel('Course cancelled.');
    const x = clamp(place.x, 4, this.world.W - 5);
    const w = this.world, fx = Math.floor(x);
    const clear = f => !BLOCKS[w.get(fx, f - 1)].solid && !BLOCKS[w.get(fx, f - 2)].solid;
    const y = place.feet !== undefined && clear(place.feet) ? place.feet : this.groundAt(x);
    this.teleport(x, y, {});
    if (place.name) setTimeout(() => this.cine.zoneTitle(place.name, place.kind || ''), 500);
  },
  teleport(x, y, opts = {}) {
    if (this.teleporting) return;
    this.teleporting = true;
    const p = this.player;
    this.cine.flash(() => {
      p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.boostT = 0; p.climbing = false;
      p.scarf.forEach(s => { s.x = x; s.y = y - 1.4; });
      this.cam.x = x; this.cam.y = y - 1.4;
      this.teleporting = false;
      this.sound.play('respawn');
    }, opts.quick ? 160 : 380);
  },
  respawnPlayer(reason) {
    if (this.teleporting) return;
    if (this.parkour.active) { this.parkour.fail(); if (reason === 'lava') UI.toast('Ouch! Back to the checkpoint.'); return; }
    const sp = this.spawnPoint || this.world.spawn;
    if (reason === 'lava') UI.toast('Ouch! Lava is hot. Back to your spawn point.');
    this.sound.play('hurt');
    this.teleport(sp.x, sp.y, {});
  },
  retry() {
    if (this.parkour.active) this.parkour.fail();
    else UI.toast('Touch a green Start flag to begin a parkour course.');
  },
  onFlag(type, x, y) { this.parkour.touch(type, x, y); },

  celebrate(x, y, main, sub) {
    this.sound.play('finish');
    this.cine.bars(true);
    this.cine.title(main, sub, 4300, 'win');
    this.slowMo = 1.1;
    this.cam.targetZoomMul = 1.25;
    for (let k = 0; k < 8; k++) setTimeout(() => this.fx.firework(x, y - 1), 150 + k * 260);
    this.fx.sparkle(x - 1, y - 1, 30);
    setTimeout(() => { if (!this.cinemaMode) this.cine.bars(false); this.cam.targetZoomMul = 1; }, 4000);
  },

  // --- toggles & hotbar ------------------------------------------------------------------
  selectSlot(i) {
    this.sel = i;
    this.player.heldTi = BLOCKS[this.hotbar[i]].iconTi;
    UI.refreshHotbar();
    UI.showItemLabel(BLOCKS[this.hotbar[i]].name);
    this.sound.play('click');
  },
  setHotbarItem(i, id) {
    this.hotbar[i] = id;
    this.selectSlot(i);
  },
  toggleFly() {
    const p = this.player;
    p.fly = !p.fly;
    if (p.fly && this.parkour.active) this.parkour.cancel('Flying cancels the course.');
    UI.updateToggles();
    UI.toast(p.fly ? 'Flying: hold Space or W to rise, S to sink.' : 'Flying off.');
    this.sound.play(p.fly ? 'boost' : 'click');
  },
  toggleWall() {
    this.wallMode = !this.wallMode;
    UI.updateToggles();
    UI.toast(this.wallMode ? 'Back wall mode: build and break the walls behind you.' : 'Back wall mode off.');
  },
  toggleTouchMode() {
    this.touchMode = this.touchMode === 'mine' ? 'build' : 'mine';
    UI.updateToggles();
    UI.toast(this.touchMode === 'build' ? 'Build mode: tap the world to place your selected block.' : 'Dig mode: tap or hold to dig.');
    this.sound.play('click');
  },
  setCinema(on) {
    this.cinemaMode = on;
    this.cine.bars(on);
    UI.showHUD(!on);
    this.hideCursor = on;
    if (on) UI.toast('Cinematic camera. Press C or Esc to exit.');
  },
  zoom(f) {
    this.userZoom = clamp(this.userZoom * f, 0.6, 1.8);
    this.saveSettings();
  },
  shake(a) { if (!REDUCED_MOTION) this.shakeAmt = Math.max(this.shakeAmt, a); },
  saveNow(silent) {
    if (!this.world || this.state === 'title' || this.state === 'intro') return;
    const ok = Save.write(this);
    if (!silent) UI.toast(ok ? 'World saved.' : 'Couldn’t save: your browser’s storage is full or turned off.');
  },

  // --- helpers ------------------------------------------------------------------------
  isNight() { return Math.sin(this.time * TAU) < -0.06; },
  groundAt(x) {
    const w = this.world;
    x = clamp(Math.floor(x), 0, w.W - 1);
    for (let y = 0; y < w.H; y++) {
      const d = BLOCKS[w.fg[y * w.W + x]];
      if ((d.solid && !d.leaves) || d.liquid) return y;
    }
    return w.H - 2;
  },
};

function soilHint(d) {
  const s = d.plant.soil;
  if (s === 'sand') return 'Cactus grows on sand.';
  if (s === 'sandsoil') return 'Plant this on sand, grass or dirt.';
  if (s === 'any') return 'Plant this on top of any solid block.';
  return 'Seeds need grass, dirt or farmland below them.';
}

window.addEventListener('load', () => game.boot());
