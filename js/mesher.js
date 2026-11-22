'use strict';
// ---------------------------------------------------------------------------
// Chunk mesher. Copies the chunk plus a 14-block margin from its neighbours,
// flood-fills sky light and block light, then emits faces with smooth light
// and ambient occlusion. Vertex: x y z u v sky blk shade (8 floats).
// ---------------------------------------------------------------------------

const MM = 14;
const RW = CS + MM * 2;
const RH = CH + 2;                  // one padding layer below and above
const RN = RW * RW * RH;
const LAYER = RW * RW;
const R_ids = new Uint8Array(RN), R_meta = new Uint8Array(RN), R_sky = new Uint8Array(RN), R_blk = new Uint8Array(RN);
const R_Q = new Int32Array(RN * 2);
const LUT = Array.from({ length: 16 }, (_, l) => Math.pow(0.8, 15 - l));
const FACE_SHADE = [0.8, 0.8, 1.0, 0.55, 0.68, 0.68];
const AO_F = [0.42, 0.62, 0.8, 1];
const FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_C = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
];
const faceU = (f, x, y, z) => (f === 0 ? 1 - z : f === 1 ? z : f === 5 ? 1 - x : x);
const faceV = (f, x, y, z) => (f === 2 || f === 3 ? z : 1 - y);
// region index offsets for each face corner: [s1, s2, corner] relative to the cell in front of the face
const OFF = (dx, dy, dz) => dy * LAYER + dz * RW + dx;
const FACE_AO = FACE_C.map((corners, f) => {
  const n = FACE_N[f];
  const axes = [0, 1, 2].filter(a => n[a] === 0);
  return corners.map(c => {
    const d1 = [0, 0, 0], d2 = [0, 0, 0];
    d1[axes[0]] = c[axes[0]] ? 1 : -1;
    d2[axes[1]] = c[axes[1]] ? 1 : -1;
    return [OFF(...d1), OFF(...d2), OFF(d1[0] + d2[0], d1[1] + d2[1], d1[2] + d2[2])];
  });
});
const FACE_NOFF = FACE_N.map(n => OFF(...n));

class MeshBuilder {
  constructor() { this.v = new Float32Array(1 << 16); this.i = new Uint32Array(1 << 15); this.nv = 0; this.ni = 0; }
  reset() { this.nv = 0; this.ni = 0; }
  grow() {
    if (this.nv + 64 > this.v.length) { const n = new Float32Array(this.v.length * 2); n.set(this.v); this.v = n; }
    if (this.ni + 64 > this.i.length) { const n = new Uint32Array(this.i.length * 2); n.set(this.i); this.i = n; }
  }
  vert(x, y, z, u, v, sky, blk, sh) {
    const a = this.v, o = this.nv;
    a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = u; a[o + 4] = v; a[o + 5] = sky; a[o + 6] = blk; a[o + 7] = sh;
    this.nv += 8;
  }
  quad(flip) {
    const b = this.nv / 8 - 4, I = this.i, o = this.ni;
    if (flip) { I[o] = b + 1; I[o + 1] = b + 2; I[o + 2] = b + 3; I[o + 3] = b + 1; I[o + 4] = b + 3; I[o + 5] = b; }
    else { I[o] = b; I[o + 1] = b + 1; I[o + 2] = b + 2; I[o + 3] = b; I[o + 4] = b + 2; I[o + 5] = b + 3; }
    this.ni += 6;
  }
  out() { return { v: this.v.slice(0, this.nv), i: this.i.slice(0, this.ni) }; }
}
const MB_SOLID = new MeshBuilder(), MB_WATER = new MeshBuilder();

function tileUV(t) {
  const cols = TEX.cols, rows = TEX.rows;
  const eu = 0.02 / (cols * 16), ev = 0.02 / (rows * 16);
  return [(t % cols) / cols + eu, Math.floor(t / cols) / rows + ev, 1 / cols - 2 * eu, 1 / rows - 2 * ev];
}
let TILE_UV = null;

function gatherRegion(world, chunk) {
  R_ids.fill(0); R_meta.fill(0);
  // padding layer below the world is bedrock
  R_ids.fill(B.bedrock, 0, LAYER);
  for (let dcz = -1; dcz <= 1; dcz++) for (let dcx = -1; dcx <= 1; dcx++) {
    const n = world.getChunk(chunk.cx + dcx, chunk.cz + dcz);
    if (!n) continue;
    const ox = dcx * CS + MM, oz = dcz * CS + MM;
    const lx0 = Math.max(0, -ox), lx1 = Math.min(CS, RW - ox), lz0 = Math.max(0, -oz), lz1 = Math.min(CS, RW - oz);
    if (lx0 >= lx1 || lz0 >= lz1) continue;
    const len = lx1 - lx0;
    for (let y = 0; y < CH; y++) for (let lz = lz0; lz < lz1; lz++) {
      const src = cidx(lx0, y, lz), dst = ((y + 1) * RW + oz + lz) * RW + ox + lx0;
      R_ids.set(n.blocks.subarray(src, src + len), dst);
      R_meta.set(n.meta.subarray(src, src + len), dst);
    }
  }
}

