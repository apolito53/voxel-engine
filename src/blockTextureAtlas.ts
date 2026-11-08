import * as THREE from "three";
import { decodeBlockTextureArt } from "./blockTextureArt";
import { BLOCK_TEXTURE_SELECTION_GLSL } from "./blockTextureSelection";
import {
  BLOCK_TEXTURE_ATLAS_COLUMNS,
  BLOCK_TEXTURE_ATLAS_ROWS,
  BLOCK_TEXTURE_TILE,
  BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE,
  BLOCK_TEXTURE_TILE_SIZE_PX
} from "./blockTextureTiles";
import { ENCLOSED_INTERIOR_SHADE } from "./chunkLightOcclusion";
import { BLOCK_LIGHT_MAX_LEVEL, BLOCK_LIGHT_MIN_LEVEL } from "./voxelBlockLight";

type ShaderWithUniforms = Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0];

const ATLAS_INSET_UV = 0.5 / BLOCK_TEXTURE_TILE_SIZE_PX;
const WORLD_FOG_CAMERA_UNIFORM = "voxelHorizontalFogCameraPosition";
const WORLD_DAY_NIGHT_TINT_UNIFORM = "voxelDayNightOutdoorTint";
const WORLD_DAY_NIGHT_EXPOSURE_UNIFORM = "voxelDayNightOutdoorExposure";
const WORLD_BLOCK_LIGHT_RANGE_UNIFORM = "voxelBlockLightLevelRange";
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

export type WorldBlockLightRangeUniforms = {
  readonly minLevel: number;
  readonly maxLevel: number;
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
  const blockLightLevelRange = new THREE.Vector2(BLOCK_LIGHT_MIN_LEVEL, BLOCK_LIGHT_MAX_LEVEL);
  material.userData[WORLD_FOG_CAMERA_UNIFORM] = fogCameraPosition;
  material.userData[WORLD_DAY_NIGHT_TINT_UNIFORM] = dayNightTint;
  material.userData[WORLD_DAY_NIGHT_EXPOSURE_UNIFORM] = dayNightExposure;
  material.userData[WORLD_BLOCK_LIGHT_RANGE_UNIFORM] = blockLightLevelRange;

  material.onBeforeCompile = (shader) => {
    applyWorldBlockShaderPatches(shader, fogCameraPosition, dayNightTint, dayNightExposure, blockLightLevelRange);
    material.userData.shader = shader;
  };

  material.customProgramCacheKey = () => "voxel-block-texture-atlas-v12-sunwashed-connected-corners";
  return material;
}

