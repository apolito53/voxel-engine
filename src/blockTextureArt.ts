import terrainArt from "./assets/terrain-art.json";
import {
  BLOCK_TEXTURE_ATLAS_COLUMNS,
  BLOCK_TEXTURE_ATLAS_ROWS,
  BLOCK_TEXTURE_TILE,
  BLOCK_TEXTURE_TILE_SIZE_PX,
  BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE
} from "./blockTextureTiles";

// Each authored pixel is one palette index. Keep this order stable so the
// compact source can be edited without a binary image or runtime image loader.
export const BLOCK_TEXTURE_ART_PALETTE_SYMBOLS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!$%&()*+,-./:;<=>?@[]^_{|}~";

type PixelRows = readonly string[];

export type BlockTextureArtSource = {
  readonly tileSize: number;
  readonly palette: readonly string[];
  readonly tiles: Readonly<Record<string, PixelRows | readonly PixelRows[]>>;
};

export type BlockTextureAtlasPixels = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
};

export function decodeBlockTextureArt(source: BlockTextureArtSource = terrainArt): BlockTextureAtlasPixels {
  if (source.tileSize !== BLOCK_TEXTURE_TILE_SIZE_PX) {
    throw new Error(`Block texture art must use ${BLOCK_TEXTURE_TILE_SIZE_PX}px tiles.`);
  }
  if (source.palette.length < 1 || source.palette.length > BLOCK_TEXTURE_ART_PALETTE_SYMBOLS.length) {
    throw new Error("Block texture art palette has an invalid size.");
  }
  const palette = source.palette.map((color) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      throw new Error(`Block texture art palette requires opaque #RRGGBB colors: ${color}`);
    }
    const rgb = Number.parseInt(color.slice(1), 16);
    return [(rgb >>> 16) & 0xff, (rgb >>> 8) & 0xff, rgb & 0xff] as const;
  });
  for (const tileName of Object.keys(source.tiles)) {
    if (!Object.hasOwn(BLOCK_TEXTURE_TILE, tileName)) {
      throw new Error(`Block texture art contains an unknown tile: ${tileName}`);
    }
  }

  const width = BLOCK_TEXTURE_ATLAS_COLUMNS * source.tileSize;
  const height = BLOCK_TEXTURE_ATLAS_ROWS * source.tileSize;
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [tileName, baseTileId] of Object.entries(BLOCK_TEXTURE_TILE)) {
    const tile = source.tiles[tileName];
    if (!Array.isArray(tile)) {
      throw new Error(`Block texture art is missing tile: ${tileName}`);
    }
    // A single object-centered tile may be reused; connected material families
    // author every mask + alternative * 16 slot in the same image orientation.
    const variants: readonly PixelRows[] = typeof tile[0] === "string"
      ? Array.from({ length: BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE }, () => tile as PixelRows)
      : tile as readonly PixelRows[];
    if (variants.length !== BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE) {
      throw new Error(`Block texture art ${tileName} requires ${BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE} variants.`);
    }
    for (let variant = 0; variant < variants.length; variant += 1) {
      const rows = variants[variant];
      if (!Array.isArray(rows) || rows.length !== source.tileSize) {
        throw new Error(`Block texture art ${tileName}[${variant}] has an invalid height.`);
      }
      const tileId = baseTileId * BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE + variant;
      const originX: number = (tileId % BLOCK_TEXTURE_ATLAS_COLUMNS) * source.tileSize;
      const originY: number = Math.floor(tileId / BLOCK_TEXTURE_ATLAS_COLUMNS) * source.tileSize;
      for (let y = 0; y < source.tileSize; y += 1) {
        const row = rows[y];
        if (typeof row !== "string" || row.length !== source.tileSize) {
          throw new Error(`Block texture art ${tileName}[${variant}] row ${y} has an invalid width.`);
        }
        for (let x = 0; x < source.tileSize; x += 1) {
          const paletteIndex = BLOCK_TEXTURE_ART_PALETTE_SYMBOLS.indexOf(row[x]);
          const color = palette[paletteIndex];
          if (!color) {
            throw new Error(`Block texture art ${tileName}[${variant}] pixel ${x},${y} has an invalid palette index.`);
          }
          const offset = ((originY + y) * width + originX + x) * 4;
          data[offset] = color[0];
          data[offset + 1] = color[1];
          data[offset + 2] = color[2];
          data[offset + 3] = 255;
        }
      }
    }
  }
  return { width, height, data };
}
