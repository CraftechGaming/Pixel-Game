'use strict';
// ---------------------------------------------------------------------------
// Parkour runtime: start / checkpoint / finish flags, timer, best times.
// Works for the generated courses and for courses players build themselves.
// ---------------------------------------------------------------------------

class Parkour {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.time = 0;
    this.cp = -1;
    this.respawn = null;
    this.touchNow = new Set();
    this.touchPrev = new Set();
    this.best = Store.get('pixelrealms.best', {});
  }
  key(c) { return this.game.world.seedStr + ':' + c.name; }
  bestFor(c) { return this.best[this.key(c)]; }
  touch(type, x, y) { this.touchNow.add(type + ':' + x + ':' + y); }
  isActiveFlag(x, y) { return !!(this.active && this.respawn && this.respawn.x === x && this.respawn.y === y && this.cp >= 0); }

  findCourse(type, x, y) {
    for (const c of this.game.world.courses) {
      if (type === 'start' && c.start && c.start.x === x && c.start.y === y) return c;
      if (type === 'finish' && c.finish && c.finish.x === x && c.finish.y === y) return c;
      if (type === 'check' && c.checks.some(p => p.x === x && p.y === y)) return c;
    }
    return null;
  }

  update(dt) {
    const g = this.game;
    for (const k of this.touchNow) {
      if (this.touchPrev.has(k)) continue;
      const [type, xs, ys] = k.split(':');
      this.onFlag(type, +xs, +ys);
    }
    this.touchPrev = this.touchNow;
    this.touchNow = new Set();
    if (!this.active) return;
    this.time += dt;
    const c = this.active, p = g.player;
    if (!c.custom) {
      const far = p.x < c.x0 - 30 || p.x > c.x1 + 30;
      if (far) { this.cancel('You left the course.'); return; }
      if (!p.fly) {
        if (c.failMode === 'below' && p.y > c.fallY && p.x > c.x0 - 3 && p.x < c.x1 + 3) this.fail();
        else if (c.failMode === 'relative' && p.y > this.respawn.y + 8) this.fail();
      }
    } else if (Math.abs(p.x - this.respawn.x) > 300) this.cancel('Custom course cancelled.');
    UI.updateParkour(this);
  }

  onFlag(type, x, y) {
    const g = this.game;
    const course = this.findCourse(type, x, y);
    if (type === 'start') {
      if (g.player.fly) { UI.toast('Turn off flying (F) to run a course.'); return; }
      const c = course || { name: 'Custom Course', custom: true, checks: [] };
      this.active = c; this.time = 0; this.cp = -1; this.respawn = { x, y };
      g.sound.play('start');
      g.fx.ring(x + 0.5, y + 0.5, 'rgba(110,230,120,0.9)', 2.5);
      UI.showParkour(this);
      UI.toast(c.custom ? 'Custom course started. Reach a Finish Flag!' : `${c.name}: GO!`);
      return;
    }
    if (!this.active) {
      if (type !== 'start' && course) UI.toast('Touch the green Start flag to begin this course.');
      return;
    }
    if (type === 'check') {
      if (this.active.custom) {
        if (this.respawn.x === x && this.respawn.y === y) return;
        this.cp++; this.respawn = { x, y };
      } else {
        if (course !== this.active) return;
        const i = this.active.checks.findIndex(q => q.x === x && q.y === y);
        if (i <= this.cp) return;
        this.cp = i; this.respawn = { x, y };
      }
      g.sound.play('check');
      g.fx.ring(x + 0.5, y + 0.5, 'rgba(120,180,255,0.9)', 2.5);
      g.fx.sparkle(x, y, 12, '#9fd0ff');
      const total = this.active.custom ? '' : `/${this.active.checks.length}`;
      UI.toast(`Checkpoint ${this.cp + 1}${total}`);
      return;
    }
    if (type === 'finish') {
      if (!this.active.custom && course !== this.active) return;
      this.finish(x, y);
    }
  }

  finish(x, y) {
    const g = this.game, c = this.active, t = this.time;
    let isBest = false;
    if (!c.custom) {
      const k = this.key(c), prev = this.best[k];
      isBest = prev === undefined || t < prev;
      if (isBest) { this.best[k] = t; Store.set('pixelrealms.best', this.best); }
    }
    this.active = null;
    UI.hideParkour();
    g.celebrate(x + 0.5, y, c.custom ? 'Course complete!' : `${c.name} complete!`, `Time ${formatTime(t)}${isBest ? '  ·  New best!' : ''}`);
  }

  fail() {
    const g = this.game, r = this.respawn;
    g.sound.play('hurt');
    g.teleport(r.x + 0.5, r.y + 1, { quick: true });
  }
  cancel(msg) {
    this.active = null;
    UI.hideParkour();
    UI.toast(msg);
  }
}
