'use strict';
// ---------------------------------------------------------------------------
// Particles: dust, debris, splashes, bubbles, smoke, sparkles, fireworks,
// falling petals, fireflies and floating text. World units (blocks).
// ---------------------------------------------------------------------------

class FX {
  constructor() { this.list = []; }
  add(p) {
    if (this.list.length > 1800) return;
    p.max = p.life; p.g = p.g || 0; p.drag = p.drag || 0; p.size = p.size || 0.12;
    this.list.push(p);
  }
  clear() { this.list.length = 0; }

  dust(x, y, n = 5, color = 'rgba(220,210,190,0.8)') {
    for (let i = 0; i < n; i++) this.add({ type: 'sq', x: x + (Math.random() - 0.5) * 0.6, y: y - 0.05, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 1.6, life: 0.35 + Math.random() * 0.3, size: 0.1 + Math.random() * 0.08, color, g: 2, drag: 3, fade: true });
  }
  debris(x, y, id, n = 8) {
    const c = BLOCKS[id] && BLOCKS[id].mapColor ? BLOCKS[id].mapColor : [160, 160, 160];
    for (let i = 0; i < n; i++) {
      const s = 0.8 + Math.random() * 0.4;
      this.add({ type: 'sq', x: x + 0.2 + Math.random() * 0.6, y: y + 0.2 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 5, vy: -2 - Math.random() * 4, life: 0.5 + Math.random() * 0.5, size: 0.1 + Math.random() * 0.1, color: rgbCss(shadeRgb(c, s)), g: 22, collide: true });
    }
  }
  burst(x, y, color, n = 12, speed = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.4 + Math.random() * 0.6);
      this.add({ type: 'sq', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0.4 + Math.random() * 0.3, size: 0.1, color, g: 6, drag: 2, fade: true });
    }
  }
  splash(x, y) {
    for (let i = 0; i < 14; i++) this.add({ type: 'sq', x: x + (Math.random() - 0.5) * 0.8, y, vx: (Math.random() - 0.5) * 4, vy: -3 - Math.random() * 4, life: 0.5 + Math.random() * 0.4, size: 0.1, color: 'rgba(170,215,255,0.9)', g: 20, fade: true });
  }
  bubble(x, y) {
    this.add({ type: 'bubble', x, y, vx: 0, vy: -1.2 - Math.random(), life: 1.6 + Math.random(), size: 0.08 + Math.random() * 0.06, color: 'rgba(210,240,255,0.8)' });
  }
  sparkle(x, y, n = 10, color = '#fff6a0') {
    for (let i = 0; i < n; i++) this.add({ type: 'spark', x: x + Math.random(), y: y + Math.random(), vx: (Math.random() - 0.5) * 1.5, vy: -0.5 - Math.random() * 1.8, life: 0.6 + Math.random() * 0.7, size: 0.1 + Math.random() * 0.06, color, glow: true, drag: 1.5, fade: true });
  }
  smoke(x, y) {
    this.add({ type: 'smoke', x: x + (Math.random() - 0.5) * 0.3, y, vx: 0.25 + Math.random() * 0.3, vy: -0.7 - Math.random() * 0.4, life: 3 + Math.random() * 1.5, size: 0.22, color: '#c8c8c8' });
  }
  speedLine(x, y, dir) {
    this.add({ type: 'line', x: x - dir * 0.4, y: y + (Math.random() - 0.5) * 1.2, vx: -dir * 6, vy: 0, life: 0.25, size: 0.6, color: 'rgba(255,230,140,0.9)', fade: true });
  }
  leaf(x, y, color) {
    this.add({ type: 'leaf', x, y, vx: 0.4 + Math.random() * 0.6, vy: 0.5 + Math.random() * 0.4, life: 5 + Math.random() * 3, size: 0.12, color, phase: Math.random() * TAU, collide: true });
  }
  firefly(x, y) {
    this.add({ type: 'firefly', x, y, vx: 0, vy: 0, life: 4 + Math.random() * 4, size: 0.08, color: '#e9ff8a', glow: true, phase: Math.random() * TAU });
  }
  text(x, y, str, color = '#ffffff') {
    this.add({ type: 'text', x, y, vx: 0, vy: -0.9, life: 1.6, str, color });
  }
  ring(x, y, color, maxR = 3) {
    this.add({ type: 'ring', x, y, vx: 0, vy: 0, life: 0.6, size: maxR, color });
  }
  firework(x, y) {
    this.add({ type: 'rocket', x: x + (Math.random() - 0.5) * 6, y, vx: (Math.random() - 0.5) * 2, vy: -14 - Math.random() * 5, life: 0.7 + Math.random() * 0.4, size: 0.12, color: '#fff2c4', glow: true, g: 6 });
  }
  explosion(x, y, r) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, v = 4 + Math.random() * 9;
      this.add({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.5, size: 0.14, color: Math.random() < 0.5 ? '#ffd35a' : '#ff7a2a', glow: true, drag: 3, fade: true });
    }
    for (let i = 0; i < 18; i++) this.add({ type: 'smoke', x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 2, vy: -0.5 - Math.random(), life: 2 + Math.random() * 1.5, size: 0.45, color: '#6a6a6a' });
    this.ring(x, y, 'rgba(255,220,150,0.9)', r * 1.4);
  }

  update(dt, world) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.type === 'rocket') {
          const hue = Math.floor(Math.random() * 360);
          for (let k = 0; k < 46; k++) {
            const a = (k / 46) * TAU, v = 5 + Math.random() * 3;
            this.add({ type: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 + Math.random() * 0.6, size: 0.12, color: `hsl(${(hue + Math.random() * 40) | 0},95%,65%)`, glow: true, drag: 1.8, g: 3, fade: true });
          }
          if (this.onPop) this.onPop();
        }
        L[i] = L[L.length - 1]; L.pop();
        continue;
      }
      if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
      p.vy += p.g * dt;
      if (p.type === 'leaf') { p.phase += dt * 2.5; p.vx = 0.5 + Math.sin(p.phase) * 0.9; }
      if (p.type === 'firefly') { p.phase += dt; p.vx = Math.cos(p.phase * 1.3) * 0.5; p.vy = Math.sin(p.phase * 1.7) * 0.35; }
      if (p.type === 'smoke') p.size += dt * 0.18;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (p.collide && world && BLOCKS[world.get(Math.floor(nx), Math.floor(ny))].solid) {
        if (p.type === 'leaf') { p.vx = 0; p.vy = 0; p.life = Math.min(p.life, 1); p.collide = false; continue; }
        p.vx *= -0.3; p.vy *= -0.2;
      } else { p.x = nx; p.y = ny; }
      if (p.type === 'bubble' && world && world.get(Math.floor(p.x), Math.floor(p.y)) !== B.water) p.life = 0;
    }
  }

  draw(ctx, r) {
    const bs = r.bs;
    ctx.save();
    for (const p of this.list) {
      if (p.glow) continue;
      const a = p.fade ? clamp(p.life / p.max, 0, 1) : 1;
      const sx = r.sx(p.x), sy = r.sy(p.y);
      if (sx < -50 || sy < -50 || sx > r.W + 50 || sy > r.H + 50) continue;
      if (p.type === 'text') {
        ctx.globalAlpha = clamp(p.life / 0.5, 0, 1);
        ctx.font = `600 ${Math.round(bs * 0.45)}px 'Pixelify Sans', 'Trebuchet MS', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(p.str, sx + 2, sy + 2);
        ctx.fillStyle = p.color; ctx.fillText(p.str, sx, sy);
        continue;
      }
      if (p.type === 'smoke') {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.45;
        ctx.fillStyle = p.color;
        const s = p.size * bs; ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
        continue;
      }
      if (p.type === 'ring') {
        const t = 1 - p.life / p.max;
        ctx.globalAlpha = 1 - t; ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(2, bs * 0.12);
        ctx.beginPath(); ctx.arc(sx, sy, p.size * bs * easeOutCubic(t), 0, TAU); ctx.stroke();
        continue;
      }
      if (p.type === 'line') {
        ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.fillRect(sx, sy, p.size * bs, Math.max(1, bs * 0.06));
        continue;
      }
      ctx.globalAlpha = p.type === 'bubble' ? 0.8 : a;
      ctx.fillStyle = p.color;
      const s = Math.max(1, p.size * bs);
      if (p.type === 'bubble') { ctx.strokeStyle = p.color; ctx.lineWidth = 1; ctx.strokeRect(sx - s / 2, sy - s / 2, s, s); }
      else ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
    }
    ctx.restore();
  }

  // Glowing particles are drawn after the light pass so they shine at night.
  drawGlow(ctx, r) {
    const bs = r.bs;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      if (!p.glow) continue;
      const sx = r.sx(p.x), sy = r.sy(p.y);
      if (sx < -50 || sy < -50 || sx > r.W + 50 || sy > r.H + 50) continue;
      let a = p.fade ? clamp(p.life / p.max, 0, 1) : 1;
      if (p.type === 'firefly') a = (0.5 + 0.5 * Math.sin(p.phase * 4)) * clamp(p.life, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = Math.max(1.5, p.size * bs);
      ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      ctx.globalAlpha = a * 0.25;
      ctx.fillRect(sx - s * 1.5, sy - s * 1.5, s * 3, s * 3);
    }
    ctx.restore();
  }
}
