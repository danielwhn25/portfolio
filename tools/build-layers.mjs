/* ============================================================
   Turns real Altium Gerber output into the SVG layers used by the
   board stack on the landing page.

   Each entry below composites a few Gerber files from one project
   into a single SVG: the copper, optionally the silkscreen, and the
   board edge, all registered in one coordinate space.

   Run from this directory:
     npm install
     node build-layers.mjs

   Output lands in ../layers/. Re-run it whenever a board is
   re-exported from Altium; the page just loads whatever is there.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import gerberToSvg from 'gerber-to-svg';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'layers');

const ALTIUM = 'C:\\Altium';
const boards = [
  {
    name: 'timing-gates',
    dir: `${ALTIUM}\\ESP_MASTER\\Project Outputs for ESP_MASTER`,
    copper: 'ESP_Layout_2.1.GTL',
    silk: 'ESP_Layout_2.1.GTO',
    edge: 'ESP_Layout_2.1.GM'
  },
  {
    name: 'poe',
    dir: `${ALTIUM}\\POE\\Project Outputs for POE`,
    copper: 'POE_Copper_Signal_Top.gbr',  // routed layer; Signal_1 is a flat GND pour
    silk: 'POE_Legend_Top.gbr',
    edge: 'POE_Profile.gbr'
  },
  {
    name: 'ir-remote',
    dir: `${ALTIUM}\\IR_transmitter\\Project Outputs for IR_transmitter`,
    copper: 'IR_remote.GBL',
    silk: 'IR_remote.GBO',
    edge: 'IR_remote.GM'
  }
];

/* gerber-to-svg emits:
     <svg viewBox="minX minY w h"><defs>…</defs><g transform="translate(0,K) scale(1,-1)">…</g></svg>
   where K = minY + maxY, i.e. the Y flip is about that layer's own
   bounding box. To stack layers of one board in a shared frame we
   re-wrap the content with a flip about the *shared* box instead. */
const render = (file, id) => new Promise((resolve, reject) => {
  gerberToSvg(readFileSync(file, 'utf8'), { id, optimizePaths: true }, (err, svg) => {
    if (err) return reject(err);
    const vb = /viewBox="([\d.\-eE ]+)"/.exec(svg);
    if (!vb) return reject(new Error(`no viewBox in ${file}`));
    const [x, y, w, h] = vb[1].trim().split(/\s+/).map(Number);
    const defs = /<defs>([\s\S]*?)<\/defs>/.exec(svg);
    const body = /<g transform="translate\([^)]*\)[^"]*"[^>]*>([\s\S]*)<\/g><\/svg>$/.exec(svg);
    if (!body) return reject(new Error(`unexpected structure in ${file}`));
    resolve({ box: { x, y, w, h }, defs: defs ? defs[1] : '', body: body[1] });
  });
});

const union = boxes => {
  const x = Math.min(...boxes.map(b => b.x));
  const y = Math.min(...boxes.map(b => b.y));
  const x2 = Math.max(...boxes.map(b => b.x + b.w));
  const y2 = Math.max(...boxes.map(b => b.y + b.h));
  return { x, y, w: x2 - x, h: y2 - y };
};

for (const board of boards) {
  const parts = [];
  for (const [role, key] of [['cu', 'copper'], ['silk', 'silk'], ['edge', 'edge']]) {
    if (!board[key]) continue;
    const file = join(board.dir, board[key]);
    if (!existsSync(file)) {
      console.warn(`  skip ${board.name}/${role}: ${board[key]} not found`);
      continue;
    }
    parts.push({ role, ...await render(file, `${board.name}-${role}`) });
  }
  if (!parts.length) { console.warn(`! ${board.name}: nothing to render`); continue; }

  /* The copper defines the board. Some mechanical layers are a fab drawing sheet (dimensions, title block, notes) several times the size of the PCB,
     so anything wildly larger than the copper is dropped rather than
     allowed to blow out the frame. */
  const copper = parts.find(p => p.role === 'cu');
  if (!copper) { console.warn(`! ${board.name}: no copper layer`); continue; }

  const fits = (b, factor) =>
    b.w <= copper.box.w * factor && b.h <= copper.box.h * factor;

  const kept = parts.filter(p => {
    if (p.role === 'cu') return true;
    if (p.role === 'edge' && !fits(p.box, 1.2)) {
      console.warn(`  ${board.name}: dropping ${board.edge}, ${(p.box.w / copper.box.w).toFixed(1)}x the copper, looks like a drawing sheet`);
      return false;
    }
    return fits(p.box, 1.35);
  });

  /* A little breathing room so copper never touches the board edge. */
  const raw = union(kept.map(p => p.box));
  const pad = Math.max(raw.w, raw.h) * 0.035;
  const box = { x: raw.x - pad, y: raw.y - pad, w: raw.w + pad * 2, h: raw.h + pad * 2 };
  const flip = box.y + (box.y + box.h);
  const radius = Math.min(box.w, box.h) * 0.035;

  /* Draw order matches a real board: substrate, copper, silk, edge. */
  const order = ['cu', 'silk', 'edge'];
  const clip = `clip-${board.name}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x.toFixed(2)} ${box.y.toFixed(2)} ${box.w.toFixed(2)} ${box.h.toFixed(2)}"`,
    ` preserveAspectRatio="xMidYMid meet" stroke-linecap="round" stroke-linejoin="round" stroke-width="0" fill-rule="evenodd" aria-hidden="true">`,
    `<defs>${kept.map(p => p.defs).join('')}`,
    `<clipPath id="${clip}"><rect x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" rx="${radius.toFixed(2)}"/></clipPath></defs>`,
    `<rect class="pcb-body" x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" rx="${radius.toFixed(2)}"/>`,
    `<g clip-path="url(#${clip})">`,
    ...order.map(role => {
      const p = kept.find(q => q.role === role);
      if (!p) return '';
      return `<g class="gb-${role}" transform="translate(0,${flip.toFixed(3)}) scale(1,-1)" fill="currentColor" stroke="currentColor">${p.body}</g>`;
    }),
    `</g></svg>`
  ].join('');

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${board.name}.svg`), svg);
  console.log(`${board.name}.svg  ${(svg.length / 1024).toFixed(1)} KB  layers: ${parts.map(p => p.role).join(', ')}`);
}
