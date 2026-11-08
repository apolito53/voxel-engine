// Export a saved Workshop sheet after editing it; do not rerun the authoring
// recipe when preserving hand edits. No Workshop dependency ships in the game.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const symbols = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!$%&()*+,-./:;<=>?@[]^_{|}~";
const keys = ["grassTop", "grassSide", "dirt", "stone", "sand", "ember", "rubble", "woodSide", "woodTop", "leaves", "mossTop", "mossSide", "bush", "lamp"];
const tileSize = 32;

export async function exportTerrainArt(workshopRoot, source = "assets/terrain/moss-and-ember.pixel.json") {
  const { validateDocument, composite } = await import(pathToFileURL(resolve(workshopRoot, "lib/pixels.ts")));
  const { encodePng, encodeRgbaPng } = await import(pathToFileURL(resolve(workshopRoot, "lib/png.ts")));
  const doc = validateDocument(JSON.parse(await readFile(source, "utf8")));
  if (doc.width !== 256 || doc.height !== 224 || doc.animation) {
    throw new Error("Terrain art must be a static 256×224 Workshop sheet (8 columns × 7 rows of 32px tiles).");
  }
  const rgba = composite(doc);
  const palette = [...new Set(doc.palette.map((color) => color.slice(0, 7).toLowerCase()))];
  const tiles = {};
  const atlas = new Uint8Array(56 * tileSize * tileSize * 4);
  for (const [base, key] of keys.entries()) {
    tiles[key] = [];
    for (let variant = 0; variant < 4; variant++) {
      const index = base * 4 + variant;
      const rows = [];
      for (let y = 0; y < tileSize; y++) {
        let row = "";
        for (let x = 0; x < tileSize; x++) {
          const offset = ((Math.floor(index / 8) * tileSize + y) * doc.width + index % 8 * tileSize + x) * 4;
          if (rgba[offset + 3] !== 255) throw new Error(`Terrain tile ${key}[${variant}] has a transparent pixel at ${x},${y}.`);
          const color = "#" + Array.from(rgba.subarray(offset, offset + 3), (c) => c.toString(16).padStart(2, "0")).join("");
          let colorIndex = palette.indexOf(color);
          if (colorIndex < 0) { colorIndex = palette.length; palette.push(color); }
          if (palette.length > symbols.length) throw new Error(`Terrain art supports at most ${symbols.length} palette colors.`);
          row += symbols[colorIndex];
          atlas.set(rgba.subarray(offset, offset + 4), (y * 56 * tileSize + index * tileSize + x) * 4);
        }
        rows.push(row);
      }
      tiles[key].push(rows);
    }
  }
  await mkdir("src/assets", { recursive: true });
  await writeFile("src/assets/terrain-art.json", JSON.stringify({ tileSize, palette, tiles }) + "\n");
  await writeFile("src/assets/terrain-atlas.png", encodeRgbaPng(atlas, 56 * tileSize, tileSize));
  await writeFile("assets/terrain/moss-and-ember.png", encodePng(doc));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Usage: node scripts/export_terrain_art.mjs <path-to-pixel-workshop> [edited.pixel.json]");
  await exportTerrainArt(process.argv[2], process.argv[3]);
  console.log("Exported Workshop terrain pixels and matching UI atlas.");
}
