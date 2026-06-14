import * as THREE from "three";
import {
  BLOCK_TEXTURE_ATLAS_COLUMNS,
  BLOCK_TEXTURE_ATLAS_ROWS,
  BLOCK_TEXTURE_TILE_SIZE_PX
} from "./blockTextureTiles";
import { createBlockTextureAtlas } from "./blockTextureAtlas";
import type { ChunkMeshedResult } from "./chunkProtocol";
import type { QualityPreset } from "./qualityPresets";
import type { GpuTerrainRenderStats } from "./renderBackend";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants";

type GpuTerrainChunkPage = {
  readonly key: string;
  readonly cx: number;
  readonly cz: number;
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly geometry: THREE.InstancedBufferGeometry;
  readonly faceCount: number;
  visible: boolean;
};

type GpuTerrainRendererOptions = {
  readonly scene: THREE.Scene;
  readonly fogColor: number;
  readonly fogNear: number;
  readonly fogFar: number;
};

const ATLAS_INSET_UV = 0.5 / BLOCK_TEXTURE_TILE_SIZE_PX;

export class GpuTerrainRenderer {
  private readonly scene: THREE.Scene;
  private readonly atlasTexture = createBlockTextureAtlas();
  private readonly material: THREE.ShaderMaterial;
  private readonly pages = new Map<string, GpuTerrainChunkPage>();
  private uploadBytesThisFrame = 0;
  private totalUploadBytes = 0;

  constructor(options: GpuTerrainRendererOptions) {
    this.scene = options.scene;
    this.material = this.createMaterial(options.fogColor, options.fogNear, options.fogFar);
  }

  beginFrame(): void {
    this.uploadBytesThisFrame = 0;
  }

  applyQuality(preset: QualityPreset): void {
    this.material.uniforms.fogNear.value = preset.fogNear;
    this.material.uniforms.fogFar.value = preset.fogFar;
  }

  applyChunkMesh(result: ChunkMeshedResult): void {
    const key = createChunkKey(result.cx, result.cz);
    if (result.faceCount <= 0) {
      this.removeChunk(key);
      return;
    }

    const geometry = createChunkGeometry(result);
    const previous = this.pages.get(key);
    const mesh = previous?.mesh ?? new THREE.Mesh(geometry, this.material);
    if (previous) {
      previous.geometry.dispose();
      mesh.geometry = geometry;
    } else {
      mesh.name = "GPU terrain chunk";
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
    }

    const page: GpuTerrainChunkPage = {
      key,
      cx: result.cx,
      cz: result.cz,
      mesh,
      geometry,
      faceCount: result.faceCount,
      visible: previous?.visible ?? true
    };
    mesh.visible = page.visible;
    this.pages.set(key, page);

    const uploadBytes = getChunkFaceUploadBytes(result);
    this.uploadBytesThisFrame += uploadBytes;
    this.totalUploadBytes += uploadBytes;
  }

  retainChunkKeys(keys: Iterable<string>): void {
    const liveKeys = new Set(keys);
    for (const key of this.pages.keys()) {
      if (!liveKeys.has(key)) this.removeChunk(key);
    }
  }

  updateVisibility(centerCx: number, centerCz: number, renderRadius: number): void {
    const safeRadius = Number.isFinite(renderRadius) ? Math.max(0, Math.floor(renderRadius)) : 0;
    for (const page of this.pages.values()) {
      const ringDistance = Math.max(Math.abs(page.cx - centerCx), Math.abs(page.cz - centerCz));
      page.visible = ringDistance <= safeRadius;
      page.mesh.visible = page.visible;
    }
  }

  getStats(): GpuTerrainRenderStats {
    let faces = 0;
    let visibleChunks = 0;
    for (const page of this.pages.values()) {
      faces += page.faceCount;
      if (page.visible) visibleChunks += 1;
    }

    return {
      chunks: this.pages.size,
      visibleChunks,
      faces,
      uploadBytesThisFrame: this.uploadBytesThisFrame,
      totalUploadBytes: this.totalUploadBytes
    };
  }

  clear(): void {
    for (const key of [...this.pages.keys()]) {
      this.removeChunk(key);
    }
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.atlasTexture.dispose();
  }

  private removeChunk(key: string): void {
    const page = this.pages.get(key);
    if (!page) return;
    this.scene.remove(page.mesh);
    page.geometry.dispose();
    this.pages.delete(key);
  }

  private createMaterial(fogColor: number, fogNear: number, fogFar: number): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      name: "GPU terrain material",
      uniforms: {
        blockAtlas: { value: this.atlasTexture },
        atlasGrid: { value: new THREE.Vector2(BLOCK_TEXTURE_ATLAS_COLUMNS, BLOCK_TEXTURE_ATLAS_ROWS) },
        atlasInset: {
          value: new THREE.Vector2(
            ATLAS_INSET_UV / BLOCK_TEXTURE_ATLAS_COLUMNS,
            ATLAS_INSET_UV / BLOCK_TEXTURE_ATLAS_ROWS
          )
        },
        fogColor: { value: new THREE.Color(fogColor) },
        fogNear: { value: fogNear },
        fogFar: { value: fogFar }
      },
      vertexShader: GPU_TERRAIN_VERTEX_SHADER,
      fragmentShader: GPU_TERRAIN_FRAGMENT_SHADER,
      side: THREE.FrontSide
    });
    material.toneMapped = true;
    return material;
  }
}

