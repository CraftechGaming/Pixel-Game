'use strict';
// ---------------------------------------------------------------------------
// Minimal 4x4 matrix helpers (column-major, like WebGL expects).
// ---------------------------------------------------------------------------
const M4 = {
  _t: new Float32Array(16),
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
    return o;
  },
  multiply(o, a, b) {
    const r = M4._t;
    for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
      r[c * 4 + rr] = a[rr] * b[c * 4] + a[4 + rr] * b[c * 4 + 1] + a[8 + rr] * b[c * 4 + 2] + a[12 + rr] * b[c * 4 + 3];
    }
    o.set(r);
    return o;
  },
  // view matrix for a camera at eye looking along (yaw, pitch)
  view(o, ex, ey, ez, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // R = Rx(-pitch) * Ry(-yaw)
    const r00 = cy, r01 = 0, r02 = -sy;
    const r10 = sy * sp, r11 = cp, r12 = cy * sp;
    const r20 = sy * cp, r21 = -sp, r22 = cy * cp;
    o[0] = r00; o[1] = r10; o[2] = r20; o[3] = 0;
    o[4] = r01; o[5] = r11; o[6] = r21; o[7] = 0;
    o[8] = r02; o[9] = r12; o[10] = r22; o[11] = 0;
    o[12] = -(r00 * ex + r01 * ey + r02 * ez);
    o[13] = -(r10 * ex + r11 * ey + r12 * ez);
    o[14] = -(r20 * ex + r21 * ey + r22 * ez);
    o[15] = 1;
    return o;
  },
  // model = T * Ry(ry) * Rx(rx) * Rz(rz) * S
  compose(o, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    const cx = Math.cos(rx), snx = Math.sin(rx), cy = Math.cos(ry), sny = Math.sin(ry), cz = Math.cos(rz), snz = Math.sin(rz);
    // R = Ry * Rx * Rz
    const m00 = cy * cz + sny * snx * snz, m01 = -cy * snz + sny * snx * cz, m02 = sny * cx;
    const m10 = cx * snz, m11 = cx * cz, m12 = -snx;
    const m20 = -sny * cz + cy * snx * snz, m21 = sny * snz + cy * snx * cz, m22 = cy * cx;
    o[0] = m00 * sx; o[1] = m10 * sx; o[2] = m20 * sx; o[3] = 0;
    o[4] = m01 * sy; o[5] = m11 * sy; o[6] = m21 * sy; o[7] = 0;
    o[8] = m02 * sz; o[9] = m12 * sz; o[10] = m22 * sz; o[11] = 0;
    o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1;
    return o;
  },
};

function forwardVec(yaw, pitch) {
  return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

// Frustum planes from a projection*view matrix, for chunk culling.
function frustumPlanes(m) {
  const p = [];
  const add = (a, b, c, d) => { const l = Math.hypot(a, b, c); p.push([a / l, b / l, c / l, d / l]); };
  add(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
  add(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
  add(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
  add(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
  add(m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
  return p;
}
function boxInFrustum(planes, x0, y0, z0, x1, y1, z1) {
  for (const [a, b, c, d] of planes) {
    const x = a > 0 ? x1 : x0, y = b > 0 ? y1 : y0, z = c > 0 ? z1 : z0;
    if (a * x + b * y + c * z + d < 0) return false;
  }
  return true;
}
