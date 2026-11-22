'use strict';
// ---------------------------------------------------------------------------
// UI: title screen (choose a world type), HUD, inventory + crafting,
// creative block picker, race HUD and results, menus and touch controls.
// ---------------------------------------------------------------------------

function randomSeed() {
  const a = ['Amber', 'Mossy', 'Sunny', 'Misty', 'Golden', 'Silver', 'Lucky', 'Quiet', 'Brave', 'Frosty', 'Cozy', 'Wild'];
  const b = ['Valley', 'Otter', 'Harbor', 'Meadow', 'Comet', 'Pine', 'River', 'Fox', 'Lantern', 'Peak', 'Garden', 'Island'];
  return a[Math.floor(Math.random() * a.length)] + b[Math.floor(Math.random() * b.length)] + Math.floor(Math.random() * 100);
}
const $ = id => document.getElementById(id);
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th');

const UI = {
  game: null, open: null, tab: 'all', craftTab: 'All', cursor: null, labelTimer: 0, hudT: 0,

  init(game) {
    this.game = game;
    document.querySelectorAll('img[data-icon]').forEach(img => { img.src = makeIconURL(img.dataset.icon); });
    // hotbar
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button');
      b.className = 'slot'; b.type = 'button';
      b.innerHTML = `<span class="num">${i + 1}</span><img alt=""><span class="cnt"></span>`;
      b.addEventListener('click', e => { e.stopPropagation(); game.selectSlot(i); });
      $('hotbar').appendChild(b);
    }
    // hearts & bubbles
    for (let i = 0; i < 10; i++) { const h = document.createElement('img'); h.className = 'pix'; $('hearts').appendChild(h); }
    for (let i = 0; i < 10; i++) { const h = document.createElement('img'); h.className = 'pix'; h.src = makeIconURL('ui_bubble'); $('bubbles').appendChild(h); }
    $('btn-inv').addEventListener('click', () => this.openPanel('inv'));
    $('btn-menu').addEventListener('click', () => this.openPanel('pause'));
    $('btn-view').addEventListener('click', () => game.toggleView());
    $('btn-fly').addEventListener('click', () => game.toggleFly());
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => this.closePanels()));
    $('overlay').addEventListener('click', () => this.closePanels());

    // creative picker tabs
    for (const c of CATEGORIES) {
      const t = document.createElement('button');
      t.className = 'tab'; t.type = 'button'; t.textContent = c.name; t.dataset.cat = c.id;
      t.addEventListener('click', () => { this.tab = c.id; this.renderPicker(); });
      $('pick-tabs').appendChild(t);
    }
    $('pick-search').addEventListener('input', () => this.renderPicker());
    $('pick-search').addEventListener('keydown', e => { if (e.key === 'Escape') this.closePanels(); e.stopPropagation(); });
    // crafting tabs
    const cats = ['All', ...new Set(RECIPES.map(r => r.cat))];
    for (const c of cats) {
      const t = document.createElement('button');
      t.className = 'tab'; t.type = 'button'; t.textContent = c; t.dataset.cat = c;
      t.addEventListener('click', () => { this.craftTab = c; this.renderCraft(); });
      $('craft-tabs').appendChild(t);
    }
    // backpack slots
    for (let i = 9; i < 36; i++) $('pack').appendChild(this.makeInvSlot(i));
    for (let i = 0; i < 9; i++) $('pack-bar').appendChild(this.makeInvSlot(i));
    document.addEventListener('mousemove', e => { const c = $('cursor-stack'); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; });

    // pause menu
    $('pm-resume').addEventListener('click', () => this.closePanels());
    $('pm-save').addEventListener('click', () => game.saveNow(false));
    $('pm-view').addEventListener('click', () => { game.toggleView(); this.closePanels(); });
    $('pm-cine').addEventListener('click', () => { this.closePanels(); game.setCinema(true); });
    $('pm-sound').addEventListener('click', () => { game.sound.setEnabled(!game.sound.enabled); this.updateMenu(); game.saveSettings(); });
    $('pm-music').addEventListener('click', () => { game.sound.setMusic(!game.sound.musicOn); this.updateMenu(); game.saveSettings(); });
    $('pm-dist').addEventListener('click', () => { game.cycleDistance(); this.updateMenu(); });
    $('pm-help').addEventListener('click', () => this.openPanel('help'));
    $('pm-copy').addEventListener('click', () => this.copySeed());
    $('pm-quit').addEventListener('click', () => { this.closePanels(); game.quitToTitle(); });
    $('respawn-btn').addEventListener('click', () => game.respawn());

    // title screen
    document.querySelectorAll('.mode-card').forEach(c => c.addEventListener('click', () => { game.sound.init(); game.sound.play('click'); this.showTitleView(c.dataset.mode); }));
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => this.showTitleView('home')));
    $('seed-input').value = randomSeed();
    $('seed-random').addEventListener('click', () => { $('seed-input').value = randomSeed(); game.sound.play('click'); });
    $('btn-create').addEventListener('click', () => {
      const s = $('seed-input').value.trim() || randomSeed();
      $('seed-input').value = s;
      game.newWorld(this.worldMode, s);
    });
    $('seed-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-create').click(); e.stopPropagation(); });
    $('btn-continue').addEventListener('click', () => game.continueWorld(this.worldMode));
    $('btn-cup').addEventListener('click', () => game.startCup());
    $('btn-howto').addEventListener('click', () => this.openPanel('help'));
    $('res-next').addEventListener('click', () => game.resultsAction('next'));
    $('res-again').addEventListener('click', () => game.resultsAction('again'));
    $('res-menu').addEventListener('click', () => game.resultsAction('menu'));

    // touch
    const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.setTouch(touch);
    window.addEventListener('touchstart', () => this.setTouch(true), { passive: true, once: true });
    Input.bindButton($('t-jump'), 'jump');
    Input.bindButton($('t-down'), 'down');
    Input.bindButton($('t-up'), 'up');
    $('t-place').addEventListener('pointerdown', e => { e.preventDefault(); Input.tapPlace = true; });
    $('t-mine').addEventListener('pointerdown', e => { e.preventDefault(); Input.holdMine = true; $('t-mine').classList.add('held'); });
    const stopMine = e => { e.preventDefault(); Input.holdMine = false; $('t-mine').classList.remove('held'); };
    $('t-mine').addEventListener('pointerup', stopMine); $('t-mine').addEventListener('pointercancel', stopMine); $('t-mine').addEventListener('pointerleave', stopMine);
    Input.onJoy = j => {
      const base = $('joy');
      if (!j) { base.classList.remove('on'); return; }
      base.classList.add('on');
      base.style.left = j.x0 + 'px'; base.style.top = j.y0 + 'px';
      let dx = j.x - j.x0, dy = j.y - j.y0; const l = Math.hypot(dx, dy); if (l > 50) { dx *= 50 / l; dy *= 50 / l; }
      $('joy-knob').style.transform = `translate(${dx}px, ${dy}px)`;
    };
    this.renderCourses();
  },
  setTouch(on) {
    document.body.classList.toggle('touch', on);
    Input.isTouch = on;
  },

  // --- title -----------------------------------------------------------------------
  showTitle() {
    $('title-screen').hidden = false;
    $('title-screen').classList.remove('leaving');
    this.showTitleView('home');
    this.showHUD(false);
  },
  showTitleView(v) {
    document.querySelectorAll('.title-view').forEach(el => { el.hidden = el.dataset.view !== (v === 'survival' || v === 'creative' ? 'world' : v); });
    if (v === 'survival' || v === 'creative') {
      this.worldMode = v;
      $('world-title').textContent = v === 'survival' ? 'Survival world' : 'Creative world';
      $('world-sub').textContent = v === 'survival'
        ? 'Mine blocks to collect them, craft tools, and build your home. Watch your hearts!'
        : 'Every block is yours. Fly around and build anything.';
      const info = Save.info(v);
      $('btn-continue').hidden = !info;
      if (info) $('btn-continue').textContent = `Continue “${info.seed}” · Day ${info.day}`;
    }
    if (v === 'parkour') this.renderCourses();
  },
  hideTitle() { $('title-screen').classList.add('leaving'); setTimeout(() => { $('title-screen').hidden = true; }, 500); },
  renderCourses() {
    const box = $('course-list');
    box.textContent = '';
    const best = Store.get('pr3d.parkour', {});
    for (const def of COURSES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'course-card';
      const rec = best[def.id];
      b.innerHTML = `<span class="cc-name"></span><span class="cc-desc"></span><span class="cc-best"></span>`;
      b.querySelector('.cc-name').textContent = def.name;
      b.querySelector('.cc-desc').textContent = def.desc;
      b.querySelector('.cc-best').textContent = rec ? `Best: ${ordinal(rec.place)} · ${formatTime(rec.time)}` : 'Not played yet';
      b.addEventListener('click', () => this.game.startPractice(def));
      box.appendChild(b);
    }
    const cup = Store.get('pr3d.cups', 0);
    $('cup-wins').textContent = cup ? `Crowns won: ${cup}` : 'Win three rounds to take the crown';
  },
  showLoading(on, text) { $('loading').hidden = !on; if (text) $('loading-text').textContent = text; },

  // --- HUD -------------------------------------------------------------------------------
  showHUD(on) { $('hud').hidden = false; $('hud').classList.toggle('dim', !on); },
  setMode(mode) {
    document.body.dataset.mode = mode;
    $('btn-inv').querySelector('.lbl').textContent = mode === 'creative' ? 'Blocks' : 'Inventory';
    $('race-hud').hidden = mode !== 'parkour';
  },
  refreshHotbar() {
    const g = this.game;
    [...$('hotbar').children].forEach((b, i) => {
      const s = g.slot(i);
      b.classList.toggle('sel', i === g.sel);
      const img = b.querySelector('img');
      if (s) { img.src = itemIcon(s.id); img.hidden = false; b.title = BLOCKS[s.id].name; }
      else { img.hidden = true; b.title = 'Empty'; }
      b.querySelector('.cnt').textContent = s && g.mode === 'survival' && s.n > 1 ? s.n : '';
    });
    if (this.open === 'inv') this.renderInv();
  },
  showItemLabel(text) {
    const l = $('item-label');
    l.textContent = text; l.classList.add('show');
    clearTimeout(this.labelTimer);
    this.labelTimer = setTimeout(() => l.classList.remove('show'), 1500);
  },
  toast(msg) {
    const box = $('toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3000);
    setTimeout(() => t.remove(), 3500);
  },
  updateHUD(dt) {
    const g = this.game;
    this.hudT -= dt;
    if (g.mode === 'parkour' && g.race) this.updateRaceHUD(g.race);
    if (this.hudT > 0) return;
    this.hudT = 0.2;
    if (g.mode !== 'parkour') {
      const hours = (6 + g.time * 24) % 24, h = Math.floor(hours), m = Math.floor((hours - h) * 6) * 10;
      $('time-text').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      $('day-text').textContent = `Day ${g.day}`;
      const icon = g.isNight() ? 'ui_moon' : 'ui_sun';
      if ($('time-icon').dataset.k !== icon) { $('time-icon').src = makeIconURL(icon); $('time-icon').dataset.k = icon; }
      $('loc-text').textContent = g.locationName();
    }
    const showHealth = g.mode === 'survival';
    $('status-row').hidden = !showHealth;
    if (showHealth) {
      [...$('hearts').children].forEach((img, i) => {
        const v = g.hp - i * 2, k = v >= 2 ? 'ui_heart' : v === 1 ? 'ui_heart_half' : 'ui_heart_empty';
        if (img.dataset.k !== k) { img.src = makeIconURL(k); img.dataset.k = k; }
      });
      const showAir = g.player && g.player.headInWater || g.air < 10;
      $('bubbles').style.visibility = showAir ? 'visible' : 'hidden';
      [...$('bubbles').children].forEach((img, i) => { img.style.opacity = g.air > i ? 1 : 0.15; });
    }
    $('btn-fly').hidden = g.mode !== 'creative';
    $('btn-fly').setAttribute('aria-pressed', g.player && g.player.fly ? 'true' : 'false');
    $('lock-hint').hidden = !((g.state === 'play' || (g.state === 'race' && g.race && !g.race.camOverride)) && !Input.isTouch && !Input.locked && !Input.freeLook);
    $('t-up').hidden = !(g.mode === 'creative' && g.player && g.player.fly);
    $('t-down').hidden = !(g.mode === 'creative' && g.player && g.player.fly);
    document.body.classList.toggle('build-mode', g.mode !== 'parkour');
  },
  hurtFlash() { const f = $('hurt-flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); },

  // --- race ---------------------------------------------------------------------------
  updateRaceHUD(race) {
    const p = race.player;
    if (!p) return;
    const place = race.placeOf(p);
    const total = race.racers.length;
    $('rh-place').innerHTML = `${place}<sup>${ordinal(place).slice(String(place).length)}</sup>`;
    $('rh-of').textContent = `of ${total}`;
    $('rh-time').textContent = formatTime(race.timer);
    $('rh-name').textContent = race.def.name;
    $('rh-info').textContent = race.qualify ? `${race.opts.roundName} · top ${race.qualify} qualify · ${race.finishers.length}/${race.qualify} in` : 'Practice run';
  },
  countdown(text, big) {
    const c = $('countdown');
    c.textContent = text; c.className = big ? 'go' : '';
    void c.offsetWidth; c.classList.add('show');
  },
  showResults(race, info) {
    const list = $('res-list');
    list.textContent = '';
    const order = race.racers.slice().sort((a, b) => (a.finished === b.finished ? (a.finished ? a.place - b.place : b.z - a.z) : a.finished ? -1 : 1));
    order.forEach((r, i) => {
      const row = document.createElement('div');
      const q = race.qualify ? (r.finished && r.place <= race.qualify) : r.finished;
      row.className = 'res-row' + (r.isPlayer ? ' you' : '') + (q ? ' q' : '');
      const sw = `rgb(${r.look.body.map(v => Math.round(v * 255)).join(',')})`;
      row.innerHTML = `<span class="rr-pos"></span><span class="rr-dot"></span><span class="rr-name"></span><span class="rr-time"></span>`;
      row.querySelector('.rr-pos').textContent = i + 1;
      row.querySelector('.rr-dot').style.background = sw;
      row.querySelector('.rr-name').textContent = r.isPlayer ? `${r.name} (you)` : r.name;
      row.querySelector('.rr-time').textContent = r.finished ? formatTime(r.time) : (race.qualify ? 'Out' : '—');
      list.appendChild(row);
    });
    $('res-title').textContent = info.title;
    $('res-sub').textContent = info.sub;
    $('res-next').hidden = !info.next;
    $('res-next').textContent = info.nextLabel || 'Next round';
    $('res-again').textContent = info.againLabel || 'Race again';
    this.openPanel('results');
  },

  // --- panels --------------------------------------------------------------------------
  openPanel(name) {
    const g = this.game;
    if (this.open === name && name !== 'results') { this.closePanels(); return; }
    if (g.state === 'intro' || g.state === 'loading') return;
    if (!this.open) this.prevState = g.state;
    for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== 'panel-' + name;
    const overTitle = this.prevState === 'title';
    $('overlay').hidden = false;
    $('overlay').style.zIndex = overTitle ? 34 : '';
    $('panel-' + name).style.zIndex = overTitle ? 35 : '';
    this.open = name;
    if (g.state === 'play' || g.state === 'race') g.state = 'menu';
    Input.releaseLock();
    g.sound.play('open');
    if (name === 'inv') {
      $('inv-survival').hidden = g.mode !== 'survival';
      $('inv-creative').hidden = g.mode !== 'creative';
      $('inv-title').textContent = g.mode === 'creative' ? 'All blocks & items' : 'Inventory & crafting';
      if (g.mode === 'creative') { $('pick-search').value = ''; this.renderPicker(); }
      else this.renderInv();
    }
    if (name === 'pause') { this.updateMenu(); g.saveNow(true); }
  },
  closePanels() {
    if (!this.open) return;
    const g = this.game;
    if (this.open === 'results') return;
    for (const p of document.querySelectorAll('.panel')) p.hidden = true;
    $('overlay').hidden = true;
    if (this.cursor) { g.giveBack(this.cursor); this.cursor = null; this.drawCursor(); }
    this.open = null;
    if (g.state === 'menu') g.state = this.prevState === 'menu' ? 'play' : (this.prevState || 'play');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    g.sound.play('close');
  },
  closeResults() {
    $('panel-results').hidden = true; $('overlay').hidden = true; this.open = null;
  },

  // --- inventory & crafting (survival) ---------------------------------------------------
  makeInvSlot(i) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'islot'; b.dataset.i = i;
    b.innerHTML = '<img alt=""><span class="cnt"></span>';
    b.addEventListener('click', e => this.clickSlot(i, e.shiftKey));
    b.addEventListener('contextmenu', e => { e.preventDefault(); this.clickSlot(i, false, true); });
    return b;
  },
  clickSlot(i, shift, half) {
    const g = this.game, inv = g.inv;
    const s = inv[i];
    if (shift && s) {
      // quick move between hotbar and backpack
      const range = i < 9 ? [9, 36] : [0, 9];
      inv[i] = null;
      const left = g.addToRange(s.id, s.n, range[0], range[1]);
      if (left) inv[i] = { id: s.id, n: left };
    } else if (!this.cursor) {
      if (s) {
        if (half && s.n > 1) { const k = Math.ceil(s.n / 2); this.cursor = { id: s.id, n: k }; s.n -= k; }
        else { this.cursor = s; inv[i] = null; }
      }
    } else if (!s) {
      if (half) { inv[i] = { id: this.cursor.id, n: 1 }; this.cursor.n--; if (!this.cursor.n) this.cursor = null; }
      else { inv[i] = this.cursor; this.cursor = null; }
    } else if (s.id === this.cursor.id) {
      const max = BLOCKS[s.id].stack, room = max - s.n;
      const k = half ? Math.min(1, room) : Math.min(room, this.cursor.n);
      s.n += k; this.cursor.n -= k;
      if (!this.cursor.n) this.cursor = null;
    } else { inv[i] = this.cursor; this.cursor = s; }
    g.sound.play('click');
    this.drawCursor();
    g.inventoryChanged();
  },
  drawCursor() {
    const c = $('cursor-stack');
    if (!this.cursor) { c.hidden = true; return; }
    c.hidden = false;
    c.querySelector('img').src = itemIcon(this.cursor.id);
    c.querySelector('.cnt').textContent = this.cursor.n > 1 ? this.cursor.n : '';
  },
  renderInv() {
    const g = this.game;
    document.querySelectorAll('.islot').forEach(b => {
      const s = g.inv[+b.dataset.i];
      const img = b.querySelector('img');
      if (s) { img.src = itemIcon(s.id); img.hidden = false; b.title = `${BLOCKS[s.id].name} × ${s.n}`; }
      else { img.hidden = true; b.title = 'Empty'; }
      b.querySelector('.cnt').textContent = s && s.n > 1 ? s.n : '';
      b.classList.toggle('sel', +b.dataset.i === g.sel);
    });
    this.renderCraft();
  },
  renderCraft() {
    const g = this.game, list = $('craft-list');
    [...$('craft-tabs').children].forEach(t => t.setAttribute('aria-selected', t.dataset.cat === this.craftTab ? 'true' : 'false'));
    list.textContent = '';
    const recs = RECIPES.filter(r => this.craftTab === 'All' || r.cat === this.craftTab)
      .map(r => ({ r, ok: g.canMake(r) }))
      .sort((a, b) => (b.ok - a.ok));
    for (const { r, ok } of recs) {
      const row = document.createElement('div');
      row.className = 'recipe' + (ok ? ' ok' : '');
      const out = BLOCKS[r.outId];
      row.innerHTML = `<img class="rc-icon" alt=""><div class="rc-body"><div class="rc-name"></div><div class="rc-in"></div></div><button type="button" class="btn small rc-make">Make</button>`;
      row.querySelector('.rc-icon').src = itemIcon(r.outId);
      row.querySelector('.rc-name').textContent = r.outN > 1 ? `${out.name} × ${r.outN}` : out.name;
      const ins = row.querySelector('.rc-in');
      for (const ing of r.ins) {
        const have = g.countItems(ing.ids);
        const chip = document.createElement('span');
        chip.className = 'chip-in' + (have >= ing.n ? ' have' : '');
        chip.innerHTML = '<img alt=""><span></span>';
        chip.querySelector('img').src = itemIcon(ing.ids[0]);
        chip.querySelector('span').textContent = `${Math.min(have, ing.n)}/${ing.n} ${ing.label}`;
        ins.appendChild(chip);
      }
      const btn = row.querySelector('.rc-make');
      btn.disabled = !ok;
      btn.addEventListener('click', e => { g.make(r, e.shiftKey ? 8 : 1); });
      list.appendChild(row);
    }
  },

  // --- creative picker ----------------------------------------------------------------------
  renderPicker() {
    const g = this.game, q = $('pick-search').value.trim().toLowerCase();
    [...$('pick-tabs').children].forEach(t => t.setAttribute('aria-selected', t.dataset.cat === this.tab ? 'true' : 'false'));
    const items = pickableItems().filter(d => (q ? d.name.toLowerCase().includes(q) : (this.tab === 'all' || d.cat === this.tab)));
    const grid = $('pick-grid');
    grid.textContent = '';
    if (!items.length) { grid.innerHTML = '<div class="empty">Nothing matches that search.</div>'; return; }
    const frag = document.createDocumentFragment();
    for (const d of items) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'item';
      b.innerHTML = '<img alt=""><span></span>';
      b.querySelector('img').src = itemIcon(d.id);
      b.querySelector('span').textContent = d.name;
      b.addEventListener('click', () => { g.setHotbarItem(g.sel, d.id); this.toast(`${d.name} is in slot ${g.sel + 1}`); });
      frag.appendChild(b);
    }
    grid.appendChild(frag);
  },

  updateMenu() {
    const g = this.game;
    $('pm-sound').textContent = `Sound: ${g.sound.enabled ? 'on' : 'off'}`;
    $('pm-music').textContent = `Music: ${g.sound.musicOn ? 'on' : 'off'}`;
    $('pm-dist').textContent = `View distance: ${['Near', 'Medium', 'Far'][g.distLevel]}`;
    $('pm-seed').textContent = g.world ? g.world.seedStr.replace(/^parkour:/, '') : '';
    $('pm-seedbox').hidden = g.mode === 'parkour';
    $('pm-save').hidden = g.mode === 'parkour';
    $('pm-quit').textContent = g.mode === 'parkour' ? 'Leave the race' : 'Save and quit to title';
  },
  copySeed() {
    const s = this.game.world.seedStr;
    try { navigator.clipboard.writeText(s).then(() => this.toast(`Seed “${s}” copied`), () => this.toast(`Seed: ${s}`)); }
    catch (e) { this.toast(`Seed: ${s}`); }
  },
  showDeath(cause) { $('death-cause').textContent = cause; $('death-screen').hidden = false; },
  hideDeath() { $('death-screen').hidden = true; },
};
