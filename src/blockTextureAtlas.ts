import * as THREE from "three";
import {
  BLOCK_TEXTURE_ATLAS_COLUMNS,
  BLOCK_TEXTURE_ATLAS_ROWS,
  BLOCK_TEXTURE_TILE,
  BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE,
  BLOCK_TEXTURE_TILE_SIZE_PX
} from "./blockTextureTiles";
import { ENCLOSED_INTERIOR_SHADE } from "./chunkLightOcclusion";

type ShaderWithUniforms = Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0];
type TilePainter = (ctx: CanvasRenderingContext2D, variant: number) => void;

const ATLAS_INSET_UV = 0.5 / BLOCK_TEXTURE_TILE_SIZE_PX;
const WORLD_FOG_CAMERA_UNIFORM = "voxelHorizontalFogCameraPosition";
const WORLD_DAY_NIGHT_TINT_UNIFORM = "voxelDayNightOutdoorTint";
const WORLD_DAY_NIGHT_EXPOSURE_UNIFORM = "voxelDayNightOutdoorExposure";
// The sealed-room baked shade is intentionally tiny. This cutoff catches every
// enclosed material face, but stays below normal outdoor foliage/wall shade so
// the indirect-light clamp does not misclassify ordinary dark terrain.
const SEALED_VERTEX_LIGHT_THRESHOLD = 0.05;
const SEALED_DIRECT_LIGHT_RESTORE_SCALE = 1 / ENCLOSED_INTERIOR_SHADE;
const LAMP_EMISSIVE_STRENGTH = 2.35;
const LAMP_BLOCK_LIGHT_STRENGTH = 1.45;

export type WorldBlockMaterialOptions = {
  readonly side?: THREE.Side;
};

export type WorldBlockDayNightUniforms = {
  readonly outdoorTint: THREE.ColorRepresentation | readonly [number, number, number];
  readonly outdoorExposure: number;
};

export function createWorldBlockMaterial(options: WorldBlockMaterialOptions = {}): THREE.MeshStandardMaterial {
  const atlasTexture = createBlockTextureAtlas();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: atlasTexture,
    roughness: 0.92,
    metalness: 0,
    side: options.side ?? THREE.FrontSide
  });
  const fogCameraPosition = new THREE.Vector3();
  const dayNightTint = new THREE.Color(1, 1, 1);
  const dayNightExposure = { value: 1 };
  material.userData[WORLD_FOG_CAMERA_UNIFORM] = fogCameraPosition;
  material.userData[WORLD_DAY_NIGHT_TINT_UNIFORM] = dayNightTint;
  material.userData[WORLD_DAY_NIGHT_EXPOSURE_UNIFORM] = dayNightExposure;

  material.onBeforeCompile = (shader) => {
    applyWorldBlockShaderPatches(shader, fogCameraPosition, dayNightTint, dayNightExposure);
    material.userData.shader = shader;
  };

  material.customProgramCacheKey = () => "voxel-block-texture-atlas-v9-block-light-spill";
  return material;
}

