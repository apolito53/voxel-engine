import * as THREE from "three";
import { BLOCKS } from "./blocks";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./chunk";
import { requireCanvasContext } from "./dom";
import type { VoxelWorld } from "./world";

const MINIMAP_SIZE = 128;
const MINIMAP_TEXTURE_SIZE = 64;
const MINIMAP_RANGE = 96;
const MINIMAP_WORLD_PER_PIXEL = MINIMAP_RANGE / MINIMAP_SIZE;
const MINIMAP_WORLD_PER_TEXEL = MINIMAP_RANGE / MINIMAP_TEXTURE_SIZE;

type MinimapOptions = {
  readonly canvas: HTMLCanvasElement;
  readonly camera: THREE.PerspectiveCamera;
  readonly getWorld: () => VoxelWorld;
  readonly getInterval: () => number;
  readonly getRowsPerFrame: () => number;
};

export class MinimapRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly getWorld: () => VoxelWorld;
  private readonly getInterval: () => number;
  private readonly getRowsPerFrame: () => number;
  private readonly terrainCanvas = document.createElement("canvas");
  private readonly terrainContext: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly direction = new THREE.Vector3();
  private accumulator = Infinity;
  private refreshRow = 0;
  private refreshOriginX = 0;
  private refreshOriginZ = 0;
  private displayOriginX = 0;
  private displayOriginZ = 0;
  private sliceMaxMs = 0;
  private hasTerrain = false;
  private lastSliceMs = 0;

  constructor(options: MinimapOptions) {
    this.canvas = options.canvas;
    this.context = requireCanvasContext(options.canvas);
    this.camera = options.camera;
    this.getWorld = options.getWorld;
    this.getInterval = options.getInterval;
    this.getRowsPerFrame = options.getRowsPerFrame;
    this.terrainCanvas.width = MINIMAP_TEXTURE_SIZE;
    this.terrainCanvas.height = MINIMAP_TEXTURE_SIZE;
    this.terrainContext = requireCanvasContext(this.terrainCanvas);
    this.image = this.terrainContext.createImageData(
      MINIMAP_TEXTURE_SIZE,
      MINIMAP_TEXTURE_SIZE
    );
    this.context.imageSmoothingEnabled = false;
    this.reset();
  }

  get lastUpdateMs(): number {
    return this.lastSliceMs;
  }

  reset(): void {
    this.accumulator = Infinity;
    this.hasTerrain = false;
    this.refreshRow = MINIMAP_TEXTURE_SIZE;
    this.refreshOriginX = this.camera.position.x;
    this.refreshOriginZ = this.camera.position.z;
    this.displayOriginX = this.camera.position.x;
    this.displayOriginZ = this.camera.position.z;
    this.sliceMaxMs = 0;
  }

  update(delta: number): void {
    this.accumulator += delta;
    if (
      this.refreshRow >= MINIMAP_TEXTURE_SIZE &&
      this.accumulator >= this.getInterval()
    ) {
      this.startRefresh();
    }

    if (this.refreshRow < MINIMAP_TEXTURE_SIZE) {
      this.updateTerrainSlice();
    }

    this.render();
  }

  private startRefresh(): void {
    this.accumulator = 0;
    this.refreshRow = 0;
    this.refreshOriginX = this.camera.position.x;
    this.refreshOriginZ = this.camera.position.z;
    this.sliceMaxMs = 0;
  }

  private updateTerrainSlice(): void {
    const world = this.getWorld();
    const startedAt = performance.now();
    const data = this.image.data;
    const half = MINIMAP_TEXTURE_SIZE / 2;
    const rowEnd = Math.min(
      this.refreshRow + this.getRowsPerFrame(),
      MINIMAP_TEXTURE_SIZE
    );

    for (let py = this.refreshRow; py < rowEnd; py += 1) {
      for (let px = 0; px < MINIMAP_TEXTURE_SIZE; px += 1) {
        const wx = Math.floor(
          this.refreshOriginX + (px - half) * MINIMAP_WORLD_PER_TEXEL
        );
        const wz = Math.floor(
          this.refreshOriginZ + (py - half) * MINIMAP_WORLD_PER_TEXEL
        );
        const { block, y } = world.getTopBlock(wx, wz);
        const offset = (px + py * MINIMAP_TEXTURE_SIZE) * 4;

        if (!BLOCKS[block].solid) {
          data[offset] = 44;
          data[offset + 1] = 58;
          data[offset + 2] = 72;
          data[offset + 3] = 230;
          continue;
        }

        const shade = 0.58 + (y / WORLD_HEIGHT) * 0.42;
        const color = BLOCKS[block].color;
        data[offset] = color[0] * 255 * shade;
        data[offset + 1] = color[1] * 255 * shade;
        data[offset + 2] = color[2] * 255 * shade;
        data[offset + 3] = 255;
      }
    }

    this.refreshRow = rowEnd;
    this.sliceMaxMs = Math.max(this.sliceMaxMs, performance.now() - startedAt);

    if (this.refreshRow >= MINIMAP_TEXTURE_SIZE) {
      this.terrainContext.putImageData(this.image, 0, 0);
      this.displayOriginX = this.refreshOriginX;
      this.displayOriginZ = this.refreshOriginZ;
      this.hasTerrain = true;
      this.lastSliceMs = this.sliceMaxMs;
      this.accumulator = 0;
    }
  }

  private render(): void {
    this.context.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    this.context.imageSmoothingEnabled = false;

    if (this.hasTerrain) {
      this.context.drawImage(this.terrainCanvas, 0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    } else {
      this.context.fillStyle = "rgba(44, 58, 72, 0.9)";
      this.context.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    }

    this.drawGrid(this.displayOriginX, this.displayOriginZ);
    this.drawPlayer(this.displayOriginX, this.displayOriginZ);
  }

  private drawGrid(originX: number, originZ: number): void {
    this.context.save();
    this.context.strokeStyle = "rgba(255, 255, 255, 0.2)";
    this.context.lineWidth = 1;

    const worldMinX = originX - MINIMAP_RANGE / 2;
    const worldMaxX = originX + MINIMAP_RANGE / 2;
    const worldMinZ = originZ - MINIMAP_RANGE / 2;
    const worldMaxZ = originZ + MINIMAP_RANGE / 2;
    const firstChunkX = Math.floor(worldMinX / CHUNK_SIZE) * CHUNK_SIZE;
    const firstChunkZ = Math.floor(worldMinZ / CHUNK_SIZE) * CHUNK_SIZE;

    for (let wx = firstChunkX; wx <= worldMaxX; wx += CHUNK_SIZE) {
      const x = (wx - worldMinX) / MINIMAP_WORLD_PER_PIXEL;
      this.context.beginPath();
      this.context.moveTo(x, 0);
      this.context.lineTo(x, MINIMAP_SIZE);
      this.context.stroke();
    }

    for (let wz = firstChunkZ; wz <= worldMaxZ; wz += CHUNK_SIZE) {
      const y = (wz - worldMinZ) / MINIMAP_WORLD_PER_PIXEL;
      this.context.beginPath();
      this.context.moveTo(0, y);
      this.context.lineTo(MINIMAP_SIZE, y);
      this.context.stroke();
    }

    this.context.restore();
  }

  private drawPlayer(originX: number, originZ: number): void {
    const center = MINIMAP_SIZE / 2;
    const playerX = center + (this.camera.position.x - originX) / MINIMAP_WORLD_PER_PIXEL;
    const playerY = center + (this.camera.position.z - originZ) / MINIMAP_WORLD_PER_PIXEL;
    this.camera.getWorldDirection(this.direction);

    this.context.save();
    this.context.translate(playerX, playerY);
    this.context.rotate(Math.atan2(this.direction.x, -this.direction.z));

    this.context.fillStyle = "#f1c453";
    this.context.strokeStyle = "rgba(0, 0, 0, 0.45)";
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.moveTo(0, -8);
    this.context.lineTo(5, 6);
    this.context.lineTo(0, 3);
    this.context.lineTo(-5, 6);
    this.context.closePath();
    this.context.fill();
    this.context.stroke();
    this.context.restore();
  }
}
