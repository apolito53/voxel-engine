// Original review-only corner-Wang terrain studies, authored with Pixel Workshop.
// No current runtime/source asset is read or replaced.
// Usage: node scripts/author_art_studies.mjs [path-to-pixel-workshop]
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const workshopRoot = resolve(process.argv[2] ?? "logs/visual-runs/2026-11-07-art-upgrade/workshop-engine");
const { createDocument, applyCommands, composite, validateDocument } = await import(pathToFileURL(join(workshopRoot, "lib/pixels.ts")));
const { encodePng } = await import(pathToFileURL(join(workshopRoot, "lib/png.ts")));
const outRoot = resolve("assets/terrain/studies-2026-11-08");
const SIZE = 32, PERIOD = 31, VARIANTS = 4;
const symbols = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const materialIds = ["grass", "stone", "dirt", "bark"];
const styles = [
  {
    id: "sunwashed", name: "Sunwashed",
    description: "Warm olive turf, broad chalky limestone, honeyed earth and pale fibrous bark. Restrained, low-contrast, sun-baked shapes.",
    colors: {
      grass: ["#647347", "#879258", "#949e60", "#aeb472", "#c6c58b"],
      stone: ["#999783", "#b2ae98", "#cbc5ad", "#ded7bf", "#eee7d0"],
      dirt: ["#83654d", "#9a7756", "#b18e66", "#c5a57b", "#d9be91"],
      bark: ["#72563d", "#8c6c48", "#a28558", "#b9a16e", "#d1b984"],
    },
  },
  {
    id: "wildwood", name: "Wildwood",
    description: "Deep teal turf, violet slate, ochre earth and dusky plum bark. Angular clusters, crisp lit facets and deliberate dark cuts.",
    colors: {
      grass: ["#203e40", "#2c5a54", "#3e7665", "#629582", "#9cb698"],
      stone: ["#343447", "#514a65", "#6c617e", "#93819a", "#b7a8b9"],
      dirt: ["#5c4736", "#82603b", "#a88345", "#cba65e", "#e1c783"],
      bark: ["#302d3b", "#4a3b4c", "#68515d", "#8c6d75", "#b0928d"],
    },
  },
  {
    id: "mineral-frontier", name: "Mineral Frontier",
    description: "Dry sage turf, rusty sedimentary shelves, umber earth and weathered bark. Long interrupted strata and low, graphic horizontal forms.",
    colors: {
      grass: ["#68725f", "#919b7d", "#a0ab8a", "#bac39f", "#d1d3af"],
      stone: ["#714c40", "#95624b", "#b67d57", "#cfa274", "#e1c49a"],
      dirt: ["#564839", "#735e45", "#907754", "#ab946b", "#c2ad80"],
      bark: ["#514a39", "#706548", "#8d805a", "#aa9c6c", "#c9b989"],
    },
  },
];

const mod = (n, d) => ((n % d) + d) % d;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const rgba = (hex) => (Number.parseInt(hex.slice(1), 16) * 256 + 255) >>> 0;
const corners = (mask) => [mask & 1 ? 1 : -1, mask & 2 ? 1 : -1, mask & 4 ? 1 : -1, mask & 8 ? 1 : -1];
const smooth = (n) => n * n * (3 - 2 * n);
// Seeds choose coherent clusters and alternative compositions. Pixel-level
// white noise is deliberately avoided; the tonal grain is interpolated below.
function hash(x, y, seed) {
  let n = Math.imul(x + 71, 374761393) ^ Math.imul(y + 113, 668265263) ^ Math.imul(seed + 19, 1597334677);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function grain(x, y, seed, cells = 6, rows = cells) {
  const px = mod(x, PERIOD) * cells / PERIOD, py = mod(y, PERIOD) * rows / PERIOD;
  const ix = Math.floor(px), iy = Math.floor(py), u = smooth(px-ix), v = smooth(py-iy);
  const sample = (a,b) => hash(mod(a,cells),mod(b,rows),seed) * 2 - 1;
  return (sample(ix,iy)*(1-u)+sample(ix+1,iy)*u)*(1-v)
    + (sample(ix,iy+1)*(1-u)+sample(ix+1,iy+1)*u)*v;
}
// Artist-composed marks live on a 31-pixel torus. The duplicate boundary sample
// gives literal pixel equality across compatible 32px tile borders. The marks
// are small, distributed and directional; there is no per-pixel random noise.
function drawing() {
  const mass = new Float32Array(PERIOD * PERIOD);
  const ink = new Float32Array(PERIOD * PERIOD).fill(Number.NaN);
  const set = (target, x, y, value) => { target[mod(y, PERIOD) * PERIOD + mod(x, PERIOD)] = value; };
  const rect = (target, x, y, w, h, value) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(target, xx, yy, value);
  };
  const poly = (target, points, value) => {
    const minX = Math.floor(Math.min(...points.map(p => p[0]))), maxX = Math.ceil(Math.max(...points.map(p => p[0])));
    const minY = Math.floor(Math.min(...points.map(p => p[1]))), maxY = Math.ceil(Math.max(...points.map(p => p[1])));
    for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if ((yi > y + .5) !== (yj > y + .5) && x + .5 < (xj - xi) * (y + .5 - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) set(target, x, y, value);
    }
  };
  const line = (target, points, value, width = 1) => {
    for (let p = 1; p < points.length; p++) {
      const [ax, ay] = points[p - 1], [bx, by] = points[p];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let i = 0; i <= steps; i++) rect(target, Math.round(ax + (bx - ax) * i / Math.max(1, steps)), Math.round(ay + (by - ay) * i / Math.max(1, steps)), width, width, value);
    }
  };
  return { mass, ink, set, rect, poly, line };
}