export function applyWorldBlockShaderPatches(
  shader: ShaderWithUniforms,
  fogCameraPosition = new THREE.Vector3(),
  dayNightTint = new THREE.Color(1, 1, 1),
  dayNightExposure = { value: 1 }
): void {
  shader.uniforms.blockTextureAtlasGrid = {
    value: new THREE.Vector2(BLOCK_TEXTURE_ATLAS_COLUMNS, BLOCK_TEXTURE_ATLAS_ROWS)
  };
  shader.uniforms.blockTextureAtlasInset = {
    value: new THREE.Vector2(ATLAS_INSET_UV / BLOCK_TEXTURE_ATLAS_COLUMNS, ATLAS_INSET_UV / BLOCK_TEXTURE_ATLAS_ROWS)
  };
  shader.uniforms.blockTextureVariantsPerBaseTile = {
    value: BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE
  };
  shader.uniforms[WORLD_FOG_CAMERA_UNIFORM] = {
    value: fogCameraPosition
  };
  shader.uniforms[WORLD_DAY_NIGHT_TINT_UNIFORM] = {
    value: dayNightTint
  };
  shader.uniforms[WORLD_DAY_NIGHT_EXPOSURE_UNIFORM] = dayNightExposure;

  // The base tile id is per vertex so worker-built chunk geometry can choose grass
  // tops, dirt undersides, wood end grain, and side textures without splitting
  // the world into separate materials or draw-call buckets. The exact texture
  // variant is chosen per meter in the fragment shader, keeping visual breakup
  // without fragmenting greedy terrain quads into T-junction-prone slivers.
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      [
        "#include <common>",
        "attribute float blockTextureTile;",
        "attribute float blockLight;",
        "varying float vBlockTextureTile;",
        "varying float vBlockLight;",
        "varying vec3 vVoxelWorldPosition;"
      ].join("\n")
    )
    .replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\nvBlockTextureTile = blockTextureTile;\nvBlockLight = blockLight;"
    )
    .replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvVoxelWorldPosition = worldPosition.xyz;"
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      [
        "#include <common>",
        "uniform vec2 blockTextureAtlasGrid;",
        "uniform vec2 blockTextureAtlasInset;",
        "uniform float blockTextureVariantsPerBaseTile;",
        `uniform vec3 ${WORLD_FOG_CAMERA_UNIFORM};`,
        `uniform vec3 ${WORLD_DAY_NIGHT_TINT_UNIFORM};`,
        `uniform float ${WORLD_DAY_NIGHT_EXPOSURE_UNIFORM};`,
        `const float voxelLampBaseTile = ${BLOCK_TEXTURE_TILE.lamp.toFixed(1)};`,
        "varying float vBlockTextureTile;",
        "varying float vBlockLight;",
        "varying vec3 vVoxelWorldPosition;"
      ].join("\n")
    )
    .replace(
      "#include <map_fragment>",
      [
        "float blockTextureBaseTile = floor(vBlockTextureTile + 0.5);",
        // Lamp faces need a stable self-lit texture color. `diffuseColor`
        // already carries baked vertex lighting, so keep the raw atlas sample
        // around and use it for lamp emission below.
        "vec3 voxelTextureDiffuseColor = diffuseColor.rgb;",
        "#ifdef USE_MAP",
        "  vec2 blockTextureCell = floor(vMapUv);",
        "  float blockTextureHash = fract(sin(dot(blockTextureCell + vec2(blockTextureBaseTile * 17.0, blockTextureBaseTile * 31.0), vec2(127.1, 311.7))) * 43758.5453123);",
        "  float blockTextureVariant = floor(blockTextureHash * blockTextureVariantsPerBaseTile);",
        "  float blockTextureTileIndex = blockTextureBaseTile * blockTextureVariantsPerBaseTile + blockTextureVariant;",
        "  float blockTextureColumn = mod(blockTextureTileIndex, blockTextureAtlasGrid.x);",
        "  float blockTextureRow = floor(blockTextureTileIndex / blockTextureAtlasGrid.x);",
        "  vec2 blockTextureOrigin = vec2(blockTextureColumn, blockTextureRow) / blockTextureAtlasGrid;",
        "  vec2 blockTextureScale = (vec2(1.0) / blockTextureAtlasGrid) - blockTextureAtlasInset * 2.0;",
        "  vec2 blockTextureUv = blockTextureOrigin + blockTextureAtlasInset + fract(vMapUv) * blockTextureScale;",
        "  vec4 sampledDiffuseColor = texture2D(map, blockTextureUv);",
        "  voxelTextureDiffuseColor = sampledDiffuseColor.rgb;",
        "  diffuseColor *= sampledDiffuseColor;",
        "#endif"
      ].join("\n")
    )
    .replace(
      "#include <fog_fragment>",
      [
        "#ifdef USE_FOG",
        // Terrain chunks stream and hide in a horizontal-radius circle. Three's
        // stock fog fades by camera-space depth, which turns the hard fog wall
        // into a screen-aligned rectangle from high altitude. Match the chunk
        // policy by fogging terrain from horizontal X/Z distance instead.
        `  vec2 voxelHorizontalFogDelta = vVoxelWorldPosition.xz - ${WORLD_FOG_CAMERA_UNIFORM}.xz;`,
        "  float voxelHorizontalFogDistance = length(voxelHorizontalFogDelta);",
        "  #ifdef FOG_EXP2",
        "    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * voxelHorizontalFogDistance * voxelHorizontalFogDistance );",
        "  #else",
        "    float fogFactor = smoothstep( fogNear, fogFar, voxelHorizontalFogDistance );",
        "  #endif",
        "  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );",
        "#endif"
      ].join("\n")
    )
    .replace(
      "#include <lights_fragment_end>",
      [
        "#include <lights_fragment_end>",
        // Faces inside sealed air pockets carry a deliberately tiny baked
        // vertex color. Letting the global hemisphere/sky term add on top of
        // that color creates thin contact glows at room edges, so sealed faces
        // keep only their baked dark diffuse baseline for indirect light.
        //
        // Three.js also multiplies direct diffuse lights by vertex color before
        // this hook runs. Undo just the sealed shade multiplier for direct
        // diffuse so placed lamps can brighten dark rooms without restoring the
        // global sky/hemisphere fill that caused the sealed-room edge glow.
        "float voxelSealedLightMask = 0.0;",
        "#if defined(USE_COLOR)",
        `float voxelBakedLight = max(max(vColor.r, vColor.g), vColor.b);`,
        `voxelSealedLightMask = 1.0 - step(${SEALED_VERTEX_LIGHT_THRESHOLD.toFixed(3)}, voxelBakedLight);`,
        `float voxelSealedDirectLightScale = mix(1.0, ${SEALED_DIRECT_LIGHT_RESTORE_SCALE.toFixed(3)}, voxelSealedLightMask);`,
        "reflectedLight.directDiffuse *= voxelSealedDirectLightScale;",
        "reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, diffuseColor.rgb, voxelSealedLightMask);",
        "reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, vec3(0.0), voxelSealedLightMask);",
        "#endif",
        "reflectedLight.directSpecular *= diffuseColor.rgb;",
        "reflectedLight.indirectSpecular *= diffuseColor.rgb;",
        "float voxelLampTileMask = 1.0 - step(0.5, abs(blockTextureBaseTile - voxelLampBaseTile));",
        "float voxelOutdoorCycleMask = (1.0 - voxelSealedLightMask) * (1.0 - voxelLampTileMask);",
        `vec3 voxelOutdoorCycleScale = ${WORLD_DAY_NIGHT_TINT_UNIFORM} * ${WORLD_DAY_NIGHT_EXPOSURE_UNIFORM};`,
        // Day/night tint should change the sky/hemisphere fill, not crush
        // direct local PointLight spill. Otherwise an open lamp room looks
        // unlit until it becomes sealed and takes the sealed-room restore path.
        "reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, reflectedLight.indirectDiffuse * voxelOutdoorCycleScale, voxelOutdoorCycleMask);",
        "reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, reflectedLight.indirectSpecular * voxelOutdoorCycleScale, voxelOutdoorCycleMask);",
        // Derived Lamp block-light is deliberately separate from `vColor`.
        // Sealed-room darkness still comes from the baked vertex color path
        // above; this warm spill is an additive runtime lightmap channel.
        "float voxelBlockLight = clamp(vBlockLight / 15.0, 0.0, 1.0);",
        "float voxelBlockLightCurve = voxelBlockLight * voxelBlockLight;",
        `vec3 voxelBlockLightColor = vec3(1.0, 0.62, 0.28) * ${LAMP_BLOCK_LIGHT_STRENGTH.toFixed(2)};`,
        "reflectedLight.indirectDiffuse += voxelTextureDiffuseColor * voxelBlockLightColor * voxelBlockLightCurve * (1.0 - voxelLampTileMask);",
        // PointLight proxies are only for spill on nearby non-lamp surfaces.
        // Lamp terrain itself should look self-lit and identical no matter
        // which proxy source is nearest to the player/camera.
        "vec3 voxelLampEmission = voxelTextureDiffuseColor * vec3(1.20, 0.92, 0.48) * " +
          `${LAMP_EMISSIVE_STRENGTH.toFixed(2)};`,
        "reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, vec3(0.0), voxelLampTileMask);",
        "reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, vec3(0.0), voxelLampTileMask);",
        "reflectedLight.directSpecular = mix(reflectedLight.directSpecular, vec3(0.0), voxelLampTileMask);",
        "reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, vec3(0.0), voxelLampTileMask);",
        "totalEmissiveRadiance = mix(totalEmissiveRadiance, voxelLampEmission, voxelLampTileMask);"
      ].join("\n")
    );
}

