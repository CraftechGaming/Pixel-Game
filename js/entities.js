'use strict';
// ---------------------------------------------------------------------------
// Entities: physics, the player, villagers, citizens, animals, birds, fish,
// butterflies, cars and falling blocks. All drawn procedurally as pixel art.
// Positions are in blocks: e.x = horizontal centre, e.y = feet.
// ---------------------------------------------------------------------------

const PHYS = {
  g: 38, jump: 13.2, run: 6.2, sprint: 8.8, accG: 70, accA: 34, fric: 52,
  iceAcc: 9, iceFric: 2.2, maxFall: 30, swimG: 7, swimMax: 3.2, swimUp: 5.5,
  climb: 4.8, fly: 11, bounce: 19.5, bounceHi: 22.5, boost: 15.5, coyote: 0.1, buffer: 0.13,
};

const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

function tileBlocks(world, tx, ty, e, dir, prevBot) {
  const d = BLOCKS[world.get(tx, ty)];
  if (d.solid && !d.platform) return true;
  if (dir === 'down' && !e.dropDown && prevBot <= ty + 0.02) {
    if (d.platform) return true;
    if (d.climb && !BLOCKS[world.get(tx, ty - 1)].climb) return true;
  }
  return false;
}

function moveEntity(e, world, dt) {
  e.hitWall = 0;
  if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) { e.x = world.spawn.x; e.y = world.spawn.y; e.vx = e.vy = 0; }
  const dx = e.vx * dt;
  if (dx !== 0) {
    e.x += dx;
    const y0 = Math.floor(e.y - e.h + 0.001), y1 = Math.floor(e.y - 0.001);
    if (dx > 0) {
      const tx = Math.floor(e.x + e.w / 2);
      for (let ty = y0; ty <= y1; ty++) if (tileBlocks(world, tx, ty, e, 'x')) { e.x = tx - e.w / 2 - 0.0001; e.vx = 0; e.hitWall = 1; break; }
    } else {
      const tx = Math.floor(e.x - e.w / 2);
      for (let ty = y0; ty <= y1; ty++) if (tileBlocks(world, tx, ty, e, 'x')) { e.x = tx + 1 + e.w / 2 + 0.0001; e.vx = 0; e.hitWall = -1; break; }
    }
  }
  const prevBot = e.y;
  const dy = e.vy * dt;
  e.wasGround = e.onGround;
  e.onGround = false;
  e.y += dy;
  const x0 = Math.floor(e.x - e.w / 2 + 0.001), x1 = Math.floor(e.x + e.w / 2 - 0.001);
  if (dy > 0) {
    const ty = Math.floor(e.y);
    let hit = -1;
    for (let tx = x0; tx <= x1; tx++) {
      if (tileBlocks(world, tx, ty, e, 'down', prevBot)) { if (hit < 0 || Math.abs(tx + 0.5 - e.x) < Math.abs(hit + 0.5 - e.x)) hit = tx; }
    }
    if (hit >= 0) {
      e.landSpeed = e.vy;
      e.y = ty; e.vy = 0; e.onGround = true; e.groundX = hit; e.groundY = ty;
    }
  } else if (dy < 0) {
    const ty = Math.floor(e.y - e.h);
    for (let tx = x0; tx <= x1; tx++) if (tileBlocks(world, tx, ty, e, 'up')) { e.y = ty + 1 + e.h + 0.0001; e.vy = 0; e.bonk = true; break; }
  }
}

function overlapsTiles(e, fn) {
  const x0 = Math.floor(e.x - e.w / 2), x1 = Math.floor(e.x + e.w / 2 - 0.0001);
  const y0 = Math.floor(e.y - e.h), y1 = Math.floor(e.y - 0.0001);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y);
}

// --- looks -------------------------------------------------------------------------
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#d9a066'];
const HAIRS = ['#2b1b10', '#5a3825', '#a0522d', '#d6b370', '#1c1c1c', '#b5b5b5', '#c2532b'];
function villagerLook(job, rng) {
  const base = { skin: rng.pick(SKINS), hair: rng.pick(HAIRS), shoes: '#3b2a1e', pants: '#4a3b2a', scale: 1 };
  switch (job) {
    case 'farmer': return Object.assign(base, { shirt: '#6b8e3a', pants: '#5a4630', hat: 'straw' });
    case 'baker': return Object.assign(base, { shirt: '#f1ede4', apron: '#d9cdb4', hat: 'chef' });
    case 'librarian': return Object.assign(base, { shirt: '#6a4c93', robe: true, glasses: true });
    case 'smith': return Object.assign(base, { shirt: '#5c5c66', apron: '#6e4829' });
    case 'kid': return Object.assign(base, { shirt: rng.pick(['#e85d5d', '#5d8de8', '#f0c43a']), pants: '#3c5a8a', scale: 0.72 });
    case 'merchant': return Object.assign(base, { shirt: '#b8433a', robe: true, hat: 'band' });
    case 'priest': return Object.assign(base, { shirt: '#ece7dc', robe: true });
    default: return Object.assign(base, { shirt: '#8a6a4a' });
  }
}
function citizenLook(rng) {
  return {
    skin: rng.pick(SKINS), hair: rng.pick(HAIRS), shoes: '#1e1e22', scale: 1,
    shirt: rng.pick(['#2f3b52', '#3d5a80', '#7a2e3a', '#2e6b5e', '#cfcfcf', '#d98e32', '#5b3f8a']),
    pants: rng.pick(['#22252e', '#3b3f4a', '#2a3a5c', '#5a4a3a']),
    hat: rng.chance(0.25) ? 'cap' : null, tie: rng.chance(0.4),
  };
}
const PLAYER_LOOK = { skin: '#f1c27d', hair: '#5a3825', shirt: '#2f9e8f', pants: '#2c3e66', shoes: '#3b2a1e', backpack: '#a0703f', scale: 1 };

