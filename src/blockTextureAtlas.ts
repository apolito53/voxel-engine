import * as THREE from "three";
import {
  BLOCK_TEXTURE_ATLAS_COLUMNS,
  BLOCK_TEXTURE_ATLAS_ROWS,
  BLOCK_TEXTURE_TILE,
  BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE,
  BLOCK_TEXTURE_TILE_SIZE_PX
} from "./blockTextureTiles";

type ShaderWithUniforms = Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0];
type TilePainter = (ctx: CanvasRenderingContext2D, variant: number) => void;

const ATLAS_INSET_UV = 0.5 / BLOCK_TEXTURE_TILE_SIZE_PX;

export function createWorldBlockMaterial(): THREE.MeshStandardMaterial {
  const atlasTexture = createBlockTextureAtlas();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: atlasTexture,
    roughness: 0.92,
    metalness: 0
  });

  material.onBeforeCompile = (shader: ShaderWithUniforms) => {
    shader.uniforms.blockTextureAtlasGrid = {
      value: new THREE.Vector2(BLOCK_TEXTURE_ATLAS_COLUMNS, BLOCK_TEXTURE_ATLAS_ROWS)
    };
    shader.uniforms.blockTextureAtlasInset = {
      value: new THREE.Vector2(ATLAS_INSET_UV / BLOCK_TEXTURE_ATLAS_COLUMNS, ATLAS_INSET_UV / BLOCK_TEXTURE_ATLAS_ROWS)
    };

    // The tile id is per vertex so worker-built chunk geometry can choose grass
    // tops, dirt undersides, wood end grain, and side textures without splitting
    // the world into separate materials or draw-call buckets.
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float blockTextureTile;\nvarying float vBlockTextureTile;"
      )
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvBlockTextureTile = blockTextureTile;"
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec2 blockTextureAtlasGrid;\nuniform vec2 blockTextureAtlasInset;\nvarying float vBlockTextureTile;"
      )
      .replace(
        "#include <map_fragment>",
        [
          "#ifdef USE_MAP",
          "  float blockTextureTileIndex = floor(vBlockTextureTile + 0.5);",
          "  float blockTextureColumn = mod(blockTextureTileIndex, blockTextureAtlasGrid.x);",
          "  float blockTextureRow = floor(blockTextureTileIndex / blockTextureAtlasGrid.x);",
          "  vec2 blockTextureOrigin = vec2(blockTextureColumn, blockTextureRow) / blockTextureAtlasGrid;",
          "  vec2 blockTextureScale = (vec2(1.0) / blockTextureAtlasGrid) - blockTextureAtlasInset * 2.0;",
          "  vec2 blockTextureUv = blockTextureOrigin + blockTextureAtlasInset + fract(vMapUv) * blockTextureScale;",
          "  vec4 sampledDiffuseColor = texture2D(map, blockTextureUv);",
          "  diffuseColor *= sampledDiffuseColor;",
          "#endif"
        ].join("\n")
      );
  };

  material.customProgramCacheKey = () => "voxel-block-texture-atlas-v1";
  return material;
}

export function disposeWorldBlockMaterial(material: THREE.MeshStandardMaterial): void {
  material.map?.dispose();
  material.dispose();
}

export function createBlockTextureAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = BLOCK_TEXTURE_ATLAS_COLUMNS * BLOCK_TEXTURE_TILE_SIZE_PX;
  canvas.height = BLOCK_TEXTURE_ATLAS_ROWS * BLOCK_TEXTURE_TILE_SIZE_PX;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Block texture atlas canvas could not create a 2D context.");
  }

  ctx.imageSmoothingEnabled = false;
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.grassTop, drawGrassTop);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.grassSide, drawGrassSide);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.dirt, drawDirt);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.stone, drawStone);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.sand, drawSand);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.ember, drawEmber);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.rubble, drawRubble);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.woodSide, drawWoodSide);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.woodTop, drawWoodTop);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.leaves, drawLeaves);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function paintTileVariants(ctx: CanvasRenderingContext2D, baseTileId: number, paint: TilePainter): void {
  for (let variant = 0; variant < BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE; variant += 1) {
    const tileId = baseTileId * BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE + variant;
    ctx.save();
    ctx.translate(tileId * BLOCK_TEXTURE_TILE_SIZE_PX, 0);
    paint(ctx, variant);
    ctx.restore();
  }
}