function sunwashed(material) {
  const d = drawing(), { mass:m, ink:i, poly:p, rect:r, line:l } = d;
  if (material === "grass") {
    // Wide, low clumps; their bright pixels describe an upper rim, not confetti.
    p(m, [[-5,4],[3,2],[9,3],[10,6],[6,8],[-2,8]], .35);
    p(m, [[12,11],[20,9],[25,11],[27,15],[21,17],[14,16]], -.33);
    p(m, [[2,21],[8,19],[14,21],[13,25],[7,27],[0,25]], .28);
    p(m, [[22,25],[29,23],[35,25],[35,29],[27,30],[22,28]], -.27);
    l(i, [[1,5],[5,5],[6,4],[8,4]], .95);
    l(i, [[16,13],[19,13],[20,12]], -.85);
    l(i, [[6,23],[9,23],[10,22]], .8);
    l(i, [[26,27],[29,27]], .75);
    r(i, 13, 4, 2, 1, .65); r(i, 24, 20, 3, 1, .65);
    r(i, 9, 15, 2, 1, -.75); r(i, 2, 30, 2, 1, -.7);
  } else if (material === "stone") {
    // Chalk plates have open edges. No complete polygon is outlined.
    p(m, [[-4,3],[5,1],[11,3],[9,10],[3,12],[-4,10]], .32);
    p(m, [[14,5],[24,3],[29,6],[28,12],[21,15],[13,12]], -.28);
    p(m, [[3,18],[11,16],[17,19],[15,27],[7,29],[1,25]], .28);
    p(m, [[22,22],[29,19],[35,21],[35,29],[28,31],[21,28]], -.3);
    l(i, [[-2,11],[4,11],[7,10]], -.95);
    l(i, [[15,12],[19,13],[22,13]], -.85);
    l(i, [[5,18],[10,17],[13,18]], .8);
    l(i, [[23,22],[28,21],[30,22]], .8);
    l(i, [[19,23],[18,26],[19,28]], -.8);
    r(i, 13, 3, 2, 1, .8); r(i, 4, 26, 3, 1, .6);
    r(i, 26, 9, 2, 1, -.6);
  } else if (material === "dirt") {
    p(m, [[-4,5],[4,3],[11,5],[12,9],[8,12],[1,11],[-4,9]], -.3);
    p(m, [[15,1],[23,-1],[29,2],[28,6],[21,7],[15,5]], .28);
    p(m, [[5,17],[13,15],[19,18],[17,23],[10,24],[4,21]], .35);
    p(m, [[24,20],[31,18],[35,21],[33,26],[27,27],[22,25]], -.28);
    l(i, [[1,8],[4,8],[5,7]], -.75);
    l(i, [[8,18],[12,18]], .85);
    l(i, [[21,12],[25,12],[26,11]], .65);
    r(i, 13, 28, 3, 1, .85); r(i, 14, 29, 2, 1, .45);
    r(i, 28, 4, 2, 1, -.8); r(i, 3, 26, 2, 1, -.7);
  } else {
    // Shallow vertical fibers and interrupted warm ridges, without a knot icon.
    p(m, [[2,-3],[7,-3],[8,7],[6,16],[7,25],[6,34],[2,34],[3,21],[2,10]], -.35);
    p(m, [[12,-3],[17,-3],[16,8],[18,17],[16,25],[17,34],[12,34],[13,22],[12,12]], .27);
    p(m, [[24,-3],[28,-3],[27,8],[29,18],[27,34],[23,34],[25,18]], -.3);
    l(i, [[3,-2],[4,7],[3,12]], -.85);
    l(i, [[5,18],[4,24],[5,29]], -.75);
    l(i, [[14,2],[15,8],[14,13]], .95);
    l(i, [[17,19],[16,26]], .8);
    l(i, [[25,7],[26,15],[25,20]], -.8);
    l(i, [[29,22],[28,28],[29,32]], .7);
    r(i, 10, 17, 1, 4, -.6); r(i, 21, 1, 1, 3, .6);
  }
  return d;
}