export function updateWorldBlockMaterialFogCenter(
  material: THREE.Material,
  cameraPosition: THREE.Vector3
): void {
  const userDataFogPosition = material.userData[WORLD_FOG_CAMERA_UNIFORM];
  if (userDataFogPosition instanceof THREE.Vector3) {
    userDataFogPosition.copy(cameraPosition);
    return;
  }

  const shader = getWorldBlockShader(material);
  const cameraUniform = shader?.uniforms[WORLD_FOG_CAMERA_UNIFORM]?.value;
  if (cameraUniform instanceof THREE.Vector3) {
    cameraUniform.copy(cameraPosition);
  }
}

export function updateWorldBlockMaterialDayNight(
  material: THREE.Material,
  uniforms: WorldBlockDayNightUniforms
): void {
  const tint = material.userData[WORLD_DAY_NIGHT_TINT_UNIFORM];
  if (tint instanceof THREE.Color) {
    setColorFromRepresentation(tint, uniforms.outdoorTint);
  }

  const exposure = material.userData[WORLD_DAY_NIGHT_EXPOSURE_UNIFORM];
  if (isUniformNumber(exposure)) {
    exposure.value = uniforms.outdoorExposure;
  }

  const shader = getWorldBlockShader(material);
  const shaderTint = shader?.uniforms[WORLD_DAY_NIGHT_TINT_UNIFORM]?.value;
  if (shaderTint instanceof THREE.Color) {
    setColorFromRepresentation(shaderTint, uniforms.outdoorTint);
  }
  const shaderExposure = shader?.uniforms[WORLD_DAY_NIGHT_EXPOSURE_UNIFORM];
  if (isUniformNumber(shaderExposure)) {
    shaderExposure.value = uniforms.outdoorExposure;
  }
}