export function applyWorldBlockShaderPatches(
  shader: ShaderWithUniforms,
  fogCameraPosition = new THREE.Vector3(),
  dayNightTint = new THREE.Color(1, 1, 1),
  dayNightExposure = { value: 1 },
  blockLightLevelRange = new THREE.Vector2(BLOCK_LIGHT_MIN_LEVEL, BLOCK_LIGHT_MAX_LEVEL)
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
  shader.uniforms[WORLD_BLOCK_LIGHT_RANGE_UNIFORM] = {
    value: blockLightLevelRange
  };

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
      [
        // Three declares its stock `worldPosition` only when another enabled
        // feature needs it. Potato deliberately has no PointLights or shadows,
        // so terrain fog must build an unconditional position of its own.
        "vec4 voxelWorldPosition = vec4(transformed, 1.0);",
        "#ifdef USE_BATCHING",
        "  voxelWorldPosition = batchingMatrix * voxelWorldPosition;",
        "#endif",
        "#ifdef USE_INSTANCING",
        "  voxelWorldPosition = instanceMatrix * voxelWorldPosition;",
        "#endif",
        "vVoxelWorldPosition = (modelMatrix * voxelWorldPosition).xyz;",
        "#include <worldpos_vertex>"
      ].join("\n")
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
        `uniform vec2 ${WORLD_BLOCK_LIGHT_RANGE_UNIFORM};`,
        `const float voxelLampBaseTile = ${BLOCK_TEXTURE_TILE.lamp.toFixed(1)};`,
        "varying float vBlockTextureTile;",
        "varying float vBlockLight;",
        "varying vec3 vVoxelWorldPosition;",
        BLOCK_TEXTURE_SELECTION_GLSL
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
        "  float blockTextureVariant = voxelConnectedTextureVariant(blockTextureCell, blockTextureBaseTile);",
        "  float blockTextureTileIndex = blockTextureBaseTile * blockTextureVariantsPerBaseTile + blockTextureVariant;",
        "  float blockTextureColumn = mod(blockTextureTileIndex, blockTextureAtlasGrid.x);",
        "  float blockTextureRow = floor(blockTextureTileIndex / blockTextureAtlasGrid.x);",
        // CanvasTexture uploads with flipY=true: canvas row zero (image top) is
        // at GPU v=1. Select rows from the top while local v still grows upward.
        "  float blockTextureGpuRow = blockTextureAtlasGrid.y - 1.0 - blockTextureRow;",
        "  vec2 blockTextureOrigin = vec2(blockTextureColumn, blockTextureGpuRow) / blockTextureAtlasGrid;",
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
        // The solver still emits integer 0..15 block-light values. This range
        // uniform is a player-facing display clamp for tuning night readability
        // and overbright Lamp spill without mutating chunk light data.
        "float voxelRawBlockLight = clamp(vBlockLight, 0.0, 15.0);",
        `float voxelBlockLightMinLevel = min(${WORLD_BLOCK_LIGHT_RANGE_UNIFORM}.x, ${WORLD_BLOCK_LIGHT_RANGE_UNIFORM}.y);`,
        `float voxelBlockLightMaxLevel = max(${WORLD_BLOCK_LIGHT_RANGE_UNIFORM}.x, ${WORLD_BLOCK_LIGHT_RANGE_UNIFORM}.y);`,
        "float voxelClampedBlockLight = clamp(voxelRawBlockLight, voxelBlockLightMinLevel, voxelBlockLightMaxLevel);",
        "float voxelBlockLight = clamp(voxelClampedBlockLight / 15.0, 0.0, 1.0);",
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

export function updateWorldBlockMaterialBlockLightRange(
  material: THREE.Material,
  uniforms: WorldBlockLightRangeUniforms
): void {
  const minLevel = normalizeMaterialBlockLightLevel(uniforms.minLevel, BLOCK_LIGHT_MIN_LEVEL);
  const maxLevel = normalizeMaterialBlockLightLevel(uniforms.maxLevel, BLOCK_LIGHT_MAX_LEVEL);
  const lowLevel = Math.min(minLevel, maxLevel);
  const highLevel = Math.max(minLevel, maxLevel);

  const userDataRange = material.userData[WORLD_BLOCK_LIGHT_RANGE_UNIFORM];
  if (userDataRange instanceof THREE.Vector2) {
    userDataRange.set(lowLevel, highLevel);
  }

  const shader = getWorldBlockShader(material);
  const shaderRange = shader?.uniforms[WORLD_BLOCK_LIGHT_RANGE_UNIFORM]?.value;
  if (shaderRange instanceof THREE.Vector2) {
    shaderRange.set(lowLevel, highLevel);
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

function normalizeMaterialBlockLightLevel(value: unknown, fallback: number): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(BLOCK_LIGHT_MIN_LEVEL, Math.min(BLOCK_LIGHT_MAX_LEVEL, Math.round(numericValue)));
}

export function createBlockTextureAtlas(): THREE.CanvasTexture {
  // Decode embedded pixels synchronously so startup, HMR and disposal keep the
  // existing material ownership; no external image request can finish late.
  const pixels = decodeBlockTextureArt();
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Block texture atlas canvas could not create a 2D context.");
  }

  ctx.imageSmoothingEnabled = false;
  const image = ctx.createImageData(pixels.width, pixels.height);
  image.data.set(pixels.data);
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