function wildwood(material) {
  const d = drawing(), { mass:m, ink:i, poly:p, rect:r, line:l } = d;
  if (material === "grass") {
    const clumps = [
      [[-4,3],[3,0],[9,3],[6,6],[8,8],[1,10],[-4,7]],
      [[13,6],[19,3],[25,6],[22,10],[17,12],[12,9]],
      [[3,17],[8,13],[14,16],[11,20],[5,23],[1,20]],
      [[21,20],[27,15],[33,18],[31,23],[26,26],[20,24]],
      [[9,28],[15,24],[21,27],[19,31],[13,34],[8,31]],
    ];
    for (const [n, pts] of clumps.entries()) p(m, pts, n % 2 ? -.48 : .43);
    p(i, [[0,3],[3,2],[6,3],[3,5],[0,5]], 1.15);
    p(i, [[15,6],[18,5],[21,6],[18,8],[14,8]], 1.2);
    p(i, [[4,17],[7,15],[10,16],[8,18],[4,19]], 1.05);
    p(i, [[24,19],[27,17],[30,18],[28,20],[23,21]], 1.15);
    p(i, [[12,28],[15,26],[18,27],[16,29],[12,30]], 1.15);
    l(i, [[-1,8],[3,8],[5,7]], -1.45);
    l(i, [[16,11],[20,10],[22,9]], -1.4);
    l(i, [[5,22],[9,20]], -1.3);
    l(i, [[26,25],[29,23]], -1.4);
    r(i, 12, 1, 2, 1, .5); r(i, 18, 18, 2, 1, -.7);
  } else if (material === "stone") {
    p(m, [[-4,5],[3,0],[10,2],[8,10],[2,15],[-4,13]], -.42);
    p(m, [[13,0],[22,-2],[27,3],[21,10],[15,12],[11,7]], .4);
    p(m, [[17,15],[25,9],[31,12],[30,19],[24,24],[17,21]], -.42);
    p(m, [[2,22],[9,16],[15,19],[12,26],[6,32],[0,29]], .4);
    p(m, [[20,30],[24,25],[31,24],[35,28],[32,34],[24,35]], .28);
    l(i, [[-1,5],[3,2],[7,3]], 1.15);
    l(i, [[14,1],[20,0],[23,2]], 1.1);
    l(i, [[19,15],[24,12],[27,13]], .95);
    l(i, [[3,22],[8,19],[11,20]], 1.2);
    l(i, [[8,11],[5,15],[4,18]], -1.5);
    l(i, [[20,10],[18,13],[17,18]], -1.4);
    l(i, [[12,26],[10,29],[11,32]], -1.3);
    l(i, [[28,20],[25,24],[26,26]], -1.25);
    r(i, 14, 16, 2, 1, .9); r(i, 23, 29, 3, 1, .85);
  } else if (material === "dirt") {
    p(m, [[-3,4],[5,1],[10,5],[7,11],[0,13],[-4,9]], -.4);
    p(m, [[15,1],[23,-2],[28,2],[25,7],[19,10],[14,6]], .35);
    p(m, [[8,16],[15,11],[20,15],[17,21],[10,24],[5,20]], .38);
    p(m, [[24,19],[31,14],[35,18],[32,24],[26,29],[22,25]], -.35);
    l(i, [[1,5],[5,3],[7,5]], 1.05);
    l(i, [[17,2],[22,1],[24,2]], .95);
    l(i, [[9,16],[13,14],[16,16]], 1.15);
    l(i, [[0,11],[4,10],[6,8]], -1.15);
    l(i, [[14,22],[17,20],[18,18]], -1.1);
    l(i, [[26,26],[29,23]], -1.2);
    r(i, 3, 27, 3, 1, .85); r(i, 4, 28, 2, 1, .4);
    r(i, 22, 12, 2, 1, -.8); r(i, 13, 28, 2, 1, -.8);
  } else {
    // Tall raised scales share a grain direction, but the crack ends are offset.
    p(m, [[1,-4],[7,-4],[9,5],[6,14],[7,23],[5,35],[0,35],[3,21],[1,10]], -.4);
    p(m, [[12,-3],[18,-3],[16,8],[19,16],[16,27],[17,35],[11,35],[13,22],[11,12]], .35);
    p(m, [[24,-3],[30,-3],[27,7],[30,18],[27,29],[29,35],[23,35],[25,19],[22,11]], -.25);
    l(i, [[3,-2],[5,5],[3,11],[4,14]], -1.5);
    l(i, [[5,20],[4,26],[5,30]], -1.35);
    l(i, [[14,1],[13,7],[15,12]], 1.3);
    l(i, [[16,20],[14,27]], 1.1);
    l(i, [[25,4],[24,10],[26,15]], -1.4);
    l(i, [[28,20],[26,26],[27,31]], 1.15);
    l(i, [[6,15],[9,17],[9,20]], -1.05);
    l(i, [[18,13],[20,15],[20,18]], -.9);
  }
  return d;
}

