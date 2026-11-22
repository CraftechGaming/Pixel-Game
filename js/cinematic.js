'use strict';
// ---------------------------------------------------------------------------
// Cinematics: the opening fly-through, letterbox bars, title cards, fades,
// area discovery titles and the cinematic camera mode.
// ---------------------------------------------------------------------------

class Cinema {
  constructor(game) {
    this.game = game;
    this.el = {
      bars: document.getElementById('cine-bars'),
      title: document.getElementById('cine-title'),
      titleMain: document.querySelector('#cine-title .cine-main'),
      titleSub: document.querySelector('#cine-title .cine-sub'),
      zone: document.getElementById('zone-title'),
      zoneMain: document.querySelector('#zone-title .zone-main'),
      zoneSub: document.querySelector('#zone-title .zone-sub'),
      fade: document.getElementById('fade'),
      skip: document.getElementById('skip-btn'),
    };
    this.shots = null;
    this.shotIndex = 0;
    this.shotT = 0;
    this.titleTimer = null;
    this.zoneTimer = null;
    this.el.skip.addEventListener('click', () => this.skipIntro());
  }
  bars(on) { this.el.bars.classList.toggle('on', on); }
  fade(alpha, ms = 400) {
    const f = this.el.fade;
    f.style.transitionDuration = ms + 'ms';
    f.style.opacity = alpha;
  }
  flash(fn, ms = 350) {
    this.fade(1, ms);
    setTimeout(() => { fn(); this.fade(0, ms + 150); }, ms + 30);
  }
  title(main, sub, ms = 3800, cls = '') {
    const t = this.el.title;
    clearTimeout(this.titleTimer);
    t.className = cls;
    this.el.titleMain.textContent = main;
    this.el.titleSub.textContent = sub || '';
    void t.offsetWidth;
    t.classList.add('show');
    this.titleTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  hideTitle() { clearTimeout(this.titleTimer); this.el.title.classList.remove('show'); }
  zoneTitle(main, sub) {
    const z = this.el.zone;
    clearTimeout(this.zoneTimer);
    this.el.zoneMain.textContent = main;
    this.el.zoneSub.textContent = sub || '';
    z.classList.remove('show'); void z.offsetWidth; z.classList.add('show');
    this.zoneTimer = setTimeout(() => z.classList.remove('show'), 4200);
  }

  // --- opening fly-through -------------------------------------------------------
  playIntro() {
    const g = this.game, w = g.world;
    const sp = w.spawn;
    const village = w.zones.find(z => z.type === 'village' && z.x0 > sp.x);
    const city = w.zones.find(z => z.type === 'city');
    const course = w.courses.find(c => c.type === 'classic');
    const surf = x => w.surfaceY(x);
    const shots = [];
    shots.push({ from: [sp.x - 70, surf(sp.x) - 26, 0.5], to: [sp.x + 10, surf(sp.x) - 20, 0.58], dur: 5.5, main: 'PIXEL REALMS', sub: 'Build homes · Grow anything · Explore', cls: 'logo' });
    if (village) shots.push({ from: [village.x0 + 5, village.gy - 9, 0.95], to: [village.x0 + 75, village.gy - 8, 1.0], dur: 4.6, main: village.name, sub: 'A friendly village' });
    if (course) shots.push({ from: [course.x0 + 10, course.topY + 2, 0.8], to: [course.x1 - 20, course.topY + 3, 0.85], dur: 4.2, main: course.name, sub: 'Parkour course' });
    if (city) shots.push({ from: [city.x0 + 10, city.gy - 22, 0.5], to: [city.x0 + 150, city.gy - 26, 0.55], dur: 5, main: city.name, sub: 'The city of lights' });
    const p = g.player;
    shots.push({ from: [p.x + 40, p.y - 30, 0.45], to: [p.x, p.y - 1.4, 1], dur: 3.6, main: `Seed: ${w.seedStr}`, sub: 'Your adventure begins', last: true });
    this.shots = shots; this.shotIndex = -1; this.totalT = 0;
    this.totalDur = shots.reduce((a, s) => a + s.dur, 0);
    g.state = 'intro';
    this.bars(true);
    this.el.skip.hidden = false;
    this.nextShot();
  }
  nextShot() {
    this.shotIndex++;
    if (this.shotIndex >= this.shots.length) { this.endIntro(); return; }
    const s = this.shots[this.shotIndex];
    this.shotT = 0;
    this.fade(0, 500);
    this.title(s.main, s.sub, s.dur * 1000 - 700, s.cls || '');
    this.game.sound.play(this.shotIndex === 0 ? 'discover' : 'open');
  }
  updateIntro(dt) {
    const s = this.shots[this.shotIndex];
    if (!s) return;
    this.shotT += dt; this.totalT += dt;
    const u = easeInOut(clamp(this.shotT / s.dur, 0, 1));
    const cam = this.game.cam;
    cam.x = lerp(s.from[0], s.to[0], u);
    cam.y = lerp(s.from[1], s.to[1], u);
    cam.zoomMul = lerp(s.from[2], s.to[2], u);
    this.game.time = (0.968 + 0.075 * clamp(this.totalT / this.totalDur, 0, 1)) % 1;
    if (!s.last && this.shotT > s.dur - 0.45) this.fade(1, 400);
    if (this.shotT >= s.dur) this.nextShot();
  }
  skipIntro() {
    if (this.game.state !== 'intro') return;
    this.hideTitle();
    this.flash(() => this.endIntro(), 250);
  }
  endIntro() {
    const g = this.game;
    if (g.state !== 'intro') return;
    this.shots = null;
    this.el.skip.hidden = true;
    this.bars(false);
    this.fade(0, 400);
    g.time = 0.04;
    g.cam.x = g.player.x; g.cam.y = g.player.y - 1.4; g.cam.zoomMul = 1;
    g.startPlaying(true);
  }
}