// --- base class ----------------------------------------------------------------------
class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0; this.facing = 1;
    this.onGround = false; this.walkPhase = 0; this.dead = false;
    this.inWater = false; this.squash = 0; this.t = Math.random() * 10;
  }
  near(px, py, r) { return Math.abs(this.x - px) < r && Math.abs(this.y - py) < r; }
}

// --- player --------------------------------------------------------------------------
class Player extends Entity {
  constructor(x, y) {
    super(x, y, 0.7, 1.72);
    this.fly = false; this.climbing = false; this.coyote = 0; this.jumpBuf = 0;
    this.boostT = 0; this.boostDir = 1; this.mineT = 0; this.placeT = 0;
    this.scarf = []; for (let i = 0; i < 6; i++) this.scarf.push({ x, y: y - 1.4 });
    this.blinkT = 2; this.heldTi = -1; this.jumpCut = false;
    this.look = PLAYER_LOOK;
  }
  update(dt, inp, world, game) {
    this.t += dt;
    const mv = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (mv) this.facing = mv;
    const cx = Math.floor(this.x);
    this.inWater = world.get(cx, Math.floor(this.y - 0.5)) === B.water;
    this.headInWater = world.get(cx, Math.floor(this.y - this.h + 0.3)) === B.water;
    let onLadder = false, hurt = false;
    overlapsTiles(this, (x, y) => {
      const d = BLOCKS[world.get(x, y)];
      if (d.climb) onLadder = true;
      if (d.hurt) hurt = true;
      if (d.flag) game.onFlag(d.flag, x, y);
    });
    if (hurt) { game.respawnPlayer('lava'); return; }
    if (!onLadder) this.climbing = false;
    else if ((inp.up || inp.down) && !this.fly) this.climbing = true;
    this.dropDown = inp.down;

    const P = PHYS;
    if (inp.jumpPressed) this.jumpBuf = P.buffer; else this.jumpBuf -= dt;
    this.boostT -= dt;

    if (this.fly) {
      this.vx = approach(this.vx, mv * P.fly * (inp.sprint ? 1.6 : 1), 60 * dt);
      const vyT = ((inp.up || inp.jumpHeld) ? -1 : 0) + (inp.down ? 1 : 0);
      this.vy = approach(this.vy, vyT * P.fly, 60 * dt);
      this.dropDown = true;
    } else if (this.climbing) {
      this.vy = inp.up ? -P.climb : inp.down ? P.climb : 0;
      this.vx = approach(this.vx, mv * 3.2, 40 * dt);
      this.climbPhase = (this.climbPhase || 0) + Math.abs(this.vy) * dt * 3;
      if (inp.jumpPressed && mv) { this.climbing = false; this.vy = -P.jump * 0.7; this.vx = mv * 4; this.jumpBuf = 0; }
    } else {
      const ground = this.onGround;
      const gid = ground ? world.get(this.groundX, this.groundY) : 0;
      const slip = ground && BLOCKS[gid].slip;
      let maxS = inp.sprint ? P.sprint : P.run;
      if (this.inWater) maxS *= 0.6;
      const acc = ground ? (slip ? P.iceAcc : P.accG) : P.accA;
      if (this.boostT > 0 && (mv === 0 || mv === this.boostDir)) this.vx = this.boostDir * Math.max(Math.abs(this.vx), P.boost);
      else if (mv) this.vx = approach(this.vx, mv * maxS, acc * dt * (Math.sign(this.vx) !== mv && slip ? 1 : 1));
      else this.vx = approach(this.vx, 0, (ground ? (slip ? P.iceFric : P.fric) : 9) * dt);

      if (ground) this.coyote = P.coyote; else this.coyote -= dt;
      if (this.inWater) {
        this.vy = Math.min(this.vy + P.swimG * dt, P.swimMax);
        if (inp.jumpHeld || inp.up) this.vy = approach(this.vy, -P.swimUp, 30 * dt);
        if (inp.down) this.vy = approach(this.vy, P.swimMax * 1.6, 20 * dt);
        if (!this.headInWater && inp.jumpPressed) { this.vy = -9.5; game.fx.splash(this.x, this.y - 1); }
      } else {
        if (this.jumpBuf > 0 && this.coyote > 0) {
          this.vy = -P.jump; this.jumpBuf = 0; this.coyote = 0; this.jumpCut = true;
          game.sound.play('jump');
          game.fx.dust(this.x, this.y, 4);
        }
        if (this.jumpCut && !inp.jumpHeld && this.vy < -3) { this.vy *= 0.5; this.jumpCut = false; }
        if (this.vy >= 0) this.jumpCut = false;
        this.vy = Math.min(this.vy + P.g * dt, P.maxFall);
      }
    }
    const wasWater = this.inWater;
    moveEntity(this, world, dt);
    if (this.bonk) { this.bonk = false; this.jumpCut = false; }

    if (this.onGround && !this.wasGround) {
      const ls = this.landSpeed || 0;
      if (ls > 8) { this.squash = Math.min(0.3, ls / 70); game.fx.dust(this.x, this.y, Math.min(10, ls / 3)); game.sound.play('land', { vol: Math.min(1, ls / 25) }); }
      if (ls > 22) game.shake(Math.min(0.5, (ls - 22) / 20));
    }
    if (this.onGround && !this.fly) {
      const gid = world.get(this.groundX, this.groundY), gd = BLOCKS[gid];
      if (gd.bounce && !inp.down) {
        this.vy = -(inp.jumpHeld ? P.bounceHi : P.bounce); this.onGround = false; this.squash = 0.35;
        game.sound.play('bounce'); game.fx.burst(this.x, this.y, '#9cf28f', 10);
      } else if (gd.boost) {
        if (this.boostT < 0.6) game.sound.play('boost');
        this.boostT = 0.9; this.boostDir = mv || this.facing;
        if (Math.random() < 0.6) game.fx.speedLine(this.x, this.y - 0.8, this.boostDir);
      } else if (gd.crumble) world.triggerCrumble(this.groundX, this.groundY);
    }
    if (!wasWater && this.inWater && Math.abs(this.vy) > 3) { game.fx.splash(this.x, this.y - 0.3); game.sound.play('splash'); }
    if (this.inWater && Math.random() < dt * 3) game.fx.bubble(this.x + (Math.random() - 0.5) * 0.4, this.y - this.h + 0.3);

    const speed = Math.abs(this.vx);
    if (this.onGround) {
      this.walkPhase += speed * dt * 2.4;
      if (speed > 1 && Math.floor(this.walkPhase / Math.PI) !== Math.floor((this.walkPhase - speed * dt * 2.4) / Math.PI)) game.sound.play('step', { block: world.get(this.groundX, this.groundY) });
    } else this.walkPhase += dt * 3;
    this.squash = Math.max(0, this.squash - dt * 2.5);
    this.mineT = Math.max(0, this.mineT - dt);
    this.placeT = Math.max(0, this.placeT - dt);
    this.blinkT -= dt; if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3;

    // scarf follows the neck with a little lag and flutter
    const k = 1 - Math.exp(-dt * 22);
    this.scarf[0].x = this.x - this.facing * 0.14; this.scarf[0].y = this.y - 1.38;
    for (let i = 1; i < this.scarf.length; i++) {
      const prev = this.scarf[i - 1], p = this.scarf[i];
      const flutter = Math.sin(this.t * 11 + i * 1.3) * 0.03 * (0.4 + Math.min(1, speed / 6));
      const tx = prev.x - this.facing * 0.1 - this.vx * 0.012;
      const ty = prev.y + 0.045 + flutter - Math.min(0.08, speed * 0.008) + (this.vy < 0 ? 0.03 : -this.vy * 0.004);
      p.x += (tx - p.x) * k; p.y += (ty - p.y) * k;
    }
  }
  draw(ctx, r) {
    // scarf behind the body
    ctx.strokeStyle = '#d84343'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, r.bs * 0.14);
    ctx.beginPath();
    this.scarf.forEach((p, i) => { const sx = r.sx(p.x), sy = r.sy(p.y); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
    ctx.stroke();
    drawHumanoid(ctx, r, this, this.look);
  }
}

function limb(ctx, px, py, w, len, ang, color, end) {
  ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
  ctx.fillStyle = color; ctx.fillRect(-w / 2, 0, w, len);
  if (end) { ctx.fillStyle = end; ctx.fillRect(-w / 2, len - 2, w, 2); }
  ctx.restore();
}

function drawHumanoid(ctx, r, e, look) {
  const p = (r.bs / 16) * (look.scale || 1);
  ctx.save();
  ctx.translate(Math.round(r.sx(e.x)), Math.round(r.sy(e.y)));
  const sq = e.squash || 0;
  ctx.scale(e.facing * p * (1 + sq * 0.5), p * (1 - sq));
  const speed = Math.min(1, Math.abs(e.vx) / 5);
  const ph = e.walkPhase;
  const sw = Math.sin(ph) * 0.75 * speed;
  let legA = sw, legB = -sw, armA = -sw * 0.9, armB = sw * 0.9;
  const air = !e.onGround && !e.climbing && !e.inWater && !e.fly;
  if (air) { legA = 0.55; legB = -0.4; armA = e.vy < 0 ? -2.4 : -1.6; armB = e.vy < 0 ? 2.2 : 1.4; }
  if (e.inWater && !e.onGround) { const s = Math.sin(e.t * 6); armA = -2 + s; armB = -2 - s; legA = s * 0.4; legB = -s * 0.4; }
  if (e.fly) { legA = 0.15; legB = -0.1; armA = -0.4 + Math.sin(e.t * 3) * 0.1; armB = 0.3; }
  if (e.climbing) { const c = Math.sin(e.climbPhase || 0) * 0.6; armA = -2.7 + c; armB = -2.7 - c; legA = c * 0.5; legB = -c * 0.5; }
  if (e.mineT > 0) armA = -1.3 - Math.sin(e.mineT * 28) * 0.9;
  if (e.placeT > 0) armA = -1.5 + e.placeT * 4;
  const bob = e.onGround && speed > 0.1 ? Math.abs(Math.sin(ph)) * 0.8 : Math.sin(e.t * 2) * 0.3;
  const shoe = look.shoes, pants = look.pants;
  const dark = c => rgbCss(shadeRgb(hexRgb(c), 0.78));
  // back limbs
  limb(ctx, -0.5, -9, 3, 9, legB, dark(pants), dark(shoe));
  limb(ctx, -0.5, -17 - bob, 3, 8, armB, dark(look.shirt), dark(look.skin));
  if (look.backpack) { ctx.fillStyle = look.backpack; ctx.fillRect(-6, -17 - bob, 3, 7); ctx.fillStyle = '#7a5332'; ctx.fillRect(-6, -14 - bob, 3, 1); }
  // body
  ctx.fillStyle = look.shirt;
  ctx.fillRect(-3, -18 - bob, 6, look.robe ? 15 : 9);
  if (look.apron) { ctx.fillStyle = look.apron; ctx.fillRect(0, -16 - bob, 3, 8); }
  if (look.tie) { ctx.fillStyle = '#b8433a'; ctx.fillRect(1.5, -18 - bob, 1, 5); }
  if (!look.robe) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-3, -10 - bob, 6, 1); }
  // front leg
  if (!look.robe || speed > 0.05) limb(ctx, 0.5, -9, 3, 9, legA, pants, shoe);
  else { ctx.fillStyle = shoe; ctx.fillRect(-1, -2, 4, 2); }
  // head
  const hy = -26 - bob;
  ctx.fillStyle = look.skin; ctx.fillRect(-4, hy, 8, 8);
  ctx.fillStyle = look.hair; ctx.fillRect(-4, hy, 8, 2); ctx.fillRect(-4, hy, 2, 5);
  const blink = e.blinkT !== undefined && e.blinkT < 0;
  ctx.fillStyle = '#1d1d24';
  ctx.fillRect(1, hy + 3.5, 1, blink ? 0.4 : 1.6); ctx.fillRect(3, hy + 3.5, 1, blink ? 0.4 : 1.6);
  ctx.fillStyle = 'rgba(200,80,80,0.35)'; ctx.fillRect(2.5, hy + 5.6, 1.5, 0.8);
  if (look.glasses) { ctx.fillStyle = '#222'; ctx.fillRect(0.5, hy + 3.2, 4, 0.5); }
  if (look.hat === 'straw') { ctx.fillStyle = '#e3c770'; ctx.fillRect(-6, hy - 0.5, 12, 1.5); ctx.fillRect(-3.5, hy - 2.5, 7, 2); ctx.fillStyle = '#b5543a'; ctx.fillRect(-3.5, hy - 1, 7, 0.6); }
  if (look.hat === 'chef') { ctx.fillStyle = '#ffffff'; ctx.fillRect(-4, hy - 4, 8, 4); ctx.fillRect(-5, hy - 6, 10, 3); }
  if (look.hat === 'cap') { ctx.fillStyle = '#c0392b'; ctx.fillRect(-4, hy - 1, 8, 2); ctx.fillRect(2, hy, 4, 1); }
  if (look.hat === 'band') { ctx.fillStyle = '#f0c43a'; ctx.fillRect(-4, hy + 0.5, 8, 1.2); }
  // front arm with held item
  ctx.save(); ctx.translate(0.5, -17 - bob); ctx.rotate(armA);
  ctx.fillStyle = look.shirt; ctx.fillRect(-1.5, 0, 3, 8);
  ctx.fillStyle = look.skin; ctx.fillRect(-1.5, 6, 3, 2);
  if (e.heldTi >= 0) {
    const sx = (e.heldTi % TEX.cols) * TS, sy = Math.floor(e.heldTi / TEX.cols) * TS;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(TEX.atlas, sx, sy, TS, TS, -1, 5.5, 6, 6);
  }
  ctx.restore();
  ctx.restore();
}