function mineralFrontier(material) {
  const d = drawing(), { mass:m, ink:i, poly:p, rect:r, line:l } = d;
  if (material === "grass") {
    p(m, [[-4,4],[5,2],[13,3],[14,6],[9,8],[-3,8]], .32);
    p(m, [[17,11],[25,9],[35,10],[35,14],[25,16],[18,15]], -.3);
    p(m, [[1,22],[9,19],[18,21],[17,25],[8,27],[0,25]], .35);
    p(m, [[23,28],[30,26],[36,27],[36,30],[26,32],[22,31]], -.3);
    l(i, [[0,5],[6,5],[8,4]], .95);
    l(i, [[21,12],[26,12],[28,11]], -.85);
    l(i, [[5,23],[11,23],[13,22]], .9);
    l(i, [[27,29],[31,28]], .7);
    r(i, 15, 7, 3, 1, .7); r(i, 16, 6, 1, 1, .4);
    r(i, 17, 28, 3, 1, -.75); r(i, 4, 15, 3, 1, .65);
  } else if (material === "stone") {
    // Hand-cut beds: broad, unequal strata with a few thin mineral ledges.
    p(m, [[-4,4],[6,3],[14,4],[22,3],[35,5],[35,11],[24,10],[17,12],[7,10],[-4,11]], -.45);
    p(m, [[-4,14],[4,15],[12,13],[20,14],[28,13],[35,15],[35,21],[24,20],[14,22],[4,20],[-4,22]], .42);
    p(m, [[-4,26],[7,24],[16,26],[25,24],[35,25],[35,29],[22,29],[13,28],[4,30],[-4,30]], -.2);
    l(i, [[-3,4],[5,3],[10,4],[13,4]], -1.3);
    l(i, [[18,4],[22,3],[28,4],[32,4]], -1.2);
    l(i, [[-2,14],[4,15],[10,14]], 1.05);
    l(i, [[15,14],[20,14],[24,13],[28,13]], 1.25);
    l(i, [[3,21],[8,21],[12,22],[18,21]], -1.25);
    l(i, [[24,21],[28,20],[33,21]], -1.2);
    l(i, [[-3,26],[5,25],[10,25]], .9);
    l(i, [[17,27],[24,26],[29,26]], .95);
    l(i, [[15,5],[14,8],[15,10]], -.9);
    l(i, [[25,16],[24,18]], -.8);
    r(i, 5, 17, 5, 1, .75); r(i, 21, 8, 4, 1, .7);
  } else if (material === "dirt") {
    p(m, [[-4,5],[5,3],[15,4],[23,3],[35,5],[35,10],[23,9],[12,11],[3,9],[-4,10]], -.35);
    p(m, [[-4,17],[5,15],[15,17],[24,15],[35,17],[35,22],[25,23],[13,21],[3,23],[-4,22]], .32);
    p(m, [[4,28],[12,25],[22,26],[28,29],[25,31],[13,30],[5,32]], -.28);
    l(i, [[-2,7],[4,6],[10,7]], -.9);
    l(i, [[17,8],[23,7],[27,7]], -.9);
    l(i, [[1,17],[6,16],[12,17]], .95);
    l(i, [[19,17],[25,16],[30,17]], .9);
    l(i, [[7,28],[11,27],[16,28]], -.8);
    r(i, 13, 13, 4, 1, .75); r(i, 2, 27, 3, 1, .65);
    r(i, 24, 26, 3, 1, .8); r(i, 19, 3, 2, 1, .7);
  } else {
    p(m, [[1,-3],[7,-3],[8,9],[6,18],[7,34],[2,34],[3,17]], -.32);
    p(m, [[13,-3],[19,-3],[18,10],[20,22],[18,34],[12,34],[14,18]], .3);
    p(m, [[25,-3],[29,-3],[28,12],[30,21],[28,34],[24,34],[26,20]], -.3);
    l(i, [[4,-2],[5,8],[4,12]], -1.1);
    l(i, [[5,18],[4,26],[5,31]], -1.05);
    l(i, [[15,3],[16,10],[15,15]], 1.0);
    l(i, [[18,22],[17,29]], .85);
    l(i, [[26,8],[27,16],[26,20]], -1.0);
    l(i, [[29,23],[28,29]], .9);
    // Square-ended, interrupted weathering gives this bark a dry, flaked rhythm.
    l(i, [[3,14],[8,14]], -.9); l(i, [[13,19],[18,19]], -.85);
    l(i, [[23,4],[27,4]], -.8); l(i, [[24,24],[28,24]], -.85);
    r(i, 9, 5, 1, 5, .7); r(i, 21, 25, 1, 4, .7);
  }
  return d;
}

function cornerField(mask, x, y, style, material) {
  const [nw, ne, se, sw] = corners(mask);
  const tx = x / PERIOD, ty = y / PERIOD;
  // Inward warping makes patches less like four triangular corner wedges.
  // All warping is exactly zero on borders; an edge depends on two corners only.
  const bubble = x === 0 || y === 0 || x === PERIOD || y === PERIOD ? 0 : Math.sin(Math.PI * tx) * Math.sin(Math.PI * ty);
  let u = tx, v = ty;
  if (style === "sunwashed") {
    u += bubble * (.05 * Math.sin(ty * Math.PI * 2) - .025);
    v += bubble * .065 * Math.sin((tx + .13) * Math.PI * 2);
  } else if (style === "wildwood") {
    u += bubble * ((Math.floor(y / 5) % 2 ? 1 : -1) * .035);
    v += bubble * .055 * (Math.abs(tx * 2 - 1) - .4);
  } else {
    u += bubble * .025 * Math.sin(ty * Math.PI * 2);
    v += bubble * .035 * Math.sin(tx * Math.PI * 2);
  }
  // Rock uses planar interpolation; turf and soil keep softer connected fields.
  u = material === "stone" ? clamp(u, 0, 1) : smooth(clamp(u, 0, 1));
  v = material === "stone" ? clamp(v, 0, 1) : smooth(clamp(v, 0, 1));
  if (x === 0) return nw * (1 - v) + sw * v;
  if (x === PERIOD) return ne * (1 - v) + se * v;
  if (y === 0) return nw * (1 - u) + ne * u;
  if (y === PERIOD) return sw * (1 - u) + se * u;
  return (nw * (1 - u) + ne * u) * (1 - v) + (sw * (1 - u) + se * u) * v;
}

