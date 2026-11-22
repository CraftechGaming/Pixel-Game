'use strict';
// ---------------------------------------------------------------------------
// UI: HUD, hotbar, block picker, world map, menus, toasts and touch controls.
// ---------------------------------------------------------------------------

const SEED_WORDS_A = ['Amber', 'Mossy', 'Sunny', 'Misty', 'Golden', 'Silver', 'Lucky', 'Quiet', 'Brave', 'Frosty', 'Cozy', 'Wild'];
const SEED_WORDS_B = ['Valley', 'Otter', 'Harbor', 'Meadow', 'Comet', 'Pine', 'River', 'Fox', 'Lantern', 'Peak', 'Garden', 'Island'];
function randomSeed() {
  return SEED_WORDS_A[Math.floor(Math.random() * SEED_WORDS_A.length)] + SEED_WORDS_B[Math.floor(Math.random() * SEED_WORDS_B.length)] + Math.floor(Math.random() * 100);
}

const UI = {
  game: null, el: {}, tab: 'all', open: null, prevState: null, labelTimer: null, hudTimer: 0,

  init(game) {
    this.game = game;
    const $ = id => document.getElementById(id);
    this.el = {
      hud: $('hud'), hotbar: $('hotbar'), label: $('item-label'), toasts: $('toasts'),
      timeText: $('time-text'), dayText: $('day-text'), timeIcon: $('time-icon'), locText: $('loc-text'), locIcon: $('loc-icon'),
      pk: $('parkour-hud'), overlay: $('overlay'),
      panels: { inv: $('panel-inv'), map: $('panel-map'), pause: $('panel-pause'), help: $('panel-help') },
      tgFly: $('tg-fly'), tgWall: $('tg-wall'), tgMode: $('tg-mode'), touch: $('touch-controls'),
      title: $('title-screen'), loading: $('loading'), seed: $('seed-input'),
      btnContinue: $('btn-continue'), grid: $('inv-grid'), tabs: $('inv-tabs'), search: $('inv-search'),
      mapCanvas: $('map-canvas'), mapMarkers: $('map-markers'), mapList: $('map-list'), mapScroll: $('map-scroll'),
    };
    document.querySelectorAll('img[data-icon]').forEach(img => { img.src = makeIconURL(img.dataset.icon); });

    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button');
      b.className = 'slot'; b.type = 'button';
      b.innerHTML = `<span class="num">${i + 1}</span><img alt="">`;
      b.addEventListener('click', () => game.selectSlot(i));
      this.el.hotbar.appendChild(b);
    }
    $('btn-blocks').addEventListener('click', () => this.openPanel('inv'));
    $('btn-map').addEventListener('click', () => this.openPanel('map'));
    $('btn-menu').addEventListener('click', () => this.openPanel('pause'));
    this.el.tgFly.addEventListener('click', () => game.toggleFly());
    this.el.tgWall.addEventListener('click', () => game.toggleWall());
    this.el.tgMode.addEventListener('click', () => game.toggleTouchMode());
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => this.closePanels()));
    this.el.overlay.addEventListener('click', () => this.closePanels());

    // block picker
    for (const c of CATEGORIES) {
      const t = document.createElement('button');
      t.className = 'tab'; t.type = 'button'; t.textContent = c.name; t.dataset.cat = c.id;
      t.setAttribute('role', 'tab');
      t.addEventListener('click', () => { this.tab = c.id; this.renderInventory(); });
      this.el.tabs.appendChild(t);
    }
    this.el.search.addEventListener('input', () => this.renderInventory());
    this.el.search.addEventListener('keydown', e => { if (e.key === 'Escape') this.closePanels(); e.stopPropagation(); });

    // pause menu
    $('pm-resume').addEventListener('click', () => this.closePanels());
    $('pm-save').addEventListener('click', () => game.saveNow(false));
    $('pm-cine').addEventListener('click', () => { this.closePanels(); game.setCinema(true); });
    $('pm-sound').addEventListener('click', () => { game.sound.setEnabled(!game.sound.enabled); this.updateMenu(); game.saveSettings(); });
    $('pm-music').addEventListener('click', () => { game.sound.setMusic(!game.sound.musicOn); this.updateMenu(); game.saveSettings(); });
    $('pm-zoomin').addEventListener('click', () => game.zoom(1.15));
    $('pm-zoomout').addEventListener('click', () => game.zoom(1 / 1.15));
    $('pm-help').addEventListener('click', () => this.openPanel('help'));
    $('pm-copy').addEventListener('click', () => this.copySeed());
    $('pm-quit').addEventListener('click', () => { this.closePanels(); game.quitToTitle(); });

    // title screen
    this.el.seed.value = randomSeed();
    $('seed-random').addEventListener('click', () => { this.el.seed.value = randomSeed(); game.sound.init(); game.sound.play('click'); });
    $('btn-new').addEventListener('click', () => {
      const s = this.el.seed.value.trim() || randomSeed();
      this.el.seed.value = s;
      game.newWorld(s);
    });
    this.el.seed.addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-new').click(); });
    this.el.btnContinue.addEventListener('click', () => game.continueWorld());
    $('btn-howto').addEventListener('click', () => this.openPanel('help'));

    // map clicks
    this.el.mapCanvas.addEventListener('click', e => {
      const r = this.el.mapCanvas.getBoundingClientRect();
      const wx = ((e.clientX - r.left) / r.width) * game.world.W;
      game.travelTo({ x: wx, name: null });
    });

    // touch
    const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.setTouch(touch);
    window.addEventListener('touchstart', () => this.setTouch(true), { passive: true, once: true });
    Input.bindButton($('tc-left'), 'left');
    Input.bindButton($('tc-right'), 'right');
    Input.bindButton($('tc-jump'), 'jump');
    Input.bindButton($('tc-down'), 'down');
    this.updateMenu();
  },

  setTouch(on) {
    document.body.classList.toggle('touch', on);
    this.el.touch.hidden = !on;
    Input.touch.isTouch = on;
  },

  // --- screens ---------------------------------------------------------------
  showTitle() {
    this.el.title.hidden = false;
    this.el.title.classList.remove('leaving');
    const info = Save.info();
    const b = this.el.btnContinue;
    if (info) {
      b.hidden = false;
      b.textContent = `Continue “${info.seed}” · Day ${info.day || 1}`;
    } else b.hidden = true;
    this.showHUD(false);
  },
  hideTitle() {
    this.el.title.classList.add('leaving');
    setTimeout(() => { this.el.title.hidden = true; }, 600);
  },
  showLoading(on) { this.el.loading.hidden = !on; },
  showHUD(on) {
    this.el.hud.hidden = false;
    this.el.hud.classList.toggle('dim', !on);
    if (!on) this.el.hud.setAttribute('aria-hidden', 'true'); else this.el.hud.removeAttribute('aria-hidden');
  },

  // --- hotbar ---------------------------------------------------------------
  refreshHotbar() {
    const g = this.game;
    [...this.el.hotbar.children].forEach((b, i) => {
      const d = BLOCKS[g.hotbar[i]];
      b.classList.toggle('sel', i === g.sel);
      b.querySelector('img').src = makeIconURL(d.icon);
      b.title = d.name;
      b.setAttribute('aria-label', `Slot ${i + 1}: ${d.name}`);
      b.setAttribute('aria-pressed', i === g.sel ? 'true' : 'false');
    });
    if (this.open === 'inv') this.renderInventory();
  },
  showItemLabel(text) {
    const l = this.el.label;
    l.textContent = text;
    l.classList.add('show');
    clearTimeout(this.labelTimer);
    this.labelTimer = setTimeout(() => l.classList.remove('show'), 1600);
  },
  updateToggles() {
    const g = this.game;
    this.el.tgFly.setAttribute('aria-pressed', g.player && g.player.fly ? 'true' : 'false');
    this.el.tgWall.setAttribute('aria-pressed', g.wallMode ? 'true' : 'false');
    const build = g.touchMode === 'build';
    this.el.tgMode.setAttribute('aria-pressed', build ? 'true' : 'false');
    this.el.tgMode.querySelector('span').textContent = build ? 'Build' : 'Dig';
    this.el.tgMode.querySelector('img').src = makeIconURL(build ? 'grass' : 'ui_pick');
  },

  toast(msg) {
    const box = this.el.toasts;
    while (box.children.length >= 3) box.firstChild.remove();
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2900);
    setTimeout(() => t.remove(), 3400);
  },

  updateHUD(dt) {
    const g = this.game;
    this.hudTimer -= dt;
    if (this.hudTimer > 0 || g.state === 'title') return;
    this.hudTimer = 0.25;
    const hours = (6 + g.time * 24) % 24;
    const h = Math.floor(hours), m = Math.floor((hours - h) * 60 / 10) * 10;
    this.el.timeText.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    this.el.dayText.textContent = `Day ${g.day}`;
    const icon = g.weather.rain > 0.5 ? 'ui_rain' : g.isNight() ? 'ui_moon' : 'ui_sun';
    if (this.el.timeIcon.dataset.k !== icon) { this.el.timeIcon.src = makeIconURL(icon); this.el.timeIcon.dataset.k = icon; }
    const loc = g.locationInfo();
    if (this.el.locText.textContent !== loc.name) this.el.locText.textContent = loc.name;
    if (this.el.locIcon.dataset.k !== loc.icon) { this.el.locIcon.src = makeIconURL(loc.icon); this.el.locIcon.dataset.k = loc.icon; }
  },

  // --- parkour ---------------------------------------------------------------
  showParkour(pk) { this.el.pk.hidden = false; this.updateParkour(pk); },
  hideParkour() { this.el.pk.hidden = true; },
  updateParkour(pk) {
    if (!pk.active) return;
    const c = pk.active;
    this.el.pk.querySelector('.pk-name').textContent = c.name;
    this.el.pk.querySelector('.pk-time').textContent = formatTime(pk.time);
    const parts = [];
    if (!c.custom && c.checks.length) parts.push(`Checkpoint ${pk.cp + 1}/${c.checks.length}`);
    const best = c.custom ? undefined : pk.bestFor(c);
    if (best !== undefined) parts.push(`Best ${formatTime(best)}`);
    parts.push(Input.touch.isTouch ? 'Fall = retry' : 'R = retry');
    const info = parts.join(' · ');
    const el = this.el.pk.querySelector('.pk-info');
    if (el.textContent !== info) el.textContent = info;
  },

  // --- panels ---------------------------------------------------------------
  openPanel(name) {
    const g = this.game;
    if (this.open === name) { this.closePanels(); return; }
    if (g.state === 'intro' || g.state === 'loading') return;
    if (!this.open) this.prevState = g.state;
    for (const [k, p] of Object.entries(this.el.panels)) p.hidden = k !== name;
    const overTitle = this.prevState === 'title';
    this.el.overlay.hidden = false;
    this.el.overlay.style.zIndex = overTitle ? 34 : '';
    this.el.panels[name].style.zIndex = overTitle ? 35 : '';
    this.open = name;
    if (g.state === 'play') g.state = 'menu';
    g.mining = null;
    Input.mouse.left = Input.mouse.right = false;
    g.sound.play('open');
    if (name === 'inv') { this.el.search.value = ''; this.renderInventory(); if (!Input.touch.isTouch) setTimeout(() => this.el.search.focus(), 30); }
    if (name === 'map') this.renderMap();
    if (name === 'pause') { this.updateMenu(); g.saveNow(true); }
    if (name === 'help') { /* static */ }
  },
  closePanels() {
    if (!this.open) return;
    const g = this.game;
    for (const p of Object.values(this.el.panels)) p.hidden = true;
    this.el.overlay.hidden = true;
    this.open = null;
    if (g.state === 'menu') g.state = this.prevState === 'menu' ? 'play' : (this.prevState || 'play');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    g.sound.play('close');
  },

  renderInventory() {
    const g = this.game, q = this.el.search.value.trim().toLowerCase();
    [...this.el.tabs.children].forEach(t => t.setAttribute('aria-selected', t.dataset.cat === this.tab ? 'true' : 'false'));
    const items = pickableItems().filter(d => (q ? d.name.toLowerCase().includes(q) : (this.tab === 'all' || d.cat === this.tab)));
    const grid = this.el.grid;
    grid.textContent = '';
    if (!items.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'Nothing matches that search.'; grid.appendChild(e); return; }
    const frag = document.createDocumentFragment();
    for (const d of items) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'item' + (g.hotbar.includes(d.id) ? ' in-bar' : '');
      b.innerHTML = `<img alt=""><span></span>`;
      b.querySelector('img').src = makeIconURL(d.icon);
      b.querySelector('span').textContent = d.name;
      b.title = d.name;
      b.addEventListener('click', () => {
        g.setHotbarItem(g.sel, d.id);
        g.sound.play('click');
        this.toast(`${d.name} is in slot ${g.sel + 1}`);
      });
      frag.appendChild(b);
    }
    grid.appendChild(frag);
  },

  updateMenu() {
    const g = this.game;
    document.getElementById('pm-sound').textContent = `Sound: ${g.sound.enabled ? 'on' : 'off'}`;
    document.getElementById('pm-music').textContent = `Music: ${g.sound.musicOn ? 'on' : 'off'}`;
    if (g.world) document.getElementById('pm-seed').textContent = g.world.seedStr;
  },
  copySeed() {
    const s = this.game.world.seedStr;
    const done = () => this.toast(`Seed “${s}” copied`);
    try {
      navigator.clipboard.writeText(s).then(done, () => this.selectSeed());
    } catch (e) { this.selectSeed(); }
  },
  selectSeed() {
    const el = document.getElementById('pm-seed');
    const r = document.createRange(); r.selectNodeContents(el);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    this.toast('Seed selected. Copy it with your keyboard.');
  },

  // --- map ---------------------------------------------------------------
  renderMap() {
    const g = this.game, w = g.world;
    const Y0 = 30, Y1 = 150, sxStep = 2;
    const mw = Math.ceil(w.W / sxStep), mh = Y1 - Y0;
    const c = this.el.mapCanvas;
    c.width = mw; c.height = mh;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(mw, mh);
    const d = img.data;
    const skyTop = hexRgb('#5aa2e6'), skyBot = hexRgb('#cfe9ff');
    for (let my = 0; my < mh; my++) {
      const y = Y0 + my;
      const sky = mixRgb(skyTop, skyBot, my / mh);
      for (let mx = 0; mx < mw; mx++) {
        const x = mx * sxStep;
        let col = null;
        for (let k = 0; k < sxStep && !col; k++) {
          const id = w.fg[y * w.W + x + k];
          if (id) col = BLOCKS[id].mapColor;
        }
        if (!col) {
          const b = w.bg[y * w.W + x];
          col = b && BLOCKS[b].mapColor ? shadeRgb(BLOCKS[b].mapColor, 0.45) : sky;
        }
        const o = (my * mw + mx) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // markers
    const box = this.el.mapMarkers;
    box.textContent = '';
    requestAnimationFrame(() => {
      const r = c.getBoundingClientRect();
      const scaleX = r.width / w.W, scaleY = r.height / mh;
      const add = (x, y, icon, label, cls = '') => {
        const m = document.createElement('div');
        m.className = 'mk ' + cls;
        m.style.left = (x * scaleX) + 'px';
        m.style.top = ((y - Y0) * scaleY) + 'px';
        m.innerHTML = `<span></span><img alt="">`;
        m.querySelector('span').textContent = label;
        m.querySelector('img').src = makeIconURL(icon);
        box.appendChild(m);
      };
      for (const p of g.places()) add(p.x, p.y, p.icon, p.short);
      add(g.player.x, g.player.y - 1.5, 'ui_player', 'You', 'you');
      this.el.mapScroll.scrollLeft = g.player.x * scaleX - this.el.mapScroll.clientWidth / 2;
    });
    // destination list
    const list = this.el.mapList;
    list.textContent = '';
    for (const p of g.places()) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'place';
      b.innerHTML = `<img alt=""><span><span class="pl-name"></span><span class="pl-kind"></span></span><span class="pl-best"></span>`;
      b.querySelector('img').src = makeIconURL(p.icon);
      b.querySelector('.pl-name').textContent = p.name;
      b.querySelector('.pl-kind').textContent = p.kind;
      if (p.best !== undefined) b.querySelector('.pl-best').textContent = formatTime(p.best);
      b.addEventListener('click', () => g.travelTo(p));
      list.appendChild(b);
    }
  },
};