// --- villagers & citizens ---------------------------------------------------------------
const VILLAGER_LINES = [
  'Lovely day for building!', 'Try a House Seed. It grows a whole home!', 'Water flows downhill. Dig a canal!',
  'The parkour course west of town is fun.', 'Wonder Seeds grow into surprises.', 'Crops grow faster near water.',
  'Fertilizer makes plants grow instantly.', 'Sleep in a bed to skip the night.', 'Have you visited the city lights?',
  'Press M to open the map and travel.', 'My grandma planted that tree!', 'Torches keep caves cozy.',
  'Hold Shift to run faster.', 'I heard there is a tower you can climb.',
];
const CITIZEN_LINES = [
  'Rooftop Rush starts on top of the towers!', 'Ladders inside every tower go to the roof.', 'Traffic is wild today.',
  'The city looks best at night.', 'Have you seen the park fountain?', 'I work on the 9th floor.',
  'Speed Pads launch you really far.', 'Watch out for the crumbling platforms out west!',
];

class NPC extends Entity {
  constructor(spawn, rng) {
    super(spawn.x, spawn.y, 0.7, 1.72);
    this.kind = spawn.kind;
    this.look = spawn.kind === 'citizen' ? citizenLook(rng) : villagerLook(spawn.job, rng);
    if (this.look.scale < 1) this.h = 1.25;
    this.x0 = spawn.x0; this.x1 = spawn.x1;
    this.state = 'idle'; this.timer = rng.range(0.5, 3); this.dir = 1;
    this.talk = null; this.talkT = 0; this.talkCd = rng.range(0, 4);
    this.lines = spawn.kind === 'citizen' ? CITIZEN_LINES : VILLAGER_LINES;
    this.speed = spawn.kind === 'citizen' ? 2.1 : 1.6;
    this.blinkT = 3;
  }
  update(dt, world, game) {
    this.t += dt;
    this.timer -= dt; this.talkCd -= dt; this.talkT -= dt;
    const pl = game.player;
    const dist = Math.hypot(pl.x - this.x, pl.y - this.y);
    if (dist < 3.2 && this.talkCd <= 0) {
      this.talk = this.lines[Math.floor(Math.random() * this.lines.length)];
      this.talkT = 4.5; this.talkCd = 14; this.state = 'idle'; this.timer = 3;
      this.facing = pl.x > this.x ? 1 : -1;
      game.sound.play('talk');
    }
    if (this.timer <= 0) {
      if (this.state === 'walk' || Math.random() < 0.35) { this.state = 'idle'; this.timer = 1 + Math.random() * 3; }
      else { this.state = 'walk'; this.timer = 2 + Math.random() * 4; this.dir = Math.random() < 0.5 ? -1 : 1; }
    }
    if (this.x < this.x0) this.dir = 1;
    if (this.x > this.x1) this.dir = -1;
    const target = this.state === 'walk' && this.talkT <= 0 ? this.dir * this.speed : 0;
    this.vx = approach(this.vx, target, 20 * dt);
    if (this.vx) this.facing = Math.sign(this.vx);
    this.inWater = world.get(Math.floor(this.x), Math.floor(this.y - 0.5)) === B.water;
    if (this.inWater) this.vy = approach(this.vy, -3, 20 * dt);
    else this.vy = Math.min(this.vy + PHYS.g * dt, PHYS.maxFall);
    moveEntity(this, world, dt);
    if (this.hitWall && this.onGround) {
      // hop up one-block steps, otherwise turn around
      const ahead = Math.floor(this.x + this.dir * 0.8);
      const step = !BLOCKS[world.get(ahead, Math.floor(this.y) - 2)].solid && !BLOCKS[world.get(ahead, Math.floor(this.y) - 3)].solid;
      if (step) this.vy = -11; else { this.dir = -this.dir; this.timer = 2; }
    }
    if (this.onGround) this.walkPhase += Math.abs(this.vx) * dt * 2.4;
    this.blinkT -= dt; if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3;
  }
  draw(ctx, r) {
    drawHumanoid(ctx, r, this, this.look);
  }
}