// Sixteen explicitly composed interiors. These are layout decisions, not tile
// rotations or noise seeds: position, size, count and line ends all change.
// Every fragment stays within a three-pixel boundary guard.
const interiorLayouts = [
  [[6,7,8,4],[20,21,6,3]],
  [[15,12,9,4]],
  [[5,20,9,4],[22,8,5,4]],
  [[7,7,5,3],[18,18,9,5]],
  [[6,13,10,4],[20,25,6,2]],
  [[18,6,9,4],[7,22,7,4],[21,17,5,3]],
  [[6,6,9,4],[17,23,10,3]],
  [[10,15,10,5]],
  [[20,7,7,5],[6,24,8,3]],
  [[7,8,7,5],[20,17,7,4],[10,25,5,2]],
  [[6,16,8,3],[18,24,10,3]],
  [[14,6,11,4],[6,24,7,3]],
  [[6,10,11,4],[20,20,7,4]],
  [[7,21,10,4],[21,7,6,3]],
  [[6,6,6,4],[19,15,9,5]],
  [[6,17,7,4],[20,25,6,2],[17,6,8,3]],
];
function composeInterior(style, material, mask, variant, shared) {
  const d = drawing(), { mass:m, ink:i, poly:p, rect:r, line:l } = d;
  const mineral = style.id === "mineral-frontier", wild = style.id === "wildwood";
  const seed = 101 + mask*97 + variant*809 + materialIds.indexOf(material)*179;
  for (let y = 0; y < PERIOD; y++) for (let x = 0; x < PERIOD; x++) {
    const at = y * PERIOD + x;
    const edgeDistance = Math.min(x, y, PERIOD - x, PERIOD - y);
    // Only small boundary fragments are shared verbatim. Mineral's broad beds
    // and bark's long grain keep a quieter structural underpainting inside.
    const core = material === "grass" ? 0 : material === "bark" ? 1.55 : mineral && material === "stone" ? 1.35 : .18;
    const edgeWeight = clamp((4 - edgeDistance) / 3, 0, 1);
    m[at] = shared.mass[at] * (material === "bark" || mineral && material === "stone" ? core : core + (1 - core) * edgeWeight);
    if (edgeDistance < 3 && Number.isFinite(shared.ink[at])) i[at] = shared.ink[at] * (material === "grass" ? .65 : .9);
  }
  let layout = interiorLayouts[(mask + variant*7) % 16].map(([x,y,w,h],n) => {
    const ww = clamp(w + Math.floor(hash(n,1,seed)*5)-2,4,12);
    const hh = clamp(h + Math.floor(hash(n,2,seed)*3)-1,2,6);
    return [clamp(x+Math.floor(hash(n,3,seed)*5)-2,4,28-ww),clamp(y+Math.floor(hash(n,4,seed)*5)-2,4,27-hh),ww,hh];
  });
  if (hash(mask,variant,seed)> .72) layout.push(interiorLayouts[(mask+variant*3+9)%16][0]);
  // Most grass tiles intentionally have only one or two understated marks.
  if (material === "grass" && !wild) layout = layout.slice(0, hash(mask,variant,seed+3)>.48 ? 2 : 1);
  for (const [n, [x,y,w,h]] of layout.entries()) {
    const alt = (mask + n + variant) % 4;
    if (material === "grass") {
      if (wild) {
        // Low angular tufts with different silhouettes, never a repeated badge.
        const shape = alt === 0 ? [[x,y+1],[x+2,y],[x+w-1,y+1],[x+w,y+2],[x+w-3,y+h],[x+1,y+h-1]]
          : alt === 1 ? [[x,y+h-1],[x+2,y+1],[x+3,y+2],[x+w-2,y],[x+w,y+1],[x+w-2,y+h],[x+1,y+h]]
            : alt === 2 ? [[x,y+1],[x+w-3,y],[x+w,y+2],[x+w-1,y+h],[x+2,y+h],[x+3,y+2]]
              : [[x,y],[x+3,y],[x+4,y+1],[x+w,y+1],[x+w-2,y+h],[x,y+h-1]];
        p(m, shape, n % 2 ? -.35 : .38);
        l(i, [[x+1,y+1],[x+Math.max(2,Math.floor(w*.45)),y],[x+Math.max(3,Math.floor(w*.6)),y]], .95);
        if ((mask+n)%3 === 0) l(i, [[x+2,y+h-1],[x+Math.floor(w*.6),y+h-1]], -.9);
      } else {
        // Sunwashed is a short soft clump; Frontier is a longer wind-combed lip.
        const hh = mineral ? 2 : Math.min(3,h);
        p(m, [[x,y+1],[x+2,y],[x+w-2,y],[x+w,y+1],[x+w-1,y+hh],[x+1,y+hh]], n % 2 ? -.22 : .23);
        l(i, [[x+1,y+1],[x+Math.max(2,Math.floor(w*.5)),y+1]], mineral ? .62 : .55);
        if (mask%4 === 1) r(i, x+Math.floor(w*.4), y, 1, 1, .5);
      }
    } else if (material === "stone") {
      if (mineral) {
        const yy = y + (mask%3 === 0 ? 1 : 0);
        // Keep the large beds continuous. Variant mineral accents alter broken
        // ledge endpoints rather than punching unrelated blobs into the strata.
        const split = Math.floor(w*.55);
        l(i, [[x,yy],[x+split,yy-1]], n%2 ? -1.0 : 1.0);
        if (w>7) l(i, [[x+split+2,yy-1],[x+w,yy]], n%2 ? -.8 : .8);
        if (mask%5 === 0) l(i, [[x+w-2,yy+1],[x+w-3,yy+Math.min(3,h)]], -.8);
      } else {
        const hh = wild ? Math.min(h+6,29-y) : h+3;
        const shape = alt%2 ? [[x+1,y],[x+w-2,y],[x+w,y+2],[x+w-1,y+hh],[x+2,y+hh-1],[x,y+2]]
          : [[x,y+2],[x+Math.floor(w*.4),y],[x+w,y+1],[x+w-2,y+hh],[x+1,y+hh]];
        p(m, shape, n%2 ? (wild ? -.65 : -.48) : (wild ? .66 : .5));
        // Open fracture fragments change orientation and length with composition.
        if (alt === 0) l(i, [[x+1,y+2],[x+Math.floor(w*.4),y],[x+w-3,y+1]], wild ? 1.05 : .7);
        else if (alt === 1) l(i, [[x+2,y],[x+Math.floor(w*.7),y]], wild ? .95 : .75);
        else if (alt === 2) l(i, [[x+w-2,y+2],[x+w-3,y+Math.min(5,hh-1)]], wild ? -1.05 : -.75);
        else l(i, [[x+2,y+hh-1],[x+Math.floor(w*.55),y+hh-2]], wild ? -1.0 : -.8);
        if ((mask+n)%3 === 0) r(i, x+Math.floor(w*.5), y+hh-2, 2, 1, wild ? .75 : .55);
      }
    } else if (material === "dirt") {
      if (mineral) {
        p(m, [[x,y+1],[x+3,y],[x+w,y+1],[x+w-1,y+3],[x+1,y+2]], n%2 ? -.3 : .35);
        l(i, [[x+1,y+1],[x+Math.max(2,w-2),y+1]], .65);
      } else if (wild) {
        p(m, [[x,y+2],[x+Math.floor(w*.5),y],[x+w,y+1],[x+w-2,y+h],[x+1,y+h]], n%2 ? -.38 : .4);
        l(i, [[x+1,y+2],[x+Math.floor(w*.4),y+1],[x+Math.floor(w*.6),y+1]], .8);
        if (alt===0) r(i,x+w-3,y+h-1,2,1,-.8);
      } else {
        p(m, [[x,y+1],[x+3,y],[x+w-1,y+1],[x+w,y+3],[x+Math.floor(w*.5),y+h],[x+1,y+3]], n%2 ? -.28 : .3);
        r(i,x+2,y+1,Math.max(2,Math.floor(w*.4)),1,.6);
      }
    } else {
      const xx = x + Math.floor(w/2), length = Math.min(11, 28-y);
      if (alt%2) l(i, [[xx,y],[xx-1,y+Math.floor(length*.45)],[xx,y+length]], wild ? -1.15 : -.85);
      else l(i, [[xx,y],[xx+1,y+Math.floor(length*.6)],[xx,y+length]], wild ? 1.0 : .8);
      if (wild) p(m, [[xx-2,y+1],[xx+1,y],[xx+3,y+Math.floor(length*.6)],[xx+1,y+length],[xx-2,y+length-2]], n%2 ? -.38 : .4);
      if (mineral && length>4) l(i, [[xx-2,y+Math.floor(length*.7)],[xx+2,y+Math.floor(length*.7)]], -.7);
    }
  }
  // Irregular 1–5px clumps add small pits, tufts and broken chips. The occasional
  // two-step accent deliberately probes the rougher end of these palettes.
  const flecks = [];
  const count = 6 + Math.floor(hash(mask,variant,seed+41)*(material === "dirt" ? 14 : 10));
  for (let n=0;n<count;n++) {
    const cx = 3+Math.floor(hash(n,11,seed)*23), cy = 3+Math.floor(hash(n,12,seed)*23);
    const sign = (hash(n,13,seed)>.48 ? 1 : -1)*(hash(n,15,seed)>.9?2:1);
    const length = 1+Math.floor(hash(n,14,seed)*5);
    const points = material === "bark" ? [[0,0],...(length>1?[[0,1]]:[]),...(length>2?[[1,1],[0,2]]:[]),...(length>3?[[1,3]]:[]),...(length>4?[[0,4]]:[])]
      : [[0,0],...(length>1?[[1,0]]:[]),...(length>2?[[1,-1],[2,0]]:[]),...(length>3?[[3,0],[2,1]]:[]),...(length>4?[[4,1],[3,1]]:[])];
    for (const [dx,dy] of points) flecks.push({x:cx+dx,y:cy+dy,sign});
  }
  d.flecks = flecks;
  return d;
}

