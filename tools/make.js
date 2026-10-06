// Generates print-ready STLs: Vicnat silhouette plate + batlleWornDev badge.
// Usage: node make.js   (outputs next to the Vicnat folder root)
const path = require('path');
const opentype = require('opentype.js');
const L = require('./lib');

const OUT = path.join(__dirname, '..');
const BASE = 0.8;   // plate thickness (mm)
const RELIEF = 0.8; // raised detail on top of the plate (mm)

const log = (...a) => console.log(...a);

function build(name, content, { margin, closeR, rim, rect, distress, smooth }) {
  // Silhouette: grow by closeR to fuse separate pieces, shrink back so the contour hugs the shape at `margin`.
  let plate = L.offset(L.offset(content, closeR), -(closeR - margin));
  plate = L.opening(plate, 0.3);
  if (smooth) plate = L.opening(L.closing(plate, smooth), smooth);
  if (rect) {
    const b = L.toPolys(content).flatMap((p) => p.outer);
    const xs = b.map((p) => p[0]), ys = b.map((p) => p[1]);
    const r = rect.radius, m = margin - r;
    plate = L.offset([L.toPath([[Math.min(...xs) - m, Math.min(...ys) - m], [Math.max(...xs) + m, Math.min(...ys) - m], [Math.max(...xs) + m, Math.max(...ys) + m], [Math.min(...xs) - m, Math.max(...ys) + m]])], r);
  }
  let c = content, rimP = [];
  if (rim) rimP = L.diff(L.offset(plate, -rim.inset), L.offset(plate, -(rim.inset + rim.width)));
  if (distress) [c, rimP] = distress(c, rimP, plate);
  const relief = L.union([...c, ...rimP]);
  const plateP = L.toPolys(plate), reliefP = L.toPolys(relief);
  const holes = plateP.reduce((n, p) => n + p.holes.length, 0);
  const base = L.extrude(plateP, 0, BASE);
  const top = L.extrude(reliefP, BASE, BASE + RELIEF);
  L.writeSTL(path.join(OUT, `${name}.stl`), [...base, ...top], name);
  L.writeSTL(path.join(OUT, `${name}_placa.stl`), base, `${name}_placa`);
  L.writeSTL(path.join(OUT, `${name}_relieve.stl`), top, `${name}_relieve`);
  L.renderPNG(path.join(OUT, `${name}_preview.png`), [
    { polys: plateP, color: [200, 205, 210] },
    { polys: reliefP, color: [20, 60, 70] },
  ]);
  const all = [...base, ...top];
  log(`${name}: pieces=${plateP.length} plateHoles=${holes} tris=${all.length} size=${L.bounds(all).size.join('x')} openEdges(base)=${L.checkClosed(base)} openEdges(relief)=${L.checkClosed(top)}`);
  // erosion survival: plate must stay 1 piece when eroded 1.2 mm (neck >= 2.4 mm)
  log(`  pieces after 1.2mm erosion: ${L.toPolys(L.offset(plate, -1.2)).length}`);
}

// ---------- 1) Vicnat logo ----------
{
  const tris = L.readSTL(path.join(OUT, 'vicnat_logo.stl'));
  const zmax = Math.max(...tris.flat().map((v) => v[2]));
  const topTris = tris.filter((t) => t.every((v) => Math.abs(v[2] - zmax) < 1e-4));
  let fp = L.union(topTris.map((t) => L.toPath(t.map((v) => [v[0], v[1]]))));
  fp = L.closing(fp, 0.02);
  log(`vicnat footprint pieces: ${L.toPolys(fp).length}`);
  build('vicnat_silueta', fp, { margin: 1.8, closeR: 3.2, rim: null });
}