// --- animals -------------------------------------------------------------------------------
const ANIMALS = {
  chicken: { w: 0.5, h: 0.65, speed: 1.2 },
  pig: { w: 0.9, h: 0.8, speed: 1.0 },
  sheep: { w: 1.0, h: 0.95, speed: 0.9 },
};
class Animal extends Entity {
  constructor(spawn) {
    const a = ANIMALS[spawn.animal];
    super(spawn.x, spawn.y, a.w, a.h);
    this.animal = spawn.animal; this.speed = a.speed;
    this.x0 = spawn.x0; this.x1 = spawn.x1;
    this.state = 'idle'; this.timer = Math.random() * 3; this.dir = 1; this.peck = 0;
    this.wool = ['#f4f4f0', '#e8e2d8', '#d9d9d9', '#4a4a4a'][Math.floor(Math.random() * 4)];
  }
  update(dt, world, game) {
    this.t += dt; this.timer -= dt;
    if (this.timer <= 0) {
      if (this.state === 'walk' || Math.random() < 0.4) { this.state = 'idle'; this.timer = 1 + Math.random() * 3; if (Math.random() < 0.5) this.peck = 0.8; }
      else { this.state = 'walk'; this.timer = 1.5 + Math.random() * 3; this.dir = Math.random() < 0.5 ? -1 : 1; }
      if (Math.random() < 0.12 && this.near(game.player.x, game.player.y, 12)) game.sound.play(this.animal);
    }
    // run away from the player when very close
    const pl = game.player;
    if (Math.abs(pl.x - this.x) < 1.6 && Math.abs(pl.y - this.y) < 2) { this.state = 'walk'; this.dir = pl.x > this.x ? -1 : 1; this.timer = 1; }
    if (this.x < this.x0) this.dir = 1;
    if (this.x > this.x1) this.dir = -1;
    this.peck -= dt;
    this.vx = approach(this.vx, this.state === 'walk' ? this.dir * this.speed : 0, 10 * dt);
    if (this.vx) this.facing = Math.sign(this.vx);
    this.inWater = world.get(Math.floor(this.x), Math.floor(this.y - 0.3)) === B.water;
    if (this.inWater) this.vy = approach(this.vy, -2, 20 * dt);
    else this.vy = Math.min(this.vy + PHYS.g * dt, this.animal === 'chicken' ? 4 : PHYS.maxFall);
    moveEntity(this, world, dt);
    if (this.hitWall && this.onGround) { if (Math.random() < 0.6) this.vy = -10.5; else this.dir = -this.dir; }
    if (this.onGround) this.walkPhase += Math.abs(this.vx) * dt * 5;
  }
  draw(ctx, r) {
    const p = r.bs / 16;
    ctx.save();
    ctx.translate(Math.round(r.sx(this.x)), Math.round(r.sy(this.y)));
    ctx.scale(this.facing * p, p);
    const leg = Math.sin(this.walkPhase) * 1.2;
    const peck = this.peck > 0 ? Math.sin((0.8 - this.peck) * 8) * 2 + 2 : 0;
    const R = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    if (this.animal === 'chicken') {
      R('#e8b13a', -1 + leg * 0.4, -3, 1, 3); R('#e8b13a', 1 - leg * 0.4, -3, 1, 3);
      R('#f7f4ee', -3, -8, 7, 5); R('#e9e4da', -4.5, -9.5, 2, 4);
      const flap = !this.onGround ? Math.sin(this.t * 30) * 1.5 : 0;
      R('#ddd6c8', -1.5, -7 - flap, 3, 2);
      R('#f7f4ee', 2, -11 + peck, 3, 4); R('#d23a2f', 2, -12 + peck, 2, 1); R('#e8b13a', 5, -9.5 + peck, 1.5, 1);
      R('#1d1d24', 3.6, -10 + peck, 0.8, 0.8);
    } else if (this.animal === 'pig') {
      R('#d9868f', -4 + leg * 0.4, -3, 2, 3); R('#d9868f', 2 - leg * 0.4, -3, 2, 3);
      R('#efa3ac', -5, -9, 10, 6); R('#efa3ac', 4, -10 + peck * 0.5, 5, 5);
      R('#d9868f', 8, -8 + peck * 0.5, 2, 2); R('#1d1d24', 6, -9 + peck * 0.5, 0.9, 0.9);
      R('#e48f99', -6, -8, 1.5, 1.5);
    } else {
      R('#3b3b3b', -4 + leg * 0.4, -4, 2, 4); R('#3b3b3b', 2 - leg * 0.4, -4, 2, 4);
      R(this.wool, -5.5, -11, 11, 7);
      ctx.fillStyle = this.wool;
      for (const [bx, by] of [[-5, -12], [-2, -12.5], [1, -12], [4, -11.5]]) ctx.fillRect(bx, by, 3, 2);
      R('#3b3b3b', 4, -12 + peck * 0.6, 4, 4); R('#f4f4f0', 3.5, -12.5 + peck * 0.6, 2, 1.5);
      R('#ffffff', 6, -11 + peck * 0.6, 0.9, 0.9);
    }
    ctx.restore();
  }
}