export function disposeWorldBlockMaterial(material: THREE.MeshStandardMaterial): void {
  material.map?.dispose();
  material.dispose();
}

function getWorldBlockShader(material: THREE.Material): ShaderWithUniforms | null {
  const materialWithShader = material as THREE.Material & {
    userData: {
      shader?: ShaderWithUniforms;
    };
  };
  return materialWithShader.userData.shader ?? null;
}

function setColorFromRepresentation(
  color: THREE.Color,
  value: THREE.ColorRepresentation | readonly [number, number, number]
): void {
  if (Array.isArray(value)) {
    const rgb = value as readonly [number, number, number];
    color.setRGB(rgb[0], rgb[1], rgb[2]);
    return;
  }
  color.set(value as THREE.ColorRepresentation);
}

function isUniformNumber(value: unknown): value is { value: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof (value as { readonly value?: unknown }).value === "number"
  );
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
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.mossTop, drawMossTop);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.mossSide, drawMossSide);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.bush, drawBush);
  paintTileVariants(ctx, BLOCK_TEXTURE_TILE.lamp, drawLamp);

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
  fill(ctx, "#a8c492");
  drawSpeckles(ctx, 0x91c1 + variant * 0x101, 42 + variant * 3, "rgba(14, 51, 22, 0.38)", 1, 3);
  drawShortStrokes(ctx, 0x91c2 + variant * 0x103, 24 + variant * 2, "rgba(10, 40, 18, 0.34)", 1, 2);
}

function drawMossTop(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#b2d18d");
  drawSpeckles(ctx, 0xa1d1 + variant * 0x101, 46 + variant * 3, "rgba(18, 76, 23, 0.36)", 1, 2);
  drawShortStrokes(ctx, 0xa1d2 + variant * 0x103, 22 + variant * 2, "rgba(13, 62, 20, 0.28)", 1, 3);
}

function drawMossSide(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#9eb47f");
  fillRect(ctx, 0, 8 + (variant % 2), 16, 8, "rgba(55, 39, 24, 0.34)");
  drawVerticalStrokes(ctx, 0xa2e1 + variant * 0x101, 18 + variant * 2, "rgba(15, 70, 22, 0.36)", 2, 11);
  drawSpeckles(ctx, 0xa2e2 + variant * 0x103, 14 + variant, "rgba(38, 28, 17, 0.22)", 1, 1);
}

function drawBush(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#8aaa79");
  drawSpeckles(ctx, 0xb1f1 + variant * 0x101, 52 + variant * 3, "rgba(8, 43, 17, 0.42)", 1, 3);
  drawShortStrokes(ctx, 0xb1f2 + variant * 0x103, 28 + variant * 2, "rgba(5, 34, 15, 0.36)", 1, 2);
  drawChunk(ctx, 2 + (variant % 2), 5, 5, 4, "rgba(17, 70, 22, 0.22)");
  drawChunk(ctx, 9, 2 + (variant % 2), 4, 5, "rgba(15, 58, 20, 0.24)");
}

function drawLamp(ctx: CanvasRenderingContext2D, variant: number): void {
  fill(ctx, "#ffe08a");
  fillRect(ctx, 0, 0, 16, 16, "rgba(92, 46, 16, 0.12)");
  fillRect(ctx, 2, 2, 12, 12, "rgba(255, 212, 92, 0.78)");
  fillRect(ctx, 5 + (variant % 2), 3, 3, 10, "rgba(255, 246, 176, 0.58)");
  fillRect(ctx, 10, 4 + (variant % 2), 2, 8, "rgba(255, 180, 54, 0.32)");
  strokePath(ctx, "rgba(96, 48, 18, 0.42)", [[1, 1], [14, 1], [14, 14], [1, 14], [1, 1]]);
  drawSpeckles(ctx, 0xc1a1 + variant * 0x101, 10 + variant, "rgba(110, 55, 20, 0.18)", 1, 1);
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