function makeTile(style, material, mask, variant, d) {
  const ramp = style.colors[material].map(rgba);
  const pixels = new Array(SIZE * SIZE);
  const sharedSeed = 631 + styles.indexOf(style)*131 + materialIds.indexOf(material)*379;
  const seed = sharedSeed + mask*199 + variant*1229;
  const frontierStone = material === "stone" && style.id === "mineral-frontier";
  const flecks = new Map(d.flecks.map(({x,y,sign})=>[y*SIZE+x,sign]));
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const distance = Math.min(x,y,PERIOD-x,PERIOD-y);
    // A fast, irregular fade brings alternative grain nearly to the boundary;
    // exact-edge samples remain shared, with no uniformly smooth interior moat.
    const inward = distance===0 ? 0 : clamp(distance/(1.15+.65*(1+grain(x,y,sharedSeed+901,9))),0,1);
    const nx = grain(x,y,seed,6)+grain(x,y,seed+401,13)*.35;
    const ny = grain(x,y,seed+29,6)+grain(x,y,seed+409,13)*.35;
    const warpX = inward*nx*(material === "bark" ? 2.8 : 4.5);
    const warpY = inward*ny*(frontierStone ? 2.2 : 4.1);
    const warpedX = clamp(x+warpX,0,PERIOD), warpedY = clamp(y+warpY,0,PERIOD);
    const ax = mod(Math.round(warpedX),PERIOD), ay = mod(Math.round(warpedY),PERIOD);
    const at = ay * PERIOD + ax;
    const field = cornerField(mask, warpedX, warpedY, style.id, material);
    const quietGrass = material === "grass";
    const wildSlate = material === "stone" && style.id === "wildwood";
    // Bark keeps only a very quiet corner wash: its vertical grain owns the read.
    const cornerAmplitude = material === "bark" ? .18 : quietGrass ? .33 : wildSlate ? .3 : frontierStone ? .28 : style.id === "wildwood" ? .79 : .72;
    let tone = (quietGrass ? 1.77 : wildSlate ? 1.82 : 2) + field * cornerAmplitude + d.mass[at];
    if (material === "bark") tone += (x % PERIOD > 11 && x % PERIOD < 20 ? -.12 : .05);
    if (style.id === "mineral-frontier" && material === "stone") tone += .1;
    // The shared periodic field has identical E/W and S/N samples. Alternative
    // fields fade to exact zero on edges, so compatible neighbors stay literal
    // pixel matches even when their interior alternatives differ.
    const amount = material === "dirt" ? .82 : material === "bark" ? .46 : quietGrass ? .68 : .58;
    const midX = material === "bark" ? 12 : frontierStone ? 5 : 9;
    const midY = material === "bark" ? 4 : frontierStone ? 12 : 9;
    const coarseX = material === "bark" ? 8 : frontierStone ? 3 : 4;
    const coarseY = material === "bark" ? 3 : frontierStone ? 9 : 4;
    tone += grain(x,y,sharedSeed,midX,midY)*(material === "bark" ? .28 : .36)
      + grain(x,y,sharedSeed+7,14,material === "bark" ? 6 : 14)*.17
      + inward*(grain(x,y,seed+211,coarseX,coarseY)*(quietGrass ? .48 : .36)
        + grain(x,y,seed+61,midX,midY)*amount + grain(x,y,seed+89,15)*.30);
    // Marks inherit the local corner patch's tone rather than stamping a fixed
    // bright icon over every variant. Their profile is the same on both edges.
    if (Number.isFinite(d.ink[at])) tone += d.ink[at] * (inward>.2 && grain(x,y,seed+113,8)<-.18 ? .2 : 1);
    let level = clamp(Math.round(tone), 0, 4);
    if (flecks.has(y*SIZE+x)) level = clamp(level+flecks.get(y*SIZE+x),0,4);
    pixels[y * SIZE + x] = ramp[level];
  }
  const doc = applyCommands(createDocument(`${style.name} ${material} corners ${mask} alt ${variant+1}`, SIZE, SIZE), [
    { op: "paste", layer: "base", x: 0, y: 0, width: SIZE, height: SIZE, pixels },
    { op: "palette", colors: style.colors[material] },
  ]);
  validateDocument(doc);
  const actual = composite(doc);
  const packed = Array.from({ length: SIZE * SIZE }, (_, i) => (actual[i * 4] * 16777216 + actual[i * 4 + 1] * 65536 + actual[i * 4 + 2] * 256 + actual[i * 4 + 3]) >>> 0);
  if (packed.some((p, i) => p !== pixels[i])) throw new Error("Workshop composite changed authored opaque pixels.");
  return packed;
}