// --- ambient creatures -------------------------------------------------------------------
class Bird extends Entity {
  constructor(x, y) {
    super(x, y, 0.3, 0.3);
    this.vx = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 2.5);
    this.baseY = y; this.color = Math.random() < 0.3 ? '#3a4a6a' : '#2a2a30';
  }
  update(dt, world, game) {
    this.t += dt;
    const pl = game.player;
    if (Math.abs(pl.x - this.x) < 5 && Math.abs(pl.y - this.y) < 4) { this.baseY -= dt * 6; this.vx += Math.sign(this.vx) * dt * 4; }
    this.x += this.vx * dt;
    this.y = this.baseY + Math.sin(this.t * 1.7) * 0.8;
    this.facing = Math.sign(this.vx);
    if (Math.abs(this.x - game.cam.x) > 90) this.dead = true;
  }
  draw(ctx, r) {
    const p = r.bs / 16;
    ctx.save(); ctx.translate(r.sx(this.x), r.sy(this.y)); ctx.scale(this.facing * p, p);
    ctx.fillStyle = this.color;
    const f = Math.sin(this.t * 14) > 0;
    ctx.fillRect(-1, -1, 3, 2);
    if (f) { ctx.fillRect(-4, -3, 3, 1); ctx.fillRect(1, -3, 3, 1); ctx.fillRect(-2, -2, 1, 1); ctx.fillRect(1, -2, 1, 1); }
    else { ctx.fillRect(-4, 0, 3, 1); ctx.fillRect(1, 0, 3, 1); }
    ctx.fillStyle = '#e8b13a'; ctx.fillRect(2, -0.5, 1, 0.8);
    ctx.restore();
  }
}