function drawGrassTop(ctx: CanvasRenderingContext2D, variant: number): void {
  // Grass is the visual baseline for most terrain, so keep the atlas color
  // green enough to read as grass instead of relying on pale texture paper plus
  // vertex tint alone.
  fill(ctx, "#c6e4a0");
  drawSpeckles(ctx, 0x11a1 + variant * 0x101, 30 + variant * 3, "rgba(44, 105, 38, 0.30)", 1, 2);
  drawShortStrokes(ctx, 0x11a2 + variant * 0x103, 16 + variant * 2, "rgba(28, 86, 35, 0.24)", 1, 3);
}

function drawGrassSide(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#bfd59a");
  fillRect(ctx, 0, 9 + (variant % 2), 16, 7, "rgba(70, 50, 33, 0.32)");
  drawVerticalStrokes(ctx, 0x21b1 + variant * 0x101, 14 + variant * 2, "rgba(31, 95, 36, 0.30)", 1, 8);
  drawSpeckles(ctx, 0x21b2 + variant * 0x103, 12 + variant, "rgba(58, 40, 24, 0.24)", 1, 1);
}

function drawDirt(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#f4f0e8");
  drawSpeckles(ctx, 0x31c1 + variant * 0x101, 42 + variant * 3, "rgba(58, 36, 20, 0.32)", 1, 2);
  drawSpeckles(ctx, 0x31c2 + variant * 0x103, 18 + variant * 2, "rgba(118, 79, 43, 0.20)", 1, 1);
}

function drawStone(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#f2f3f3");
  drawSpeckles(ctx, 0x41d1 + variant * 0x101, 20 + variant * 2, "rgba(51, 57, 61, 0.22)", 1, 2);
  strokePath(ctx, "rgba(40, 45, 48, 0.30)", [[1, 4 + variant], [5, 3], [8, 6 + (variant % 2)], [14, 5]]);
  strokePath(ctx, "rgba(40, 45, 48, 0.24)", [[3, 12 - variant], [6, 9], [11, 10], [15, 8 + (variant % 2)]]);
}

function drawSand(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#fff8df");
  drawSpeckles(ctx, 0x51e1 + variant * 0x101, 38 + variant * 3, "rgba(125, 101, 50, 0.22)", 1, 1);
  strokePath(ctx, "rgba(142, 118, 64, 0.20)", [[1, 3 + variant], [5, 2 + (variant % 2)], [9, 4], [14, 3]]);
  strokePath(ctx, "rgba(142, 118, 64, 0.18)", [[0, 11], [4, 12 - (variant % 2)], [10, 11], [15, 12]]);
}

function drawEmber(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#fff2ee");
  fillRect(ctx, 2 + (variant % 2), 3, 1, 8, "rgba(45, 12, 8, 0.44)");
  fillRect(ctx, 7 + variant, 1, 2, 11, "rgba(45, 12, 8, 0.32)");
  fillRect(ctx, 12, 6 + variant, 1, 7, "rgba(45, 12, 8, 0.38)");
  drawSpeckles(ctx, 0x61f1 + variant * 0x101, 20 + variant * 2, "rgba(255, 196, 91, 0.34)", 1, 2);
}

function drawRubble(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#f0eee8");
  drawChunk(ctx, 1 + (variant % 2), 2, 5, 3, "rgba(63, 59, 51, 0.24)");
  drawChunk(ctx, 8, 1 + variant, 6, 4, "rgba(63, 59, 51, 0.20)");
  drawChunk(ctx, 3, 8 + (variant % 2), 7, 5, "rgba(63, 59, 51, 0.27)");
  drawChunk(ctx, 11 - (variant % 2), 10, 4, 4, "rgba(63, 59, 51, 0.22)");
}

