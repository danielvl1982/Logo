// Print-ready STLs for the BattleWornDev logo: flat logo + keychain (silhouette plate, keyring loop, raised relief).
// Usage: node make_logo.js   (outputs to ../stl)
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');
const L = require('./lib');
const SH = require('./shapes');

const OUT = path.join(__dirname, '..', 'stl');
fs.mkdirSync(OUT, { recursive: true });

// Layout mirrors logo.js (px, y down); MM_PER_PX sets the physical size.
const MM_PER_PX = 0.05;
const BAT_H = 220, SIZE = 150, PAD = 40, GAP = 30;
const BASE = 1.2, RELIEF = 0.8;                 // plate / raised detail thickness (mm)
const MARGIN = 2, CLOSE_R = 3.5;                 // silhouette margin around the art, fusing radius (mm)
const TAB = { outer: 4.5, hole: 2.2, overlap: 2 }; // keyring loop (mm)

const load = (f) => { const b = fs.readFileSync(f); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const bold = load('C:/Windows/Fonts/segoeuib.ttf');
const black = load('C:/Windows/Fonts/seguibl.ttf');

// px (y down) -> mm (y up)
const mm = ([x, y]) => [x * MM_PER_PX, -y * MM_PER_PX];

function glyphRings(font, text, x, baseline) {
  const rings = []; let cur = [], p0 = [0, 0];
  const bez = (a, c1, c2, b) => { for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t; cur.push([u*u*u*a[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*b[0], u*u*u*a[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*b[1]]); } };
  for (const c of font.getPath(text, x, baseline, SIZE).commands) {
    if (c.type === 'M') { if (cur.length > 2) rings.push(cur); cur = [[c.x, c.y]]; p0 = [c.x, c.y]; }
    else if (c.type === 'L') { cur.push([c.x, c.y]); p0 = [c.x, c.y]; }
    else if (c.type === 'Q') { bez(p0, [p0[0] + 2/3*(c.x1 - p0[0]), p0[1] + 2/3*(c.y1 - p0[1])], [c.x + 2/3*(c.x1 - c.x), c.y + 2/3*(c.y1 - c.y)], [c.x, c.y]); p0 = [c.x, c.y]; }
    else if (c.type === 'C') { bez(p0, [c.x1, c.y1], [c.x2, c.y2], [c.x, c.y]); p0 = [c.x, c.y]; }
    else if (c.type === 'Z') { if (cur.length > 2) rings.push(cur); cur = []; }
  }
  if (cur.length > 2) rings.push(cur);
  return L.union(rings.map((r) => L.toPath(r.map(mm))));
}

// ---- art ----
const k = BAT_H / (SH.bounds.y1 - SH.bounds.y0);
const batW = (SH.bounds.x1 - SH.bounds.x0) * k;
const toPx = ([x, y]) => [PAD + (x - SH.bounds.x0) * k, PAD + (y - SH.bounds.y0) * k];
const batRing = (pts) => L.toPath(pts.map((p) => mm(toPx(p))));
// SVG draws the bat with a round-join stroke on top of the fill: replicate by offsetting half the stroke width.
let bat = L.diff(L.union([batRing(SH.main), batRing(SH.hang)]), L.union(SH.tears.map(batRing)));
bat = L.offset(bat, (SH.STROKE / 2) * k * MM_PER_PX);

const w1 = bold.getAdvanceWidth('Battle', SIZE);
const baseline = PAD + BAT_H / 2 + SIZE * 0.35;
const tx = PAD + batW + GAP;
const battle = glyphRings(bold, 'Battle', tx, baseline);
const worndev = glyphRings(black, 'WornDev', tx + w1, baseline);

const teal = L.union([...bat, ...battle]);
const orange = worndev;
const art = L.union([...teal, ...orange]);

// ---- plate (silhouette) + keyring loop ----
let plate = L.offset(L.offset(art, CLOSE_R), -(CLOSE_R - MARGIN));
plate = L.opening(L.closing(plate, 1.5), 1.5);
const leftmost = L.toPolys(plate).flatMap((p) => p.outer).reduce((a, p) => (p[0] < a[0] ? p : a));
const cx = leftmost[0] - TAB.outer + TAB.overlap, cy = leftmost[1];
const circle = (r) => [L.toPath(Array.from({ length: 72 }, (_, i) => [cx + Math.cos((i / 72) * Math.PI * 2) * r, cy + Math.sin((i / 72) * Math.PI * 2) * r]))];
plate = L.diff(L.union([...plate, ...circle(TAB.outer)]), circle(TAB.hole));

// ---- STL output ----
const bodyOf = (paths, z0, z1) => L.extrude(L.toPolys(paths), z0, z1);
const stl = (name, tris) => L.writeSTL(path.join(OUT, `${name}.stl`), tris, name);
const report = (name, tris) => console.log(`${name}: tris=${tris.length} size=${L.bounds(tris).size.join('x')} openEdges=${L.checkClosed(tris)}`);

const T = BASE + RELIEF;
const logo = { all: bodyOf(art, 0, T), teal: bodyOf(teal, 0, T), orange: bodyOf(orange, 0, T) };
stl('BattleWornDev_logo', logo.all); stl('BattleWornDev_logo_teal', logo.teal); stl('BattleWornDev_logo_naranja', logo.orange);
report('logo', logo.all);

const base = bodyOf(plate, 0, BASE);
const reliefTeal = bodyOf(teal, BASE, T), reliefOrange = bodyOf(orange, BASE, T);
stl('BattleWornDev_llavero', [...base, ...reliefTeal, ...reliefOrange]);
stl('BattleWornDev_llavero_placa', base);
stl('BattleWornDev_llavero_relieve_teal', reliefTeal);
stl('BattleWornDev_llavero_relieve_naranja', reliefOrange);
report('llavero', [...base, ...reliefTeal, ...reliefOrange]);
console.log(`plate pieces=${L.toPolys(plate).length} holes=${L.toPolys(plate).reduce((n, p) => n + p.holes.length, 0)}; ring wall=${(TAB.outer - TAB.hole).toFixed(1)}mm`);

L.renderPNG(path.join(OUT, 'llavero_preview.png'), [
  { polys: L.toPolys(plate), color: [200, 205, 210] },
  { polys: L.toPolys(teal), color: [20, 60, 70] },
  { polys: L.toPolys(orange), color: [232, 137, 43] },
]);