class Fish extends Entity {
  constructor(x, y) {
    super(x, y, 0.4, 0.3);
    this.dir = Math.random() < 0.5 ? -1 : 1; this.timer = 2;
    this.color = ['#f08a3a', '#f2d14a', '#5db8ff', '#ff6b8a', '#9be36b'][Math.floor(Math.random() * 5)];
    this.vyT = 0;
  }
  update(dt, world, game) {
    this.t += dt; this.timer -= dt;
    if (this.timer <= 0) { this.timer = 1.5 + Math.random() * 3; if (Math.random() < 0.4) this.dir = -this.dir; this.vyT = (Math.random() - 0.5) * 0.8; }
    const pl = game.player;
    if (Math.abs(pl.x - this.x) < 2 && Math.abs(pl.y - 1 - this.y) < 2) this.dir = pl.x > this.x ? -1 : 1;
    const nx = this.x + this.dir * 1.6 * dt * 3;
    if (world.get(Math.floor(nx + this.dir * 0.3), Math.floor(this.y)) !== B.water) this.dir = -this.dir;
    else this.x += this.dir * 1.6 * dt;
    const ny = this.y + this.vyT * dt;
    if (world.get(Math.floor(this.x), Math.floor(ny - 0.2)) === B.water && world.get(Math.floor(this.x), Math.floor(ny + 0.2)) === B.water) this.y = ny;
    else this.vyT = -this.vyT;
    this.facing = this.dir;
    if (world.get(Math.floor(this.x), Math.floor(this.y)) !== B.water) this.dead = true;
    if (Math.abs(this.x - game.cam.x) > 80) this.dead = true;
  }
  draw(ctx, r) {
    const p = r.bs / 16;
    ctx.save(); ctx.translate(r.sx(this.x), r.sy(this.y)); ctx.scale(this.facing * p, p);
    ctx.fillStyle = this.color; ctx.fillRect(-2.5, -1.5, 5, 3);
    const wag = Math.sin(this.t * 12) * 1;
    ctx.fillRect(-4.5, -1.5 + wag * 0.5, 2, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-1.5, -1.5, 3, 1);
    ctx.fillStyle = '#1d1d24'; ctx.fillRect(1.2, -0.8, 0.8, 0.8);
    ctx.restore();
  }
}