function createChunkGeometry(result: ChunkMeshedResult): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(createBaseQuadPositions(), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.setAttribute("faceOrigin", new THREE.InstancedBufferAttribute(result.faceOrigins, 3));
  geometry.setAttribute("faceEdgeU", new THREE.InstancedBufferAttribute(result.faceEdgeUs, 3));
  geometry.setAttribute("faceEdgeV", new THREE.InstancedBufferAttribute(result.faceEdgeVs, 3));
  geometry.setAttribute("faceNormal", new THREE.InstancedBufferAttribute(result.faceNormals, 3));
  geometry.setAttribute("faceColor", new THREE.InstancedBufferAttribute(result.faceColors, 3));
  geometry.setAttribute("faceTextureTile", new THREE.InstancedBufferAttribute(result.faceTextureTiles, 1));
  geometry.instanceCount = result.faceCount;
  geometry.boundingSphere = createChunkBoundingSphere(result.cx, result.cz);
  return geometry;
}

function createBaseQuadPositions(): Float32Array {
  return new Float32Array([
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0
  ]);
}

function createChunkBoundingSphere(cx: number, cz: number): THREE.Sphere {
  const center = new THREE.Vector3(
    cx * CHUNK_SIZE + CHUNK_SIZE / 2,
    WORLD_HEIGHT / 2,
    cz * CHUNK_SIZE + CHUNK_SIZE / 2
  );
  const radius = Math.sqrt((CHUNK_SIZE / 2) ** 2 * 2 + (WORLD_HEIGHT / 2) ** 2);
  return new THREE.Sphere(center, radius);
}

function getChunkFaceUploadBytes(result: ChunkMeshedResult): number {
  return result.faceOrigins.byteLength +
    result.faceEdgeUs.byteLength +
    result.faceEdgeVs.byteLength +
    result.faceNormals.byteLength +
    result.faceColors.byteLength +
    result.faceTextureTiles.byteLength;
}

function createChunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

const GPU_TERRAIN_VERTEX_SHADER = `
attribute vec3 faceOrigin;
attribute vec3 faceEdgeU;
attribute vec3 faceEdgeV;
attribute vec3 faceNormal;
attribute vec3 faceColor;
attribute float faceTextureTile;

varying vec2 vWorldUv;
varying vec3 vColor;
varying float vTextureTile;
varying float vFogDepth;

vec2 getWorldFaceUv(vec3 normal, vec3 worldPosition) {
  vec3 absoluteNormal = abs(normal);
  if (absoluteNormal.y >= absoluteNormal.x && absoluteNormal.y >= absoluteNormal.z) {
    return worldPosition.xz;
  }
  if (absoluteNormal.x >= absoluteNormal.z) {
    return worldPosition.zy;
  }
  return worldPosition.xy;
}

void main() {
  vec3 worldPosition = faceOrigin + faceEdgeU * position.x + faceEdgeV * position.y;
  vec4 viewPosition = modelViewMatrix * vec4(worldPosition, 1.0);
  gl_Position = projectionMatrix * viewPosition;

  vWorldUv = getWorldFaceUv(faceNormal, worldPosition);
  vColor = faceColor;
  vTextureTile = faceTextureTile;
  vFogDepth = max(0.0, -viewPosition.z);
}
`;

const GPU_TERRAIN_FRAGMENT_SHADER = `
uniform sampler2D blockAtlas;
uniform vec2 atlasGrid;
uniform vec2 atlasInset;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

varying vec2 vWorldUv;
varying vec3 vColor;
varying float vTextureTile;
varying float vFogDepth;

#include <tonemapping_pars_fragment>

void main() {
  float tileIndex = floor(vTextureTile + 0.5);
  float tileColumn = mod(tileIndex, atlasGrid.x);
  float tileRow = floor(tileIndex / atlasGrid.x);
  vec2 tileOrigin = vec2(tileColumn, tileRow) / atlasGrid;
  vec2 tileScale = (vec2(1.0) / atlasGrid) - atlasInset * 2.0;
  vec2 tileUv = tileOrigin + atlasInset + fract(vWorldUv) * tileScale;

  // The block atlas is an sRGB CanvasTexture, and Three uploads it with an sRGB
  // internal format on WebGL2. That means texture2D already gives this shader
  // linear color. Do not manually sRGB-decode here or the GPU terrain path will
  // double-darken compared with the legacy damaged-block MeshStandardMaterial.
  vec4 texel = texture2D(blockAtlas, tileUv);

  vec3 litColor = texel.rgb * vColor;
  float fogAmount = smoothstep(fogNear, fogFar, vFogDepth);
  gl_FragColor = vec4(mix(litColor, fogColor, fogAmount), texel.a);

  // Keep the final output on Three's normal display pipeline. Without this,
  // the WebGL2 terrain path and the legacy damaged-block material disagree
  // even when they sample the same atlas and vertex tint.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
