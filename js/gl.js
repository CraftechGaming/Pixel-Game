'use strict';
// ---------------------------------------------------------------------------
// WebGL2 renderer: chunk meshes, water, sky, clouds, coloured box models,
// item models, block highlight and the held item.
// ---------------------------------------------------------------------------

const VS_CHUNK = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in vec3 aLight;
uniform mat4 uProj, uView, uModel;
uniform float uTime, uWave;
uniform vec2 uUVOff;
out vec2 vUV; out vec3 vLight; out float vDist;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  if (uWave > 0.5) wp.y += sin(wp.x * 1.3 + uTime * 1.8) * 0.035 + cos(wp.z * 1.1 + uTime * 1.4) * 0.035 - 0.06;
  vec4 vp = uView * wp;
  vDist = length(vp.xyz);
  vUV = aUV + uUVOff;
  vLight = aLight;
  gl_Position = uProj * vp;
}`;
const FS_CHUNK = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform float uDay, uAlpha;
uniform vec3 uFog;
uniform vec2 uFogRange, uLightMul;
in vec2 vUV; in vec3 vLight; in float vDist;
out vec4 o;
void main() {
  vec4 c = texture(uTex, vUV);
  if (uAlpha >= 1.0 && c.a < 0.4) discard;
  float sky = vLight.x * uDay * uLightMul.x;
  float blk = vLight.y * uLightMul.y;
  vec3 light = vec3(sky) + vec3(1.0, 0.8, 0.55) * blk * (1.0 - sky * 0.6);
  light = clamp(light, vec3(0.035, 0.04, 0.06), vec3(1.15));
  vec3 col = c.rgb * light * vLight.z;
  float f = smoothstep(uFogRange.x, uFogRange.y, vDist);
  o = vec4(mix(col, uFog, f), uAlpha >= 1.0 ? 1.0 : c.a * uAlpha);
}`;
const VS_BOX = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
uniform mat4 uProj, uView, uModel;
out vec3 vN; out float vDist;
void main() {
  vec4 vp = uView * uModel * vec4(aPos, 1.0);
  vDist = length(vp.xyz);
  vN = mat3(uModel) * aNorm;
  gl_Position = uProj * vp;
}`;
const FS_BOX = `#version 300 es
precision mediump float;
uniform vec3 uColor, uFog;
uniform float uLight, uAlpha;
uniform vec2 uFogRange;
in vec3 vN; in float vDist;
out vec4 o;
void main() {
  vec3 n = normalize(vN);
  float d = max(dot(n, normalize(vec3(0.35, 1.0, 0.25))), 0.0);
  vec3 col = uColor * (0.58 + 0.42 * d) * uLight;
  float f = smoothstep(uFogRange.x, uFogRange.y, vDist);
  o = vec4(mix(col, uFog, f), uAlpha);
}`;
const VS_SKY = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vNdc;
void main() { vNdc = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
const FS_SKY = `#version 300 es
precision highp float;
uniform vec3 uRight, uUp, uFwd, uTop, uHorizon, uSun, uSunCol;
uniform vec2 uTan;
uniform float uNight;
in vec2 vNdc;
out vec4 o;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 dir = normalize(uFwd + vNdc.x * uTan.x * uRight + vNdc.y * uTan.y * uUp);
  float h = dir.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, h));
  if (h < 0.0) col = mix(uHorizon, uHorizon * 0.55, smoothstep(0.0, -0.35, h));
  vec3 up = abs(uSun.y) > 0.95 ? vec3(1, 0, 0) : vec3(0, 1, 0);
  vec3 su = normalize(cross(uSun, up)), sv = cross(su, uSun);
  float a = dot(dir, su), b = dot(dir, sv), s = dot(dir, uSun);
  if (s > 0.0 && max(abs(a), abs(b)) < 0.05) col = uSunCol;
  col += uSunCol * pow(max(s, 0.0), 40.0) * 0.35;
  if (s < 0.0 && max(abs(a), abs(b)) < 0.035) {
    col = vec3(0.92, 0.93, 0.98);
    if (max(abs(a - 0.018), abs(b + 0.01)) < 0.03) col = mix(col, uTop, 0.85);
  }
  if (uNight > 0.01 && h > 0.0) {
    vec3 q = floor(dir * 220.0);
    float r = hash(q);
    if (r > 0.9975) col += vec3(uNight * (r - 0.9975) * 360.0);
  }
  o = vec4(col, 1.0);
}`;

class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.pChunk = this.program(VS_CHUNK, FS_CHUNK);
    this.pBox = this.program(VS_BOX, FS_BOX);
    this.pSky = this.program(VS_SKY, FS_SKY);
    this.proj = M4.create(); this.view = M4.create(); this.model = M4.create(); this.ident = M4.create();
    this.atlas = this.texture(TEX.atlas, false);
    this.cloudTex = this.texture(this.makeClouds(), true);
    this.makeStatic();
    this.itemMeshes = new Map();
    this.dpr = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  program(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  texture(canvas, repeat) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }
  makeClouds() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const n = fbm2(x / 9, y / 9, 77, 3) * 0.7 + fbm2(x / 4, y / 4, 78, 2) * 0.3;
      const o = (y * 64 + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = n > 0.56 ? 215 : 0;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  vao(verts, idx, layout) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const stride = layout.reduce((a, b) => a + b, 0) * 4;
    let off = 0;
    layout.forEach((n, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, stride, off); off += n * 4; });
    let ib = null;
    if (idx) { ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); }
    gl.bindVertexArray(null);
    return { vao, vb, ib, n: idx ? idx.length : verts.length / (stride / 4) };
  }
  freeVao(m) {
    if (!m) return;
    const gl = this.gl;
    gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); if (m.ib) gl.deleteBuffer(m.ib);
  }
  makeStatic() {
    // unit cube centred at the origin with normals (for coloured models)
    const v = [], idx = [];
    FACE_C.forEach((corners, f) => {
      const n = FACE_N[f], b = v.length / 6;
      for (const p of corners) v.push(p[0] - 0.5, p[1] - 0.5, p[2] - 0.5, n[0], n[1], n[2]);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    this.cube = this.vao(new Float32Array(v), new Uint16Array(idx), [3, 3]);
    this.skyTri = this.vao(new Float32Array([-1, -1, 3, -1, -1, 3]), null, [2]);
    // a big quad for the cloud layer (chunk vertex format)
    const S = 1000, U = S / 96;
    this.cloudQuad = this.vao(new Float32Array([
      -S, 0, -S, 0, 0, 1, 0, 1,  -S, 0, S, 0, U, 1, 0, 1,  S, 0, S, U, U, 1, 0, 1,  S, 0, -S, U, 0, 1, 0, 1,
    ]), new Uint16Array([0, 2, 1, 0, 3, 2, 0, 1, 2, 0, 2, 3]), [3, 2, 3]);
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr || 2);
    this.dpr = dpr;
    const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.canvas.style.width = window.innerWidth + 'px'; this.canvas.style.height = window.innerHeight + 'px';
  }

  uploadChunk(chunk, mesh) {
    this.freeChunk(chunk);
    chunk.mesh = {
      solid: mesh.solid.i.length ? this.vao(mesh.solid.v, mesh.solid.i, [3, 2, 3]) : null,
      water: mesh.water.i.length ? this.vao(mesh.water.v, mesh.water.i, [3, 2, 3]) : null,
    };
  }
  freeChunk(chunk) {
    if (!chunk.mesh) return;
    this.freeVao(chunk.mesh.solid); this.freeVao(chunk.mesh.water);
    chunk.mesh = null;
  }

  // Item models in the chunk vertex format: a little cube for blocks, a flat sprite otherwise.
  itemMesh(id) {
    let m = this.itemMeshes.get(id);
    if (m) return m;
    const d = BLOCKS[id];
    if (!TILE_UV) TILE_UV = TEX.list.map((_, t) => tileUV(t));
    const v = [], idx = [];
    if (d.shape === 'cube' || (d.shape === 'box' && d.id !== B.torch)) {
      FACE_C.forEach((corners, f) => {
        const t = TILE_UV[d.faces[f]], b = v.length / 8;
        for (const p of corners) v.push(p[0] - 0.5, p[1] - 0.5, p[2] - 0.5, t[0] + faceU(f, p[0], p[1], p[2]) * t[2], t[1] + faceV(f, p[0], p[1], p[2]) * t[3], 1, 0, FACE_SHADE[f]);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      });
    } else {
      const t = TILE_UV[d.iconTi];
      v.push(-0.5, -0.5, 0, t[0], t[1] + t[3], 1, 0, 1, 0.5, -0.5, 0, t[0] + t[2], t[1] + t[3], 1, 0, 1,
        0.5, 0.5, 0, t[0] + t[2], t[1], 1, 0, 1, -0.5, 0.5, 0, t[0], t[1], 1, 0, 1);
      idx.push(0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2);
    }
    m = this.vao(new Float32Array(v), new Uint16Array(idx), [3, 2, 3]);
    m.flat = !(d.shape === 'cube' || (d.shape === 'box' && d.id !== B.torch));
    this.itemMeshes.set(id, m);
    return m;
  }
  crackMesh(stage) {
    const key = 'crack' + stage;
    let m = this.itemMeshes.get(key);
    if (m) return m;
    if (!TILE_UV) TILE_UV = TEX.list.map((_, t) => tileUV(t));
    const t = TILE_UV[texIndex('crack' + stage)], v = [], idx = [];
    FACE_C.forEach((corners, f) => {
      const b = v.length / 8;
      for (const p of corners) v.push((p[0] - 0.5) * 1.004 + 0.5, (p[1] - 0.5) * 1.004 + 0.5, (p[2] - 0.5) * 1.004 + 0.5, t[0] + faceU(f, p[0], p[1], p[2]) * t[2], t[1] + faceV(f, p[0], p[1], p[2]) * t[3], 1, 0, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    m = this.vao(new Float32Array(v), new Uint16Array(idx), [3, 2, 3]);
    this.itemMeshes.set(key, m);
    return m;
  }

  // --- frame --------------------------------------------------------------------------
  begin(F) {
    const gl = this.gl;
    this.F = F;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const aspect = this.canvas.width / this.canvas.height;
    M4.perspective(this.proj, F.fov, aspect, 0.06, F.far + 64);
    M4.view(this.view, F.eye[0], F.eye[1], F.eye[2], F.yaw, F.pitch);
    this.vp = M4.multiply(M4.create(), this.proj, this.view);
    this.planes = frustumPlanes(this.vp);
    gl.clearColor(F.fog[0], F.fog[1], F.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    const s = this.pSky; gl.useProgram(s.p);
    const fw = forwardVec(F.yaw, F.pitch);
    const right = [Math.cos(F.yaw), 0, -Math.sin(F.yaw)];
    const up = [right[1] * fw[2] - right[2] * fw[1], right[2] * fw[0] - right[0] * fw[2], right[0] * fw[1] - right[1] * fw[0]];
    gl.uniform3fv(s.u.uRight, right); gl.uniform3fv(s.u.uUp, up); gl.uniform3fv(s.u.uFwd, fw);
    const tY = Math.tan(F.fov / 2);
    gl.uniform2f(s.u.uTan, tY * aspect, tY);
    gl.uniform3fv(s.u.uTop, F.skyTop); gl.uniform3fv(s.u.uHorizon, F.fog); gl.uniform3fv(s.u.uSun, F.sun); gl.uniform3fv(s.u.uSunCol, F.sunCol);
    gl.uniform1f(s.u.uNight, F.night);
    gl.bindVertexArray(this.skyTri.vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  }
  useChunk(alpha = 1, wave = 0) {
    const gl = this.gl, p = this.pChunk, F = this.F;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uProj, false, this.proj); gl.uniformMatrix4fv(p.u.uView, false, this.view);
    gl.uniform1f(p.u.uTime, F.time); gl.uniform1f(p.u.uWave, wave);
    gl.uniform1f(p.u.uDay, F.day); gl.uniform1f(p.u.uAlpha, alpha);
    gl.uniform3fv(p.u.uFog, F.fog); gl.uniform2f(p.u.uFogRange, F.far * 0.62, F.far);
    gl.uniform2f(p.u.uLightMul, 1, 1); gl.uniform2f(p.u.uUVOff, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas); gl.uniform1i(p.u.uTex, 0);
    return p;
  }
  drawChunks(world, which) {
    const gl = this.gl, p = this.pChunk, F = this.F;
    const list = [];
    for (const c of world.chunks.values()) {
      const m = c.mesh && c.mesh[which];
      if (!m) continue;
      const x0 = c.cx * CS, z0 = c.cz * CS;
      const dx = x0 + 8 - F.eye[0], dz = z0 + 8 - F.eye[2];
      if (dx * dx + dz * dz > (F.far + 24) ** 2) continue;
      if (!boxInFrustum(this.planes, x0, 0, z0, x0 + CS, CH, z0 + CS)) continue;
      list.push([dx * dx + dz * dz, c, m]);
    }
    list.sort((a, b) => (which === 'water' ? b[0] - a[0] : a[0] - b[0]));
    for (const [, c, m] of list) {
      M4.identity(this.model); this.model[12] = c.cx * CS; this.model[14] = c.cz * CS;
      gl.uniformMatrix4fv(p.u.uModel, false, this.model);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
    }
    return list.length;
  }
  drawWorld(world) {
    this.useChunk(1, 0);
    this.chunkCount = this.drawChunks(world, 'solid');
  }
  drawWater(world) {
    const gl = this.gl;
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false); gl.disable(gl.CULL_FACE);
    this.useChunk(0.82, 1);
    this.drawChunks(world, 'water');
    gl.depthMask(true); gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
  }
  drawClouds() {
    const gl = this.gl, F = this.F, p = this.useChunk(0.75, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
    M4.identity(this.model); this.model[12] = Math.floor(F.eye[0]); this.model[13] = 118; this.model[14] = Math.floor(F.eye[2]);
    gl.uniformMatrix4fv(p.u.uModel, false, this.model);
    gl.uniform2f(p.u.uUVOff, (Math.floor(F.eye[0]) + F.time * 1.2) / 96, Math.floor(F.eye[2]) / 96);
    gl.uniform2f(p.u.uLightMul, 1, 0);
    gl.uniform2f(p.u.uFogRange, 300, 900);
    gl.bindVertexArray(this.cloudQuad.vao); gl.drawElements(gl.TRIANGLES, 12, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
  }
  // coloured box (characters, obstacles, particles)
  beginBoxes() {
    const gl = this.gl, p = this.pBox, F = this.F;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.uProj, false, this.proj); gl.uniformMatrix4fv(p.u.uView, false, this.view);
    gl.uniform3fv(p.u.uFog, F.fog); gl.uniform2f(p.u.uFogRange, F.far * 0.62, F.far);
    gl.uniform1f(p.u.uAlpha, 1);
    gl.bindVertexArray(this.cube.vao);
  }
  box(m, color, light = 1) {
    const gl = this.gl, p = this.pBox;
    gl.uniformMatrix4fv(p.u.uModel, false, m);
    gl.uniform3fv(p.u.uColor, color); gl.uniform1f(p.u.uLight, light);
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
  }
  boxAt(x, y, z, sx, sy, sz, color, light = 1, ry = 0, rx = 0, rz = 0) {
    M4.compose(this.model, x, y, z, rx, ry, rz, sx, sy, sz);
    this.box(this.model, color, light);
  }
  item(id, m, sky, blk) {
    const gl = this.gl, p = this.useChunk(1, 0);
    gl.uniformMatrix4fv(p.u.uModel, false, m);
    gl.uniform2f(p.u.uLightMul, sky, blk);
    const mesh = this.itemMesh(id);
    if (mesh.flat) gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
    gl.enable(gl.CULL_FACE);
  }
  crack(x, y, z, stage) {
    const gl = this.gl, p = this.useChunk(1, 0);
    M4.identity(this.model); this.model[12] = x; this.model[13] = y; this.model[14] = z;
    gl.uniformMatrix4fv(p.u.uModel, false, this.model);
    gl.uniform2f(p.u.uLightMul, 0.6, 0);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -1);
    const mesh = this.crackMesh(stage);
    gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  outline(x, y, z, s = 1.004) {
    this.beginBoxes();
    const t = 0.018, c = [0.05, 0.05, 0.08], h = s / 2, cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
    for (const a of [-h, h]) for (const b of [-h, h]) {
      this.boxAt(cx, cy + a, cz + b, s, t, t, c);
      this.boxAt(cx + a, cy, cz + b, t, s, t, c);
      this.boxAt(cx + a, cy + b, cz, t, t, s, c);
    }
  }
  // held item in first person
  held(id, swing, bob, sky, blk) {
    const gl = this.gl;
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const aspect = this.canvas.width / this.canvas.height;
    const proj = M4.perspective(M4.create(), 1.2, aspect, 0.01, 10);
    const p = this.useChunk(1, 0);
    gl.uniformMatrix4fv(p.u.uProj, false, proj); gl.uniformMatrix4fv(p.u.uView, false, this.ident);
    gl.uniform2f(p.u.uFogRange, 100, 200);
    const d = BLOCKS[id];
    const flat = this.itemMesh(id).flat;
    const sw = Math.sin(swing * Math.PI);
    M4.compose(this.model, 0.56 - sw * 0.18, -0.52 + bob - sw * 0.12, -0.95 - sw * 0.15, -0.25 - sw * 0.9, flat ? -0.6 : 0.7, flat ? 0.4 : 0, flat ? 0.55 : 0.42, flat ? 0.55 : 0.42, flat ? 0.55 : 0.42);
    gl.uniformMatrix4fv(p.u.uModel, false, this.model);
    gl.uniform2f(p.u.uLightMul, sky, blk);
    const mesh = this.itemMesh(d.id);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
    gl.enable(gl.CULL_FACE);
  }
}