// Shared with the comparison viewer: a coarse density field loosens the corner
// lattice at multi-block scale, while a separate hash selects interior alts.
const patchSeed = 38784;
function patchHash(x,y,salt=0) {
  let n = Math.imul(x+103,374761393)^Math.imul(y+211,668265263)^Math.imul(patchSeed+salt,1597334677);
  n = Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967296;
}
function patchCorner(x,y) {
  const px=x/3, py=y/3, ix=Math.floor(px), iy=Math.floor(py), u=smooth(px-ix), v=smooth(py-iy);
  const coarse = (patchHash(ix,iy,2917)*(1-u)+patchHash(ix+1,iy,2917)*u)*(1-v)
    +(patchHash(ix,iy+1,2917)*(1-u)+patchHash(ix+1,iy+1,2917)*u)*v;
  return .70*patchHash(x,y)+.30*coarse>=.5 ? 1 : 0;
}
const lattice = Array.from({length:7},(_,y)=>Array.from({length:11},(_,x)=>patchCorner(x,y)));
const patchMasks = Array.from({ length: 6 }, (_, y) => Array.from({ length: 10 }, (_, x) => lattice[y][x] + 2 * lattice[y][x + 1] + 4 * lattice[y + 1][x + 1] + 8 * lattice[y + 1][x]));
const patchVariants = Array.from({length:6},(_,y)=>Array.from({length:10},(_,x)=>Math.floor(patchHash(x,y,6073)*VARIANTS)));

function verifyTiles(tiles) {
  let compatiblePairs = 0, comparedEdgePixels = 0;
  const same = (a, b) => {
    comparedEdgePixels++;
    if (a !== b) throw new Error(`Compatible boundary differs: ${a.toString(16)} vs ${b.toString(16)}`);
  };
  for (let a = 0; a < tiles.length; a++) for (let b = 0; b < tiles.length; b++) {
    if (Boolean(a & 2) === Boolean(b & 1) && Boolean(a & 4) === Boolean(b & 8)) {
      compatiblePairs++;
      for (let p = 0; p < SIZE; p++) same(tiles[a][p * SIZE + SIZE - 1], tiles[b][p * SIZE]);
    }
    if (Boolean(a & 8) === Boolean(b & 1) && Boolean(a & 4) === Boolean(b & 2)) {
      compatiblePairs++;
      for (let p = 0; p < SIZE; p++) same(tiles[a][(SIZE - 1) * SIZE + p], tiles[b][p]);
    }
  }
  const unique = new Set(tiles.map(tile => tile.join(","))).size;
  if (unique !== 16*VARIANTS) throw new Error(`Expected ${16*VARIANTS} distinct tiles, found ${unique}.`);
  const opaque = tiles.reduce((n, tile) => n + tile.filter(pixel => (pixel & 255) === 255).length, 0);
  if (opaque !== 16 * VARIANTS * SIZE * SIZE) throw new Error("Transparent terrain pixels.");
  return { uniqueTiles: unique, opaquePixels: opaque, compatiblePairs, comparedEdgePixels };
}

