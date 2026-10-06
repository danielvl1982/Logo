// Shared 2D/3D helpers: polygon booleans (clipper), extrusion, STL I/O, PNG preview.
const fs = require('fs');
const zlib = require('zlib');
const CL = require('clipper-lib');
const earcutMod = require('earcut');
const earcut = earcutMod.default || earcutMod;

const S = 1000; // clipper integer scale (1 unit = 1 µm)

const toPath = (pts) => pts.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));

function union(paths) {
  const c = new CL.Clipper();
  c.AddPaths(paths, CL.PolyType.ptSubject, true);
  const out = new CL.Paths();
  c.Execute(CL.ClipType.ctUnion, out, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  return out;
}

function boolOp(type, a, b) {
  const c = new CL.Clipper();
  c.AddPaths(a, CL.PolyType.ptSubject, true);
  c.AddPaths(b, CL.PolyType.ptClip, true);
  const out = new CL.Paths();
  c.Execute(type, out, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  return out;
}
const diff = (a, b) => boolOp(CL.ClipType.ctDifference, a, b);

function offset(paths, d) {
  const co = new CL.ClipperOffset(2, 0.01 * S);
  co.AddPaths(paths, CL.JoinType.jtRound, CL.EndType.etClosedPolygon);
  const out = new CL.Paths();
  co.Execute(out, d * S);
  return out;
}

// Morphological helpers
const closing = (p, r) => offset(offset(p, r), -r);
const opening = (p, r) => offset(offset(p, -r), r);

// Paths -> [{outer, holes}] in mm
function toPolys(paths) {
  const c = new CL.Clipper();
  c.AddPaths(paths, CL.PolyType.ptSubject, true);
  const tree = new CL.PolyTree();
  c.Execute(CL.ClipType.ctUnion, tree, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  const polys = [];
  const conv = (n) => n.Contour().map((p) => [p.X / S, p.Y / S]);
  const walk = (node) => {
    for (const ch of node.Childs()) {
      if (!ch.IsHole()) {
        polys.push({ outer: conv(ch), holes: ch.Childs().map(conv) });
        for (const h of ch.Childs()) walk(h);
      }
    }
  };
  walk(tree);
  return polys;
}

const area = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2;
const ccw = (r) => (area(r) >= 0 ? r : r.slice().reverse());
const cw = (r) => (area(r) <= 0 ? r : r.slice().reverse());

// Extrude polys between z0..z1 -> flat triangle list [[ [x,y,z]x3 ], ...]
function extrude(polys, z0, z1) {
  const tris = [];
  for (const { outer, holes } of polys) {
    const o = ccw(outer), hs = holes.map(cw);
    const flat = [], hi = [];
    o.forEach((p) => flat.push(p[0], p[1]));
    const all = o.slice();
    for (const h of hs) { hi.push(all.length); h.forEach((p) => { flat.push(p[0], p[1]); all.push(p); }); }
    const idx = earcut(flat, hi);
    for (let i = 0; i < idx.length; i += 3) {
      const a = all[idx[i]], b = all[idx[i + 1]], c = all[idx[i + 2]];
      const ar = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      const [p, q, r] = ar >= 0 ? [a, b, c] : [a, c, b];
      tris.push([[p[0], p[1], z1], [q[0], q[1], z1], [r[0], r[1], z1]]);
      tris.push([[p[0], p[1], z0], [r[0], r[1], z0], [q[0], q[1], z0]]);
    }
    for (const ring of [o, ...hs]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        tris.push([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1]]);
        tris.push([[a[0], a[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]);
      }
    }
  }
  return tris;
}

function writeSTL(file, tris, name = 'part') {
  const buf = Buffer.alloc(84 + 50 * tris.length);
  buf.write(name.slice(0, 79), 0);
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => {
    const o = 84 + i * 50;
    const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]];
    const v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    n = n.map((x) => x / l);
    [...n, ...t[0], ...t[1], ...t[2]].forEach((x, k) => buf.writeFloatLE(x, o + k * 4));
  });
  fs.writeFileSync(file, buf);
}

function readSTL(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(80);
  const tris = [];
  if (b.length === 84 + 50 * n) {
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12, t = [];
      for (let k = 0; k < 3; k++) t.push([0, 1, 2].map((j) => b.readFloatLE(o + k * 12 + j * 4)));
      tris.push(t);
    }
  } else {
    const txt = b.toString('utf8');
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let m, vs = [];
    while ((m = re.exec(txt))) vs.push([+m[1], +m[2], +m[3]]);
    for (let i = 0; i < vs.length; i += 3) tris.push(vs.slice(i, i + 3));
  }
  return tris;
}

// Watertight check: every directed edge must have exactly one reverse partner.
function checkClosed(tris) {
  const q = (v) => v.map((x) => Math.round(x * 1e4)).join(',');
  const m = new Map();
  for (const t of tris) for (let i = 0; i < 3; i++) {
    const k = q(t[i]) + '>' + q(t[(i + 1) % 3]);
    m.set(k, (m.get(k) || 0) + 1);
  }
  let bad = 0;
  for (const [k, c] of m) {
    const [a, b] = k.split('>');
    if (c !== 1 || m.get(b + '>' + a) !== 1) bad++;
  }
  return bad;
}

function bounds(tris) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const t of tris) for (const v of t) v.forEach((x, i) => { mn[i] = Math.min(mn[i], x); mx[i] = Math.max(mx[i], x); });
  return { mn, mx, size: mx.map((x, i) => +(x - mn[i]).toFixed(2)) };
}

// PNG preview: layers = [{polys, color:[r,g,b]}], painted in order. 8 px/mm.
function renderPNG(file, layers, ppm = 8, pad = 3) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const l of layers) for (const p of l.polys) for (const [x, y] of p.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const W = Math.ceil((x1 - x0) * ppm), H = Math.ceil((y1 - y0) * ppm);
  const px = Buffer.alloc(W * H * 3, 255);
  for (const l of layers) {
    const rings = l.polys.flatMap((p) => [p.outer, ...p.holes]);
    for (let r = 0; r < H; r++) {
      const y = y1 - (r + 0.5) / ppm;
      const xs = [];
      for (const ring of rings) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let c = Math.max(0, Math.round((xs[i] - x0) * ppm)); c < Math.min(W, Math.round((xs[i + 1] - x0) * ppm)); c++) {
          const o = (r * W + c) * 3;
          px[o] = l.color[0]; px[o + 1] = l.color[1]; px[o + 2] = l.color[2];
        }
      }
    }
  }
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let r = 0; r < H; r++) { raw[r * (W * 3 + 1)] = 0; px.copy(raw, r * (W * 3 + 1) + 1, r * W * 3, (r + 1) * W * 3); }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

module.exports = { S, toPath, union, diff, offset, closing, opening, toPolys, extrude, writeSTL, readSTL, checkClosed, bounds, renderPNG };
