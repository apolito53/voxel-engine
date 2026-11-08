// Original Moss & Ember material set, drawn with Pixel Workshop's shared engine.
// Usage: node scripts/author_terrain_art.mjs <path-to-pixel-workshop>
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { exportTerrainArt } from "./export_terrain_art.mjs";

const workshopRoot = process.argv[2];
if (!workshopRoot) throw new Error("Supply a Pixel Workshop checkout (see docs/terrain-art.md).");
const { createDocument, applyCommands, composite } = await import(pathToFileURL(resolve(workshopRoot, "lib/pixels.ts")));
const size = 32;
const colors = {
  grass: ["#425f39", "#53713f", "#658447", "#7b9853", "#96ad65", "#b2c47e"],
  dirt: ["#594236", "#6d503d", "#826248", "#997851", "#b19066"],
  stone: ["#566366", "#687572", "#7e8982", "#949c90", "#acb2a1"],
  sand: ["#b69b6b", "#c7ad7a", "#d9c18e", "#e9d6a9", "#f2e3be"],
  ember: ["#332e33", "#4a3a3e", "#6e4740", "#ad5e3d", "#e99347", "#f9cd79"],
  wood: ["#493c32", "#614735", "#7b563c", "#966e49", "#b28a5a", "#cda56f"],
  leaves: ["#2b4b3e", "#385e46", "#4c744e", "#648a54", "#809f61", "#a2b87c"],
  moss: ["#3c6143", "#50794a", "#6a9252", "#88aa60", "#adc579"],
  lamp: ["#292e31", "#4b5050", "#897247", "#c1995c", "#e6b974", "#f4d99a", "#fff0c3"]
};
const palette = [...new Set(Object.values(colors).flat())];
const rgba = (color) => (Number.parseInt(color.slice(1), 16) * 256 + 255) >>> 0;
const mod = (n, m) => ((n % m) + m) % m;
function hash(x, y, seed) {
  let value = Math.imul(x + 103, 374761393) ^ Math.imul(y + 211, 668265263) ^ Math.imul(seed, 1597334677);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
// Periodic soft fields give quiet connected pixel clusters and matching borders.
function field(x, y, seed, cell = 8) {
  const count = size / cell;
  const px = mod(x, size) / cell;
  const py = mod(y, size) / cell;
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const sample = (a, b) => hash(mod(a, count), mod(b, count), seed);
  return (sample(ix, iy) * (1 - u) + sample(ix + 1, iy) * u) * (1 - v)
    + (sample(ix, iy + 1) * (1 - u) + sample(ix + 1, iy + 1) * u) * v;
}
function makeTile(key, variant) {
  const seed = 107 + variant * 137 + keys.indexOf(key) * 311;
  const pixels = new Array(size * size);
  const put = (x, y, color) => { pixels[mod(y, size) * size + mod(x, size)] = rgba(color); };
  const tone = (ramp, value) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(value)))];
  const rect = (x, y, w, h, color) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(x + dx, y + dy, color);
  };
  const line = (x, y, x2, y2, color) => {
    const steps = Math.max(Math.abs(x2 - x), Math.abs(y2 - y));
    for (let i = 0; i <= steps; i++) put(Math.round(x + (x2 - x) * i / Math.max(1, steps)), Math.round(y + (y2 - y) * i / Math.max(1, steps)), color);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const broad = field(x, y, seed), detail = field(x, y, seed + 43, 4);
    let color;
    if (key === "grassTop") color = tone(colors.grass, 1.1 + broad * 3.2 + detail * 0.45);
    else if (key === "mossTop") color = tone(colors.moss, 0.8 + broad * 3.6 + detail * 0.4);
    else if (key === "grassSide" || key === "mossSide") {
      const moss = key === "mossSide";
      const edge = (moss ? 10 : 6) + Math.floor(field(x, 0, seed + 67, 4) * (moss ? 10 : 7));
      color = y < edge ? tone(moss ? colors.moss : colors.grass, 1 + broad * 2.7)
        : tone(colors.dirt, 0.9 + broad * 2.6 + detail * 0.35);
      if (y === edge) color = colors.dirt[0];
    } else if (key === "dirt") color = tone(colors.dirt, 0.9 + broad * 2.9 + detail * 0.4);
    else if (key === "sand") {
      const ripple = Math.sin((y + field(x, y, seed + 7) * 6) * Math.PI / 8);
      color = tone(colors.sand, 1.4 + broad * 1.6 + ripple * 0.45);
    } else if (key === "stone") {
      const strata = field(x + Math.floor(y / 8) * 2, Math.floor(y / 3) * 3, seed, 8);
      color = tone(colors.stone, 0.8 + strata * 2.7 + detail * 0.45);
    } else if (key === "rubble") {
      const stone = field(x, y, seed + 79, 4);
      color = stone > 0.38 ? tone(colors.stone, 0.6 + broad * 2.4) : tone(colors.dirt, broad * 2.5);
    } else if (key === "woodSide") {
      const grain = field(x, Math.floor(y / 8) * 2, seed, 4);
      color = tone(colors.wood, 0.8 + grain * 3.1 + broad * 0.4);
    } else if (key === "woodTop") {
      const dx = x - 14 - variant % 3, dy = y - 15;
      const radius = Math.sqrt(dx * dx * 0.8 + dy * dy);
      const ring = mod(Math.floor(radius + broad * 1.2), 5);
      color = colors.wood[ring === 0 ? 2 : ring === 1 ? 4 : 3];
    } else if (key === "leaves" || key === "bush") {
      color = tone(colors.leaves, (key === "bush" ? 0.2 : 0.7) + broad * 2.7);
    } else if (key === "ember") color = tone(colors.ember, broad * 2.7);
    else color = colors.lamp[0];
    put(x, y, color);
  }
  if (["grassTop", "mossTop", "dirt", "sand", "rubble"].includes(key)) {
    const ramp = key === "grassTop" ? colors.grass : key === "mossTop" ? colors.moss : key === "sand" ? colors.sand : key === "rubble" ? colors.stone : colors.dirt;
    const count = key === "grassTop" ? 12 : 8;
    for (let i = 0; i < count; i++) {
      const x = Math.floor(hash(i, 1, seed) * 32), y = Math.floor(hash(i, 2, seed) * 32);
      const color = ramp[key === "dirt" || key === "rubble" ? 3 : ramp.length - 2];
      rect(x, y, 2 + i % 2, 1, color);
      if (key === "grassTop" || key === "mossTop") put(x + 1, y - 1, ramp[2]);
    }
  }
  if (key === "stone") {
    // Broad mineral seams, interrupted before they become a block-grid outline.
    for (let i = 0; i < 2; i++) {
      const y = 6 + i * 15 + variant % 3;
      line(2 + variant * 2, y, 10 + variant, y + 1, colors.stone[1]);
      line(10 + variant, y + 1, 15 + variant, y - 2, colors.stone[1]);
      line(20 - variant, y + 4, 26, y + 3, colors.stone[3]);
    }
  }
  if (key === "woodSide") {
    for (let i = 0; i < 5; i++) {
      const x = i * 7 + variant;
      line(x, 0, x + 1, 10, colors.wood[1]);
      line(x + 1, 10, x - 1, 21, colors.wood[1]);
      line(x - 1, 21, x, 31, colors.wood[1]);
      line(x + 2, 2, x + 3, 11, colors.wood[3]);
    }
    const cx = 11 + variant * 3, cy = 15 + variant;
    for (let y = -4; y <= 4; y++) for (let x = -2; x <= 2; x++) {
      const radius = x * x / 5 + y * y / 18;
      if (radius < 1.15 && radius > 0.55) put(cx + x, cy + y, colors.wood[1]);
    }
  }
  if (key === "woodTop") {
    line(15, 15, 18, 18, colors.wood[2]);
    line(27, 8 + variant, 22, 11 + variant, colors.wood[2]);
  }
  if (key === "leaves" || key === "bush") {
    for (let i = 0; i < 36; i++) {
      const x = Math.floor(hash(i, 9, seed) * 32), y = Math.floor(hash(i, 10, seed) * 32);
      const level = (i % 3) + (key === "leaves" ? 2 : 1);
      rect(x + 1, y, 3, 1, colors.leaves[level]);
      rect(x, y + 1, 5, 1, colors.leaves[level]);
      rect(x + 1, y + 2, 3, 1, colors.leaves[Math.max(0, level - 1)]);
      if (i % 6 === 0) rect(x + 1, y, 2, 1, colors.leaves[level + 1]);
    }
  }
  if (key === "ember") {
    for (let y = 0; y < 32; y++) {
      const x = mod(5 + Math.floor(y / 4) + variant * 7, 32);
      put(x, y, colors.ember[3]);
      if (y % 5 < 3) put(x + 1, y, colors.ember[4]);
      if (y % 13 === 0) put(x + 1, y, colors.ember[5]);
    }
    line(19, 13, 25, 17, colors.ember[3]);
    line(25, 17, 29, 14, colors.ember[4]);
  }
  if (key === "lamp") {
    rect(2, 2, 28, 28, colors.lamp[2]);
    rect(3, 3, 26, 26, colors.lamp[3]);
    rect(5, 5, 22, 22, colors.lamp[0]);
    rect(7, 7, 18, 18, colors.lamp[4]);
    rect(9, 8, 14, 16, colors.lamp[5]);
    rect(11, 9, 10, 13, colors.lamp[6]);
    for (const x of [4, 27]) for (const y of [4, 27]) put(x, y, colors.lamp[5]);
    rect(6, 14, 20, 2, colors.lamp[2]);
    rect(14, 6, 2, 20, colors.lamp[2]);
    rect(7, 16, 2, 7, colors.lamp[3]);
    rect(23, 8, 1, 6, colors.lamp[5]);
    put(10 + variant, 11, colors.lamp[5]);
  }
  // Use the same atomic drawing operation as Workshop's MCP paint tool.
  const doc = applyCommands(createDocument(`${key} ${variant + 1}`, size, size), [
    { op: "paste", layer: "base", x: 0, y: 0, width: size, height: size, pixels }
  ]);
  return { doc, pixels: Array.from(composite(doc)).reduce((out, channel, index, bytes) => {
    if (index % 4 === 0) out.push((channel * 16777216 + bytes[index + 1] * 65536 + bytes[index + 2] * 256 + bytes[index + 3]) >>> 0);
    return out;
  }, []) };
}
const keys = ["grassTop", "grassSide", "dirt", "stone", "sand", "ember", "rubble", "woodSide", "woodTop", "leaves", "mossTop", "mossSide", "bush", "lamp"];
const sheetCommands = [];
for (const [keyIndex, key] of keys.entries()) {
  for (let variant = 0; variant < 4; variant++) {
    const { pixels } = makeTile(key, variant);
    const index = keyIndex * 4 + variant;
    const command = { op: "paste", layer: "base", width: size, height: size, pixels };
    sheetCommands.push({ ...command, x: index % 8 * size, y: Math.floor(index / 8) * size });
  }
}
const sheet = applyCommands(createDocument("Moss & Ember — terrain materials", 256, 224), sheetCommands);
sheet.palette = palette;
await mkdir("assets/terrain", { recursive: true });
await writeFile("assets/terrain/moss-and-ember.pixel.json", JSON.stringify(sheet));
await exportTerrainArt(workshopRoot);
console.log(`Authored ${keys.length * 4} tiles, ${palette.length} colors, with Pixel Workshop.`);