async function exportAssembly(name, width, height, placements, palette, stem) {
  const doc = applyCommands(createDocument(name, width, height), [
    ...placements.map(({ x, y, pixels }) => ({ op: "paste", layer: "base", x, y, width: SIZE, height: SIZE, pixels })),
    { op: "palette", colors: palette },
  ]);
  validateDocument(doc);
  const bytes = composite(doc);
  for (let i = 3; i < bytes.length; i += 4) if (bytes[i] !== 255) throw new Error(`Transparent export ${stem}.`);
  await writeFile(`${stem}.pixel.json`, JSON.stringify(doc));
  await writeFile(`${stem}.png`, encodePng(doc));
}

await mkdir(outRoot, { recursive: true });
const data = { tileSize: SIZE, variantsPerMask:VARIANTS, symbols, cornerOrder: ["NW", "NE", "SE", "SW"], cornerBits: [1, 2, 4, 8], sheetColumns: 8, patchSeed, patchCorners: lattice, patchMasks, patchVariants, styles: [] };
const report = { authoringEngine: "Pixel Workshop local shared engine, commit 718f17700084a8c356e3babe6b17b7774a570c1e", purpose: "Original review-only material proposals; no runtime integration", tileSize: SIZE, variantsPerMask:VARIANTS, patchSeed, cornerOrder: data.cornerOrder, cornerBits: data.cornerBits, latticeTileCoverage: [...new Set(patchMasks.flat())].sort((a,b) => a-b), sets: [] };
for (const style of styles) {
  const styleDir = join(outRoot, style.id);
  await mkdir(styleDir, { recursive: true });
  const palette = [...new Set(Object.values(style.colors).flat())];
  const paletteMap = new Map(palette.map((color, i) => [rgba(color), symbols[i]]));
  const record = { id: style.id, name: style.name, description: style.description, palette, materials: {} };
  for (const material of materialIds) {
    const marks = style.id === "sunwashed" ? sunwashed(material) : style.id === "wildwood" ? wildwood(material) : mineralFrontier(material);
    const tiles = Array.from({ length: 16*VARIANTS }, (_, index) => {
      const mask=index%16, variant=Math.floor(index/16);
      return makeTile(style,material,mask,variant,composeInterior(style,material,mask,variant,marks));
    });
    const verified = verifyTiles(tiles);
    const sheetStem = join(styleDir, `${material}-sheet`), patchStem = join(styleDir, `${material}-patch`);
    await exportAssembly(`${style.name} ${material} — 16 corners × 4 alternatives`, 256, 256, tiles.map((pixels, index) => ({ x: index % 8 * SIZE, y: Math.floor(index / 8) * SIZE, pixels })), palette, sheetStem);
    await exportAssembly(`${style.name} ${material} — shared corner patch`, 320, 192, patchMasks.flatMap((row, y) => row.map((mask, x) => ({ x: x * SIZE, y: y * SIZE, pixels: tiles[mask+patchVariants[y][x]*16] }))), palette, patchStem);
    record.materials[material] = tiles.map(tile => Array.from({ length: SIZE }, (_, y) => tile.slice(y * SIZE, (y + 1) * SIZE).map(pixel => paletteMap.get(pixel)).join("")));
    report.sets.push({ style: style.id, material, ...verified, sheet: `${style.id}/${material}-sheet`, patch: `${style.id}/${material}-patch` });
    console.log(`${style.name} ${material}: ${16*VARIANTS} unique opaque tiles; ${verified.comparedEdgePixels} compatible edge pixels matched. ${patchStem}.png`);
  }
  data.styles.push(record);
}
const json = JSON.stringify(data);
if (Buffer.byteLength(json) > 900_000) throw new Error("Indexed review data exceeded 900KB.");
report.totalTiles = report.sets.reduce((n, set) => n + set.uniqueTiles, 0);
report.totalOpaqueTilePixels = report.sets.reduce((n, set) => n + set.opaquePixels, 0);
report.totalCompatiblePairs = report.sets.reduce((n, set) => n + set.compatiblePairs, 0);
report.totalComparedEdgePixels = report.sets.reduce((n, set) => n + set.comparedEdgePixels, 0);
report.nativeDocumentsValidated = report.totalTiles + report.sets.length * 2;
report.exportedNativeDocuments = report.sets.length * 2;
report.exportedPngs = report.sets.length * 2;
report.exportedOpaquePixels = report.sets.length * (256 * 256 + 320 * 192);
report.indexedJsonBytes = Buffer.byteLength(json);
await writeFile(join(outRoot, "studies.json"), json);
await writeFile(join(outRoot, "verification.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`Exported ${report.totalTiles} original tiles; ${report.nativeDocumentsValidated} native documents validated; studies.json ${report.indexedJsonBytes} bytes.`);