function drawWoodSide(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#f6eee2");
  drawVerticalStrokes(ctx, 0x71a1 + variant * 0x101, 14 + variant * 2, "rgba(68, 37, 17, 0.32)", 1, 15);
  strokePath(ctx, "rgba(84, 44, 18, 0.26)", [[3 + (variant % 2), 0], [4, 4], [3, 8], [5, 15]]);
  strokePath(ctx, "rgba(84, 44, 18, 0.22)", [[11, 0], [10 + (variant % 2), 5], [12, 10], [11, 15]]);
}

function drawWoodTop(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#f8efe0");
  ctx.strokeStyle = "rgba(83, 44, 20, 0.28)";
  ctx.lineWidth = 1;
  for (let radius = 3; radius <= 7; radius += 2) {
    ctx.beginPath();
    ctx.ellipse(8, 8, radius, Math.max(2, radius - 1), 0.25 + variant * 0.13, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawSpeckles(ctx, 0x81b1 + variant * 0x101, 10 + variant, "rgba(78, 40, 18, 0.18)", 1, 1);
}

function drawLeaves(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#f2fff0");
  drawSpeckles(ctx, 0x91c1 + variant * 0x101, 36 + variant * 3, "rgba(30, 96, 35, 0.27)", 1, 3);
  drawShortStrokes(ctx, 0x91c2 + variant * 0x103, 20 + variant * 2, "rgba(25, 74, 32, 0.23)", 1, 2);
}

function fill(ctx: CanvasRenderingContext2D, color: string): void {
  fillRect(ctx, 0, 0, BLOCK_TEXTURE_TILE_SIZE_PX, BLOCK_TEXTURE_TILE_SIZE_PX, color);
}

function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function drawSpeckles(
  ctx: CanvasRenderingContext2D,
  seed: number,
  count: number,
  color: string,
  minSize: number,
  maxSize: number
): void {
  const random = createTileRandom(seed);
  ctx.fillStyle = color;
  for (let index = 0; index < count; index += 1) {
    const x = Math.floor(random() * BLOCK_TEXTURE_TILE_SIZE_PX);
    const y = Math.floor(random() * BLOCK_TEXTURE_TILE_SIZE_PX);
    const size = minSize + Math.floor(random() * (maxSize - minSize + 1));
    ctx.fillRect(x, y, size, size);
  }
}

function drawShortStrokes(
  ctx: CanvasRenderingContext2D,
  seed: number,
  count: number,
  color: string,
  minLength: number,
  maxLength: number
): void {
  const random = createTileRandom(seed);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let index = 0; index < count; index += 1) {
    const x = Math.floor(random() * BLOCK_TEXTURE_TILE_SIZE_PX);
    const y = Math.floor(random() * BLOCK_TEXTURE_TILE_SIZE_PX);
    const length = minLength + Math.floor(random() * (maxLength - minLength + 1));
    strokePath(ctx, color, [[x, y], [Math.min(15, x + length), Math.max(0, y - 1)]]);
  }
}

function drawVerticalStrokes(
  ctx: CanvasRenderingContext2D,
  seed: number,
  count: number,
  color: string,
  minLength: number,
  maxLength: number
): void {
  const random = createTileRandom(seed);
  for (let index = 0; index < count; index += 1) {
    const x = Math.floor(random() * BLOCK_TEXTURE_TILE_SIZE_PX);
    const y = Math.floor(random() * BLOCK_TEXTURE_TILE_SIZE_PX);
    const length = minLength + Math.floor(random() * (maxLength - minLength + 1));
    strokePath(ctx, color, [[x, y], [x, Math.min(15, y + length)]]);
  }
}

function drawChunk(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y + 1);
  ctx.lineTo(x + width - 1, y + height);
  ctx.lineTo(x + 1, y + height - 1);
  ctx.closePath();
  ctx.fill();
}

function strokePath(ctx: CanvasRenderingContext2D, color: string, points: readonly (readonly [number, number])[]): void {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index][0], points[index][1]);
  }
  ctx.stroke();
}

function createTileRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822519) >>> 0;
    state = Math.imul(state ^ (state >>> 13), 3266489917) >>> 0;
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}