// ---------- 2) batlleWornDev ----------
{
  // Battle-worn bat: intact left wing, right wing broken and hanging, hunched shoulders, torn holes.
  const half = [[0, 3.4], [1.0, 6.4], [2.6, 3.6], [3.6, 3.6], [4.6, 7.8], [8.5, 12.8], [14, 11.2], [20, 9.2], [17.2, 6.2], [18.5, 0.8], [14.3, 3.4], [14.2, -2.8], [10.4, 0.6], [9.6, -4.8], [6, -1.8], [3.2, -4.6], [1.2, -8.6], [0, -6.2]];
  const droop = (([x, y]) => { if (x < 4.5) return [x, y]; const a = (-42 * Math.PI) / 180, dx = x - 4.5, dy = y - 4.5; return [4.5 + (dx * Math.cos(a) - dy * Math.sin(a)) * 0.92, 4.5 + (dx * Math.sin(a) + dy * Math.cos(a)) * 0.92]; });
  const right = half.map(droop);
  const left = half.slice(1, -1).reverse().map(([x, y]) => [-x, y]);
  const full = [...right, ...left];
  const tears = [[[-13, 6.4], [-10.6, 5.0], [-11.4, 7.8]], [[-9.6, 1.6], [-7.2, 0.8], [-8.2, 3.4]], [[-16.4, 2.6], [-14.8, 1.2], [-14.6, 3.4]]];
  const BAT_H = 12; // final height in mm
  const ys = full.map((p) => p[1]);
  const k = BAT_H / (Math.max(...ys) - Math.min(...ys));
  const sc = (poly) => L.toPath(poly.map(([x, y]) => [x * k, y * k]));
  let bat = L.union([sc(full)]);
  bat = L.closing(L.opening(bat, 0.3), 0.4);
  bat = L.diff(bat, L.union(tears.map(sc)));

  const loadFont = (f) => { const b = require('fs').readFileSync(f); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
  const bold = loadFont('C:/Windows/Fonts/segoeuib.ttf');
  const black = loadFont('C:/Windows/Fonts/seguibl.ttf');
  const SIZE = 10;
  const glyphs = [];
  const flat = (cmds) => {
    const rings = []; let cur = [], p0 = [0, 0];
    const bez = (a, c1, c2, b) => { for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t; cur.push([u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], -(u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1])]); } };
    for (const c of cmds) {
      if (c.type === 'M') { if (cur.length > 2) rings.push(cur); cur = [[c.x, -c.y]]; p0 = [c.x, c.y]; }
      else if (c.type === 'L') { cur.push([c.x, -c.y]); p0 = [c.x, c.y]; }
      else if (c.type === 'Q') { bez(p0, [p0[0] + 2 / 3 * (c.x1 - p0[0]), p0[1] + 2 / 3 * (c.y1 - p0[1])], [c.x + 2 / 3 * (c.x1 - c.x), c.y + 2 / 3 * (c.y1 - c.y)], [c.x, c.y]); p0 = [c.x, c.y]; }
      else if (c.type === 'C') { bez(p0, [c.x1, c.y1], [c.x2, c.y2], [c.x, c.y]); p0 = [c.x, c.y]; }
      else if (c.type === 'Z') { if (cur.length > 2) rings.push(cur); cur = []; }
    }
    if (cur.length > 2) rings.push(cur);
    return rings;
  };
  const w1 = bold.getAdvanceWidth('batlle', SIZE);
  glyphs.push(...flat(bold.getPath('batlle', 0, 0, SIZE).commands));
  glyphs.push(...flat(black.getPath('WornDev', w1, 0, SIZE).commands));
  let text = L.union(glyphs.map(L.toPath));
  const tb = L.toPolys(text).flatMap((p) => p.outer);
  const tx0 = Math.min(...tb.map((p) => p[0])), tx1 = Math.max(...tb.map((p) => p[0]));
  const ty0 = Math.min(...tb.map((p) => p[1])), ty1 = Math.max(...tb.map((p) => p[1]));
  log(`text size: ${(tx1 - tx0).toFixed(1)} x ${(ty1 - ty0).toFixed(1)} mm`);

  // place bat left of text, vertically centred on the text block
  const GAP = 3;
  const batB = L.toPolys(bat).flatMap((p) => p.outer);
  const bx0 = Math.min(...batB.map((p) => p[0])), bx1 = Math.max(...batB.map((p) => p[0]));
  const shift = (paths, dx, dy) => paths.map((r) => r.map((p) => ({ X: p.X + Math.round(dx * L.S), Y: p.Y + Math.round(dy * L.S) })));
  const textShifted = shift(text, -tx0, -(ty0 + ty1) / 2);
  // bat centre x = -GAP - batHalfWidth, so its right edge sits GAP left of the text start (x=0)
  const batPlaced = shift(bat, -GAP - bx1, 0);
  const content = L.union([...textShifted, ...batPlaced]);
  // --- battle damage: chipped edges, claw slashes, broken rim (seeded so it is reproducible) ---
  let seed = 7;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const blob = (cx, cy, r, n = 6) => L.toPath(Array.from({ length: n }, (_, i) => { const a = ((i + rnd() * 0.6) / n) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.5); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; }));
  const slash = (cx, cy, len, deg, w) => { const a = (deg * Math.PI) / 180, dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2, nx = -Math.sin(a) * w / 2, ny = Math.cos(a) * w / 2; return L.toPath([[cx - dx + nx, cy - dy + ny], [cx + dx + nx * 0.4, cy + dy + ny * 0.4], [cx + dx - nx * 0.4, cy + dy - ny * 0.4], [cx - dx - nx, cy - dy - ny]]); };
  const along = (rings, n, f) => { const edges = rings.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]])); for (let i = 0; i < n; i++) { const [a, b] = edges[Math.floor(rnd() * edges.length)], t = rnd(); f(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); } };
  const distress = (c, rimP, plate) => {
    seed = 7;
    const cuts = [];
    const rings = L.toPolys(c).flatMap((p) => [p.outer, ...p.holes]);
    along(rings, 34, (x, y) => cuts.push(blob(x, y, 0.16 + rnd() * 0.16)));
    [-23.6, -21.2, -18.8].forEach((x, i) => cuts.push(slash(x, 0.4 - i * 0.5, 9, 64, 0.6)));
    const rimRings = L.toPolys(rimP).flatMap((p) => [p.outer, ...p.holes]);
    const rimCuts = [];
    along(rimRings, 4, (x, y) => rimCuts.push(blob(x, y, 0.8 + rnd() * 0.6, 7)));
    return [L.diff(c, L.union(cuts)), L.diff(rimP, L.union(rimCuts))];
  };
  build('batlleWornDev', content, { margin: 2.6, closeR: 3.6, rim: { inset: 0.6, width: 0.7 }, rect: { radius: 3 }, distress });
  build('batlleWornDev_silueta', content, { margin: 2.6, closeR: 4.5, smooth: 1.5, rim: { inset: 0.6, width: 0.7 }, distress });
}