class Butterfly extends Entity {
  constructor(x, y) {
    super(x, y, 0.2, 0.2);
    this.color = ['#ff9f43', '#5db8ff', '#f368e0', '#feca57', '#ffffff'][Math.floor(Math.random() * 5)];
    this.tx = x; this.ty = y; this.life = 25 + Math.random() * 20;
  }
  update(dt, world, game) {
    this.t += dt; this.life -= dt;
    if (Math.random() < dt * 0.8) { this.tx = this.x + (Math.random() - 0.5) * 6; this.ty = this.y + (Math.random() - 0.5) * 2.5; }
    this.x += (this.tx - this.x) * dt * 0.8 + Math.sin(this.t * 5) * dt * 0.6;
    this.y += (this.ty - this.y) * dt * 0.8 + Math.cos(this.t * 7) * dt * 0.8;
    if (BLOCKS[world.get(Math.floor(this.x), Math.floor(this.y))].solid) this.ty -= 1;
    this.facing = this.tx > this.x ? 1 : -1;
    if (this.life < 0 || Math.abs(this.x - game.cam.x) > 70) this.dead = true;
  }
  draw(ctx, r) {
    const p = r.bs / 16;
    const f = Math.abs(Math.sin(this.t * 16));
    ctx.save(); ctx.translate(r.sx(this.x), r.sy(this.y)); ctx.scale(p, p);
    ctx.fillStyle = this.color;
    ctx.fillRect(-2.5 * f - 0.5, -2, 2.5 * f, 2.5); ctx.fillRect(0.5, -2, 2.5 * f, 2.5);
    ctx.fillStyle = '#2a2a30'; ctx.fillRect(-0.5, -2, 1, 3);
    ctx.restore();
  }
}

