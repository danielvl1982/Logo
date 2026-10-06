// Generates the batlleWornDev logo (SVG + transparent PNG): bat with a broken, drooping right wing + wordmark.
// Usage: node logo.js
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');
const { Resvg } = require('@resvg/resvg-js');

const OUT = path.join(__dirname, '..');
const INK = '#143c46';
const ACCENT = '#e8892b';

// Hand-drawn bat (y down, origin = body centre). Left wing intact, right wing snapped at the elbow and hanging.
const P = (pts) => 'M' + pts.map(([x, y]) => x + ' ' + y).join('L') + 'Z';
const main = [[0,-6],[7,-10],[15,-36],[23,-8],[40,-14],[62,-28],[56,-18],[64,-10],[54,-2],[30,14],[22,40],[16,62],[10,72],[0,86],[-10,72],[-16,62],[-24,44],[-60,92],[-82,52],[-118,84],[-132,40],[-176,60],[-176,10],[-214,-8],[-150,-40],[-92,-62],[-30,-14],[-23,-8],[-15,-36],[-7,-10]];
const hang = [[72,-20],[110,-8],[118,50],[126,100],[104,84],[102,126],[82,96],[74,128],[66,84],[58,40],[70,10],[62,0]];
const tears = [[[-150,-10],[-132,-20],[-138,0]],[[-100,0],[-82,-10],[-84,12]],[[-125,20],[-108,28],[-124,40]]];
const bx0 = -214, bx1 = 126, by0 = -64, by1 = 128;
const BAT_H = 220;
const k = BAT_H / (by1 - by0);
const batW = (bx1 - bx0) * k;
const batPath = [main, hang, ...tears].map(P).join('');
const batSvg = `<g transform="scale(${k}) translate(${-bx0} ${-by0})"><path d="${batPath}" fill="${INK}" fill-rule="evenodd" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><circle cx="-6" cy="-2" r="2.6" fill="${ACCENT}"/><circle cx="6" cy="-2" r="2.6" fill="${ACCENT}"/></g>`;

const load = (f) => { const b = fs.readFileSync(f); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const bold = load('C:/Windows/Fonts/segoeuib.ttf');
const black = load('C:/Windows/Fonts/seguibl.ttf');
const SIZE = 150;
const w1 = bold.getAdvanceWidth('Battle', SIZE);
const w2 = black.getAdvanceWidth('WornDev', SIZE);
const textW = w1 + w2;

const PAD = 40, GAP = 30;
const W = Math.ceil(PAD * 2 + batW + GAP + textW);
const H = BAT_H + PAD * 2;
const baseline = PAD + BAT_H / 2 + SIZE * 0.35;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <g transform="translate(${PAD} ${PAD})">${batSvg}</g>
  <g transform="translate(${PAD + batW + GAP} 0)">
    <path d="${bold.getPath('Battle', 0, baseline, SIZE).toPathData(2)}" fill="${INK}"/>
    <path d="${black.getPath('WornDev', w1, baseline, SIZE).toPathData(2)}" fill="${ACCENT}"/>
  </g>
</svg>`;

fs.writeFileSync(path.join(OUT, 'BattleWornDev_logo.svg'), svg);
const png = new Resvg(svg, { fitTo: { mode: 'width', value: W * 2 } }).render().asPng();
fs.writeFileSync(path.join(OUT, 'BattleWornDev_logo.png'), png);
console.log(`ok ${W * 2}x${H * 2}px`);