function floodLight(L, qLen) {
  let head = 0, tail = qLen;
  const size = R_Q.length, WATER = B.water;
  while (head !== tail) {
    const i = R_Q[head]; head = head + 1 === size ? 0 : head + 1;
    const v = L[i];
    if (v <= 1) continue;
    const x = i % RW, t = (i - x) / RW, z = t % RW, y = (t - z) / RW;
    for (let k = 0; k < 6; k++) {
      let n;
      if (k === 0) { if (x === RW - 1) continue; n = i + 1; }
      else if (k === 1) { if (x === 0) continue; n = i - 1; }
      else if (k === 2) { if (z === RW - 1) continue; n = i + RW; }
      else if (k === 3) { if (z === 0) continue; n = i - RW; }
      else if (k === 4) { if (y === RH - 1) continue; n = i + LAYER; }
      else { if (y === 0) continue; n = i - LAYER; }
      const id = R_ids[n];
      if (OPAQUE[id]) continue;
      const nv = v - (id === WATER ? 2 : 1);
      if (L[n] < nv) { L[n] = nv; R_Q[tail] = n; tail = tail + 1 === size ? 0 : tail + 1; }
    }
  }
}

function computeLight(world, chunk) {
  const WATER = B.water;
  let maxTop = 0;
  for (let z = 0; z < RW; z++) for (let x = 0; x < RW; x++) {
    let v = 15;
    for (let y = RH - 1; y >= 0; y--) {
      const i = (y * RW + z) * RW + x, id = R_ids[i];
      if (OPAQUE[id]) { if (v > 0 && y > maxTop) maxTop = y; v = 0; R_sky[i] = 0; continue; }
      if (id === WATER) v = v > 2 ? v - 2 : 0;
      else if (LEAVESET[id]) v = v > 1 ? v - 1 : 0;
      R_sky[i] = v;
    }
  }
  // seed sky light wherever a lit cell borders a darker open cell
  let q = 0;
  const yEnd = Math.min(RH - 1, maxTop + 2);
  for (let y = 1; y <= yEnd; y++) for (let z = 1; z < RW - 1; z++) {
    let i = (y * RW + z) * RW + 1;
    for (let x = 1; x < RW - 1; x++, i++) {
      const v = R_sky[i];
      if (v < 2) continue;
      const t = v - 1;
      if ((R_sky[i + 1] < t && !OPAQUE[R_ids[i + 1]]) || (R_sky[i - 1] < t && !OPAQUE[R_ids[i - 1]]) ||
        (R_sky[i + RW] < t && !OPAQUE[R_ids[i + RW]]) || (R_sky[i - RW] < t && !OPAQUE[R_ids[i - RW]]) ||
        (R_sky[i - LAYER] < t && !OPAQUE[R_ids[i - LAYER]])) R_Q[q++] = i;
    }
  }
  floodLight(R_sky, q);
  // block light from torches, lamps, lava...
  R_blk.fill(0);
  q = 0;
  for (let dcz = -1; dcz <= 1; dcz++) for (let dcx = -1; dcx <= 1; dcx++) {
    const n = world.getChunk(chunk.cx + dcx, chunk.cz + dcz);
    if (!n || !n.lights.size) continue;
    for (const li of n.lights) {
      const lx = li & 15, lz = (li >> 4) & 15, y = li >> 8;
      const rx = dcx * CS + MM + lx, rz = dcz * CS + MM + lz;
      if (rx < 0 || rz < 0 || rx >= RW || rz >= RW) continue;
      const i = ((y + 1) * RW + rz) * RW + rx;
      const lv = LIGHT[n.blocks[li]];
      if (R_blk[i] < lv) { R_blk[i] = lv; R_Q[q++] = i; }
    }
  }
  if (q) floodLight(R_blk, q);
}