const CAR_COLORS = ['#d64545', '#3d7bd6', '#f2f2f2', '#2b2d31', '#3fae6a', '#e89a2c', '#8a4fc7'];
class Car extends Entity {
  constructor(road, rng) {
    super(rng.range(road.x0 + 4, road.x1 - 4), road.y, 3, 1.3);
    this.road = road;
    this.type = rng.pick(['sedan', 'sedan', 'taxi', 'van', 'bus']);
    this.len = this.type === 'bus' ? 5 : this.type === 'van' ? 3.4 : 3;
    this.dir = rng.chance(0.5) ? -1 : 1;
    this.speed = this.type === 'bus' ? rng.range(3.5, 4.5) : rng.range(5, 8.5);
    this.color = this.type === 'taxi' ? '#f2c230' : this.type === 'bus' ? rng.pick(['#d64545', '#3d7bd6', '#3fae6a']) : rng.pick(CAR_COLORS);
    this.wheel = 0; this.pause = 0; this.lane = rng.chance(0.5) ? 0 : 0.12;
  }
  update(dt, world, game) {
    this.t += dt;
    if (this.pause > 0) { this.pause -= dt; return; }
    this.x += this.dir * this.speed * dt;
    this.wheel += this.speed * dt * 2;
    if (this.x > this.road.x1 - this.len / 2 && this.dir > 0) { this.dir = -1; this.pause = 0.6; }
    if (this.x < this.road.x0 + this.len / 2 && this.dir < 0) { this.dir = 1; this.pause = 0.6; }
    const pl = game.player;
    if (Math.abs(pl.x - this.x) < this.len / 2 + 0.5 && Math.abs(pl.y - this.y) < 1 && Math.random() < dt * 0.5) game.sound.play('honk');
  }
  draw(ctx, r) {
    const p = r.bs / 16;
    const L = this.len * 16;
    ctx.save(); ctx.translate(Math.round(r.sx(this.x)), Math.round(r.sy(this.y + this.lane))); ctx.scale(this.dir * p, p);
    const R = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const body = this.color, dark = rgbCss(shadeRgb(hexRgb(body), 0.75));
    if (this.type === 'bus') {
      R(body, -L / 2, -20, L, 15); R(dark, -L / 2, -7, L, 2);
      for (let x = -L / 2 + 4; x < L / 2 - 10; x += 10) R('#a8dcf0', x, -18, 7, 6);
      R('#a8dcf0', L / 2 - 8, -18, 6, 8);
    } else if (this.type === 'van') {
      R(body, -L / 2, -18, L, 13); R(dark, -L / 2, -7, L, 2);
      R('#a8dcf0', L / 2 - 12, -16, 9, 6);
    } else {
      R(body, -L / 2, -12, L, 7); R(body, -L / 2 + 9, -18, L - 21, 6);
      R('#a8dcf0', -L / 2 + 11, -17, (L - 25) / 2, 5); R('#a8dcf0', -L / 2 + 13 + (L - 25) / 2, -17, (L - 25) / 2, 5);
      R(dark, -L / 2, -7, L, 2);
      if (this.type === 'taxi') { R('#2b2d31', -3, -21, 7, 3); R('#ffffff', -2, -20.5, 5, 1.5); }
    }
    R('#fff3b0', L / 2 - 2, -11, 2, 2); R('#e03a3a', -L / 2, -11, 2, 2);
    for (const wx of [-L / 2 + 8, L / 2 - 8]) {
      R('#1b1b1f', wx - 4, -7, 8, 7); R('#8a8f96', wx - 2, -5, 4, 3);
      ctx.save(); ctx.translate(wx, -3.5); ctx.rotate(this.wheel); R('#4a4f56', -0.5, -2.5, 1, 5); ctx.restore();
    }
    ctx.restore();
    if (r.night > 0.3) {
      r.glows.push({ x: this.x + this.dir * (this.len / 2 + 2.2), y: this.y - 0.6, r: 3.2, color: 'cone', dir: this.dir });
      r.glows.push({ x: this.x - this.dir * this.len / 2, y: this.y - 0.6, r: 0.9, color: 'red' });
    }
  }
}

class FallingBlock extends Entity {
  constructor(x, y, id) { super(x + 0.5, y + 1, 0.98, 0.98); this.id = id; }
  update(dt, world, game) {
    this.vy = Math.min(this.vy + PHYS.g * dt, 20);
    this.y += this.vy * dt;
    const tx = Math.floor(this.x), ty = Math.floor(this.y);
    const below = BLOCKS[world.get(tx, ty)];
    if (below.solid || below.liquid || ty >= world.H - 1) {
      const cy = ty - 1;
      const cur = world.get(tx, cy);
      if (cur === B.air || BLOCKS[cur].replaceable || cur === B.water) world.set(tx, cy, this.id);
      game.fx.dust(tx + 0.5, cy + 1, 5);
      game.sound.play('place', { block: this.id });
      this.dead = true;
    }
  }
  draw(ctx, r) {
    const d = BLOCKS[this.id];
    r.drawTile(d.ti[0], this.x - 0.5, this.y - 1, 1, TEX.atlas);
  }
}