function buildChunkMesh(world, chunk) {
  if (!TILE_UV) TILE_UV = TEX.list.map((_, t) => tileUV(t));
  gatherRegion(world, chunk);
  computeLight(world, chunk);
  const S = MB_SOLID, Wt = MB_WATER;
  S.reset(); Wt.reset();
  const WATER = B.water;
  for (let y = 0; y < CH; y++) for (let lz = 0; lz < CS; lz++) {
    let i = ((y + 1) * RW + lz + MM) * RW + MM;
    for (let lx = 0; lx < CS; lx++, i++) {
      const id = R_ids[i];
      if (!id) continue;
      const d = BLOCKS[id];
      const shape = d.shape;
      if (shape === 'cube') {
        for (let f = 0; f < 6; f++) {
          const a = i + FACE_NOFF[f], nb = R_ids[a];
          if (OPAQUE[nb] || (nb === id && !d.opaque)) continue;
          if (nb === WATER && id === B.lava) continue;
          S.grow();
          const ao = FACE_AO[f], corners = FACE_C[f], tuv = TILE_UV[d.faces[f]];
          let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
          for (let c = 0; c < 4; c++) {
            const [o1, o2, oc] = ao[c];
            const s1 = a + o1, s2 = a + o2, sc = a + oc;
            const b1 = OPAQUE[R_ids[s1]], b2 = OPAQUE[R_ids[s2]], bc = OPAQUE[R_ids[sc]];
            const aov = b1 && b2 ? 0 : 3 - b1 - b2 - bc;
            let sk = R_sky[a], bl = R_blk[a], n = 1;
            if (!b1) { sk += R_sky[s1]; bl += R_blk[s1]; n++; }
            if (!b2) { sk += R_sky[s2]; bl += R_blk[s2]; n++; }
            if (!bc && !(b1 && b2)) { sk += R_sky[sc]; bl += R_blk[sc]; n++; }
            const p = corners[c];
            S.vert(lx + p[0], y + p[1], lz + p[2], tuv[0] + faceU(f, p[0], p[1], p[2]) * tuv[2], tuv[1] + faceV(f, p[0], p[1], p[2]) * tuv[3],
              LUT[Math.round(sk / n)], LUT[Math.round(bl / n)], FACE_SHADE[f] * AO_F[aov]);
            if (c === 0) a0 = aov; else if (c === 1) a1 = aov; else if (c === 2) a2 = aov; else a3 = aov;
          }
          S.quad(a0 + a2 < a1 + a3);
        }
      } else if (shape === 'cross') {
        const t = d.stageTi ? d.stageTi[Math.min(R_meta[i], d.stageTi.length - 1)] : d.faces[2];
        const tuv = TILE_UV[t], sk = LUT[R_sky[i]], bl = LUT[R_blk[i]];
        for (const [x0, z0, x1, z1] of [[0.15, 0.15, 0.85, 0.85], [0.15, 0.85, 0.85, 0.15], [0.85, 0.85, 0.15, 0.15], [0.85, 0.15, 0.15, 0.85]]) {
          S.grow();
          S.vert(lx + x0, y, lz + z0, tuv[0], tuv[1] + tuv[3], sk, bl, 0.9);
          S.vert(lx + x0, y + 1, lz + z0, tuv[0], tuv[1], sk, bl, 0.9);
          S.vert(lx + x1, y + 1, lz + z1, tuv[0] + tuv[2], tuv[1], sk, bl, 0.9);
          S.vert(lx + x1, y, lz + z1, tuv[0] + tuv[2], tuv[1] + tuv[3], sk, bl, 0.9);
          S.quad(false);
        }
      } else if (shape === 'box' || shape === 'panel') {
        let bx;
        if (shape === 'panel') {
          let f = R_meta[i] & 3;
          if (R_meta[i] & 4) f = [2, 3, 1, 0][f];
          bx = [[0, 0, 0, 16, 16, 3], [0, 0, 13, 16, 16, 16], [0, 0, 0, 3, 16, 16], [13, 0, 0, 16, 16, 16]][f];
        } else bx = d.box;
        const sk = LUT[R_sky[i]], bl = LUT[Math.max(R_blk[i], d.light)];
        const x0 = bx[0] / 16, y0 = bx[1] / 16, z0 = bx[2] / 16, x1 = bx[3] / 16, y1 = bx[4] / 16, z1 = bx[5] / 16;
        for (let f = 0; f < 6; f++) {
          if (f === 3 && y0 === 0 && OPAQUE[R_ids[i - LAYER]]) continue;
          S.grow();
          const tuv = TILE_UV[d.faces[f]], corners = FACE_C[f];
          for (let c = 0; c < 4; c++) {
            const p = corners[c];
            const px = p[0] ? x1 : x0, py = p[1] ? y1 : y0, pz = p[2] ? z1 : z0;
            S.vert(lx + px, y + py, lz + pz, tuv[0] + faceU(f, px, py, pz) * tuv[2], tuv[1] + faceV(f, px, py, pz) * tuv[3], sk, bl, FACE_SHADE[f]);
          }
          S.quad(false);
        }
      } else if (shape === 'liquid') {
        const above = R_ids[i + LAYER];
        const lvl = R_meta[i];
        const top = above === WATER ? 1 : Math.max(0.15, (8 - lvl) / 8 * 0.875);
        const tuv = TILE_UV[d.faces[2]], sk = LUT[R_sky[i]], bl = LUT[R_blk[i]];
        for (let f = 0; f < 6; f++) {
          const nb = R_ids[i + FACE_NOFF[f]];
          if (nb === WATER || OPAQUE[nb]) continue;
          if (f === 2 && above === WATER) continue;
          Wt.grow();
          const corners = FACE_C[f];
          for (let c = 0; c < 4; c++) {
            const p = corners[c];
            const py = p[1] ? top : 0;
            Wt.vert(lx + p[0], y + py, lz + p[2], tuv[0] + faceU(f, p[0], py, p[2]) * tuv[2], tuv[1] + faceV(f, p[0], py, p[2]) * tuv[3], sk, bl, FACE_SHADE[f]);
          }
          Wt.quad(false);
        }
      }
    }
  }
  return { solid: S.out(), water: Wt.out() };
}

// Light level (0..1) at a world position, used to shade characters and items.
function lightAt(world, x, y, z) {
  const id = world.get(Math.floor(x), Math.floor(y), Math.floor(z));
  return { sky: OPAQUE[id] ? 0.3 : 1 };
}
