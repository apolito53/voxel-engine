import * as THREE from "three";
import {
  CLOUD_BASE_HEIGHT_METERS, CLOUD_CELL_SIZE_METERS, CLOUD_STEP_HEIGHT_METERS,
  CLOUD_TILE_CELLS, CLOUD_TILE_SIZE_METERS, CLOUD_TOP_HEIGHT_METERS,
  sampleCloudColumn, type CloudLayerDebugState, type CloudWindOffset
} from "./cloudLayer";
import { CLOUD_SHADOW_FULL_RADIUS, CLOUD_SHADOW_MIN_SUN_HEIGHT, type DirectionalShadowBasis } from "./shadows";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants";
import type { VoxelWorld } from "./world";

export const CLOUD_SHADOW_DEBUG_STORAGE_KEY = "voxel-cloud-shadow-guides";
export const CLOUD_SHADOW_DEBUG_MAX_BANKS = 3;
export const CLOUD_SHADOW_DEBUG_MAX_CONTACTS = 128;
export const CLOUD_SHADOW_DEBUG_REFRESH_SECONDS = 0.25;
const LOCAL_HALF_SIZE = 120;
const MAX_SOURCE_CELLS = 256;
const RING_SEGMENTS = 48;
// Saturated accents stay visible against pale sky, white banks and sandy terrain.
const BANK_COLORS = [0xff4770, 0xb2ff28, 0xff36d1, 0xffbc24, 0xb16aff, 0x22ead1, 0xff762b] as const;
type Point = Pick<THREE.Vector3, "x" | "y" | "z">;
type Terrain = Pick<VoxelWorld, "getChunk" | "raycastTerraformerTarget">;
type GuideCell = { x: number; z: number; id: number; top: number; bottom: number; radius: number };
type GuideBank = { id: number; color: THREE.Color; cells: GuideCell[]; contacts: Contact[] };
type Contact = { source: THREE.Vector3; point: THREE.Vector3; normal: THREE.Vector3; radius: number; bottom: number };
export type CloudShadowGuideStatus = "off" | "outside-world" | "shadows-off" | "cloud-shadows-off" |
  "night" | "low-sun" | "active";
export type CloudShadowDebugSnapshot = {
  readonly enabled: boolean;
  readonly status: CloudShadowGuideStatus;
  readonly sampledContacts: number;
  readonly unknownContacts: number;
  readonly relevantBanks: number;
  readonly sunDirection: Point | null;
  readonly lightDirection: Point | null;
  readonly coverage: number;
  readonly minSunHeight: number;
  readonly banks: readonly {
    readonly id: number;
    readonly color: string;
    readonly contacts: number;
    readonly source: Point | null;
    readonly contact: Point | null;
  }[];
};
export type CloudShadowDebugUpdate = {
  readonly camera: THREE.Camera;
  readonly cloud: CloudLayerDebugState;
  readonly world: Terrain | null;
  readonly inWorld: boolean;
  readonly shadows: boolean;
  readonly cloudShadows: boolean;
  readonly coverage: number;
  readonly basis: DirectionalShadowBasis;
  readonly minSunHeight: number;
  readonly anchor: THREE.Vector3;
  readonly lightPosition: THREE.Vector3;
  readonly cameraSize: number;
  readonly cameraNear: number;
  readonly cameraFar: number;
  readonly deltaSeconds: number;
};

export function readCloudShadowDebugPreference(): boolean {
  try { return globalThis.localStorage?.getItem(CLOUD_SHADOW_DEBUG_STORAGE_KEY) === "true"; }
  catch { return false; }
}

export function writeCloudShadowDebugPreference(enabled: boolean): void {
  try { globalThis.localStorage?.setItem(CLOUD_SHADOW_DEBUG_STORAGE_KEY, String(enabled)); }
  catch { /* A debug preference must remain usable without browser storage. */ }
}

// A connected bank crosses the periodic tile seam without acquiring a new ID.
// IDs are deterministic minimum cell indices, independent of camera and wind.
export function createCloudBankIds(
  size = CLOUD_TILE_CELLS,
  occupied: (x: number, z: number) => boolean = (x, z) => sampleCloudColumn(x, z).top > 0
): Uint16Array {
  const ids = new Uint16Array(size * size);
  const queue: number[] = [];
  for (let start = 0; start < ids.length; start += 1) {
    if (ids[start] || !occupied(start % size, Math.floor(start / size))) continue;
    const id = start + 1;
    ids[start] = id;
    queue.length = 0;
    queue.push(start);
    for (let next = 0; next < queue.length; next += 1) {
      const index = queue[next];
      const x = index % size;
      const z = Math.floor(index / size);
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = modulo(x + dx, size);
        const nz = modulo(z + dz, size);
        const neighbor = nx + nz * size;
        if (ids[neighbor] || !occupied(nx, nz)) continue;
        ids[neighbor] = id;
        queue.push(neighbor);
      }
    }
  }
  return ids;
}

export function getCloudBankId(ids: Uint16Array, x: number, z: number, size = CLOUD_TILE_CELLS): number {
  return ids[modulo(x, size) + modulo(z, size) * size];
}

export function getCloudShadowGuideRadius(
  point: Point, anchor: Point, cameraSize: number, basis: DirectionalShadowBasis
): number {
  const x = point.x - anchor.x;
  const y = point.y - anchor.y;
  const z = point.z - anchor.z;
  return Math.hypot(
    x * basis.right.x + y * basis.right.y + z * basis.right.z,
    x * basis.up.x + y * basis.up.y + z * basis.up.z
  ) / cameraSize;
}

export function projectCloudGuideToHeight(
  point: Point, height: number, down: THREE.Vector3, minSunHeight = CLOUD_SHADOW_MIN_SUN_HEIGHT
): THREE.Vector3 | null {
  if (!Number.isFinite(down.y) || -down.y <= minSunHeight) return null;
  return new THREE.Vector3(point.x, point.y, point.z).addScaledVector(down, (height - point.y) / down.y);
}

export type CloudShadowContactResult =
  | { readonly kind: "hit"; readonly point: THREE.Vector3; readonly normal: THREE.Vector3 }
  | { readonly kind: "unknown" | "miss" };

// Read only: the world's picker follows surviving partial-lattice geometry.
// Reject paths crossing unloaded terrain, including before a later known hit.
export function traceCloudShadowContact(
  world: Terrain, source: Point, down: THREE.Vector3, minSunHeight = CLOUD_SHADOW_MIN_SUN_HEIGHT
): CloudShadowContactResult {
  if (!Number.isFinite(down.y) || -down.y <= minSunHeight) return { kind: "miss" };
  const reach = Math.max(0, (source.y + 0.01) / -down.y);
  if (!Number.isFinite(reach) || reach <= 0) return { kind: "miss" };
  const hit = world.raycastTerraformerTarget(source, down, reach);
  const startDistance = Math.max(0, (source.y - WORLD_HEIGHT) / -down.y);
  const endDistance = Math.min(reach, hit?.distance ?? reach);
  const start = new THREE.Vector3(source.x, source.y, source.z).addScaledVector(down, startDistance + 0.00001);
  let cx = Math.floor(start.x / CHUNK_SIZE);
  let cz = Math.floor(start.z / CHUNK_SIZE);
  const stepX = Math.sign(down.x);
  const stepZ = Math.sign(down.z);
  const nextBoundary = (chunk: number, step: number): number => (chunk + (step > 0 ? 1 : 0)) * CHUNK_SIZE;
  let nextX = stepX ? startDistance + (nextBoundary(cx, stepX) - start.x) / down.x : Infinity;
  let nextZ = stepZ ? startDistance + (nextBoundary(cz, stepZ) - start.z) / down.z : Infinity;
  const deltaX = CHUNK_SIZE / Math.abs(down.x);
  const deltaZ = CHUNK_SIZE / Math.abs(down.z);
  for (let distance = startDistance; distance <= endDistance;) {
    if (!world.getChunk(cx, cz)) return { kind: "unknown" };
    const next = Math.min(nextX, nextZ);
    if (next > endDistance) break;
    if (nextX === next) { cx += stepX; nextX += deltaX; }
    if (nextZ === next) { cz += stepZ; nextZ += deltaZ; }
    distance = next;
  }
  return hit
    ? { kind: "hit", point: new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z) }
    : { kind: "miss" };
}

export function getCloudShadowGuideStatus(options: Pick<CloudShadowDebugUpdate,
  "inWorld" | "shadows" | "cloudShadows" | "coverage" | "basis">): CloudShadowGuideStatus {
  if (!options.inWorld) return "outside-world";
  if (!options.shadows) return "shadows-off";
  if (!options.cloudShadows) return "cloud-shadows-off";
  if (options.coverage <= 0) return options.basis.forward.y >= 0 ? "night" : "low-sun";
  return "active";
}

export class CloudShadowDebug {
  readonly object = new THREE.Group();
  private readonly source = createLines("Cloud bank colored edges", 0.95, 8192);
  private readonly contacts = createLines("Cloud bank sampled terrain contacts", 0.95, 1024);
  private readonly rays = createLines("Representative cloud sun rays", 0.95, 16);
  private readonly rings = createLines("Cloud shadow map fade and edge", 0.7, 256);
  private ids: Uint16Array | null = null;
  private readonly palette = new Map<number, THREE.Color>();
  private banks: GuideBank[] = [];
  private enabled = false;
  private disposed = false;
  private elapsed = Infinity;
  private status: CloudShadowGuideStatus = "off";
  private unknownContacts = 0;
  private relevantBanks = 0;
  private readonly lastAnchor = new THREE.Vector3(Infinity, Infinity, Infinity);
  private readonly lastWind = new THREE.Vector2(Infinity, Infinity);
  private readonly lastDirection = new THREE.Vector3(Infinity, Infinity, Infinity);
  private readonly sunDirection = new THREE.Vector3();
  private readonly lightDirection = new THREE.Vector3();
  private coverage = 0;
  private minSunHeight = 1;
  private hasDirection = false;
  private lastSize = -1;
  private lastFar = -1;
  private lastWorld: Terrain | null = null;
  private labels: { element: HTMLElement; point: THREE.Vector3; source: boolean }[] = [];
  private readonly projected = new THREE.Vector3();

  constructor(scene: THREE.Scene, private readonly overlay: HTMLElement | null = null) {
    this.object.name = "Cloud shadow sampled guides";
    this.object.visible = false;
    this.object.add(this.source, this.contacts, this.rays, this.rings);
    scene.add(this.object);
    if (overlay) overlay.hidden = true;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled && !this.disposed;
    this.reset();
  }

  reset(): void {
    this.object.visible = false;
    this.elapsed = Infinity;
    this.lastWorld = null;
    this.banks = [];
    this.status = this.enabled ? "outside-world" : "off";
    this.unknownContacts = 0;
    this.relevantBanks = 0;
    this.hasDirection = false;
    this.coverage = 0;
    this.labels = [];
    if (this.overlay) { this.overlay.hidden = true; this.overlay.replaceChildren(); }
  }

  snapshot(): CloudShadowDebugSnapshot {
    return {
      enabled: this.enabled, status: this.status, unknownContacts: this.unknownContacts,
      relevantBanks: this.relevantBanks,
      sunDirection: this.hasDirection ? this.sunDirection.clone() : null,
      lightDirection: this.hasDirection ? this.lightDirection.clone() : null,
      coverage: this.coverage, minSunHeight: this.minSunHeight,
      sampledContacts: this.banks.reduce((sum, bank) => sum + bank.contacts.length, 0),
      banks: this.banks.map((bank) => ({
        id: bank.id, color: `#${bank.color.getHexString()}`, contacts: bank.contacts.length,
        source: bank.contacts[0]?.source.clone() ?? null, contact: bank.contacts[0]?.point.clone() ?? null
      }))
    };
  }

  update(options: CloudShadowDebugUpdate): void {
    if (!this.enabled || this.disposed) return;
    this.sunDirection.copy(options.basis.forward).negate();
    this.lightDirection.copy(options.lightPosition).sub(options.anchor).normalize();
    this.coverage = options.coverage;
    this.minSunHeight = options.minSunHeight;
    this.hasDirection = true;
    const status = getCloudShadowGuideStatus(options);
    const changed = status !== this.status;
    this.status = status;
    if (status !== "active" || !options.world || !options.cloud.visible || !options.cloud.casting) {
      this.object.visible = false;
      if (changed) this.updateOverlay(options.coverage);
      return;
    }
    this.elapsed += Math.max(0, options.deltaSeconds);
    const wind = options.cloud.wind;
    const moved = this.lastAnchor.distanceToSquared(options.anchor) > 16 ** 2;
    const wrapped = Math.abs(wind.x - this.lastWind.x) > CLOUD_TILE_SIZE_METERS / 2 ||
      Math.abs(wind.z - this.lastWind.y) > CLOUD_TILE_SIZE_METERS / 2;
    const turned = this.lastDirection.distanceToSquared(options.basis.forward) > 0.01 ** 2;
    // A running clock changes the fitted far plane every frame. Small solar
    // motion stays on the ordinary cadence; clock jumps/quality edits refresh now.
    const rangeChanged = Math.abs(this.lastFar - options.cameraFar) > Math.max(4, options.cameraFar * 0.05);
    if (changed || moved || wrapped || this.lastWorld !== options.world ||
      turned || this.lastSize !== options.cameraSize || rangeChanged ||
      this.elapsed >= CLOUD_SHADOW_DEBUG_REFRESH_SECONDS) {
      this.rebuild(options);
      this.lastWind.set(wind.x, wind.z);
      this.updateOverlay(options.coverage);
      this.elapsed = 0;
      this.lastAnchor.copy(options.anchor);
      this.lastSize = options.cameraSize;
      this.lastFar = options.cameraFar;
      this.lastDirection.copy(options.basis.forward);
      this.lastWorld = options.world;
    }
    this.source.position.set(wind.x, 0, wind.z);
    this.object.visible = true;
    for (const label of this.labels) {
      this.projected.copy(label.point);
      if (label.source) { this.projected.x += wind.x; this.projected.z += wind.z; }
      this.projected.project(options.camera);
      label.element.hidden = Math.abs(this.projected.x) > 0.96 || Math.abs(this.projected.y) > 0.94 ||
        this.projected.z < -1 || this.projected.z > 1;
      label.element.style.left = `${(this.projected.x + 1) * 50}%`;
      label.element.style.top = `${(1 - this.projected.y) * 50}%`;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.setEnabled(false);
    this.disposed = true;
    this.ids = null;
    this.palette.clear();
    this.object.removeFromParent();
    for (const lines of [this.source, this.contacts, this.rays, this.rings]) {
      lines.geometry.dispose();
      lines.material.dispose();
    }
  }

  private rebuild(options: CloudShadowDebugUpdate): void {
    if (!options.world) return;
    if (!this.ids) {
      this.ids = createCloudBankIds();
      const ids = [...new Set(this.ids)].filter((id) => id > 0).sort((a, b) => a - b);
      ids.forEach((id, index) => { this.palette.set(id, new THREE.Color(BANK_COLORS[index % BANK_COLORS.length])); });
    }
    const cells = selectCells(this.ids, options);
    const bankIds = [...new Set(cells.map((cell) => cell.id))];
    this.relevantBanks = bankIds.length;
    this.banks = bankIds.slice(0, CLOUD_SHADOW_DEBUG_MAX_BANKS).map((id) => ({
      id, color: this.getBankColor(id),
      cells: cells.filter((cell) => cell.id === id).slice(0, MAX_SOURCE_CELLS), contacts: []
    }));
    const sourcePositions: number[] = [], sourceColors: number[] = [];
    const contactPositions: number[] = [], contactColors: number[] = [];
    const rayPositions: number[] = [], rayColors: number[] = [];
    this.unknownContacts = 0;
    let queries = 0;
    for (let index = 0; index < CLOUD_SHADOW_DEBUG_MAX_CONTACTS; index += 1) {
      const bank = this.banks[index % this.banks.length];
      const cell = bank?.cells[Math.floor(index / this.banks.length)];
      if (!cell) continue;
      queries += 1;
      const source = cloudCellCenter(cell, options.cloud.wind);
      const result = traceCloudShadowContact(options.world, source, options.basis.forward, options.minSunHeight);
      if (result.kind === "unknown") this.unknownContacts += 1;
      if (result.kind !== "hit" || !insideDepth(result.point, options)) continue;
      const radius = getCloudShadowGuideRadius(result.point, options.anchor, options.cameraSize, options.basis);
      if (radius >= 1) continue;
      const contact = { source, point: result.point, normal: result.normal, radius,
        bottom: CLOUD_BASE_HEIGHT_METERS + cell.bottom * CLOUD_STEP_HEIGHT_METERS };
      bank.contacts.push(contact);
      const point = result.point.clone().addScaledVector(result.normal, 0.09);
      const color = bank.color.clone().multiplyScalar(1 - 0.7 * smoothstep(CLOUD_SHADOW_FULL_RADIUS, 1, radius));
      addContactCross(contactPositions, contactColors, point, result.normal, color, 2.2);
    }
    for (const bank of this.banks) {
      for (const cell of bank.cells) addCloudCellEdges(sourcePositions, sourceColors, cell, bank.color);
      const representative = bank.contacts.find((contact) => contact.radius < CLOUD_SHADOW_FULL_RADIUS) ?? bank.contacts[0];
      if (representative) {
        // One connector per bank keeps the air readable. Other crosses are samples.
        addSegment(rayPositions, rayColors, representative.source, representative.point, bank.color);
        const local = representative.source.clone();
        local.x -= options.cloud.wind.x;
        local.z -= options.cloud.wind.z;
        for (const height of [representative.source.y + 0.08, representative.bottom - 0.08]) {
          addContactCross(sourcePositions, sourceColors, local.clone().setY(height),
            new THREE.Vector3(0, 1, 0), bank.color, 3);
        }
      }
    }
    updateLineBuffers(this.source, sourcePositions, sourceColors);
    updateLineBuffers(this.contacts, contactPositions, contactColors);
    updateLineBuffers(this.rays, rayPositions, rayColors);
    this.rebuildRings(options);
    this.object.userData.contactQueryCount = queries;
  }

  private getBankColor(id: number): THREE.Color {
    let color = this.palette.get(id);
    if (!color) {
      color = new THREE.Color(BANK_COLORS[id % BANK_COLORS.length]);
      this.palette.set(id, color);
    }
    return color;
  }

  private rebuildRings(options: CloudShadowDebugUpdate): void {
    const positions: number[] = [], colors: number[] = [];
    if (!options.world) return;
    for (const radius of [CLOUD_SHADOW_FULL_RADIUS, 0.995]) {
      const color = new THREE.Color(radius < 0.9 ? 0xffc457 : 0xffffff);
      const points: (THREE.Vector3 | null)[] = [];
      for (let index = 0; index < RING_SEGMENTS; index += 1) {
        const angle = index * Math.PI * 2 / RING_SEGMENTS;
        const plane = options.anchor.clone()
          .addScaledVector(options.basis.right, Math.cos(angle) * radius * options.cameraSize)
          .addScaledVector(options.basis.up, Math.sin(angle) * radius * options.cameraSize);
        const source = projectCloudGuideToHeight(plane, CLOUD_TOP_HEIGHT_METERS + 1,
          options.basis.forward, options.minSunHeight);
        if (!source || source.distanceTo(options.camera.position) >= options.cloud.viewDistance) {
          points.push(null);
          continue;
        }
        const result = traceCloudShadowContact(options.world, source, options.basis.forward, options.minSunHeight);
        points.push(result.kind === "hit" && insideDepth(result.point, options)
          ? result.point.addScaledVector(result.normal, 0.09) : null);
      }
      for (let index = 0; index < points.length; index += 1) {
        const a = points[index], b = points[(index + 1) % points.length];
        // Break at unknown terrain and cliffs; depth testing hides intervening terrain.
        if (a && b && Math.abs(a.y - b.y) <= 3 && a.distanceTo(b) <= 40) {
          addSegment(positions, colors, a, b, color);
        }
      }
    }
    updateLineBuffers(this.rings, positions, colors);
  }

  private updateOverlay(coverage: number): void {
    if (!this.overlay) return;
    this.overlay.hidden = this.status === "off" || this.status === "outside-world";
    this.overlay.replaceChildren();
    this.labels = [];
    const legend = document.createElement("div");
    legend.className = "cloud-shadow-guide-legend";
    const title = document.createElement("strong");
    title.textContent = "Cloud Shadow Guides · sampled";
    legend.append(title);
    const info = document.createElement("div");
    const inactive = { "shadows-off": "Inactive: Shadow Quality is Off.",
      "cloud-shadows-off": "Inactive: Cloud Shadows is Off.", night: "Inactive: sun below the horizon.",
      "low-sun": "Inactive: low sun puts cloud casters outside the supported cloud horizon." };
    info.textContent = this.status === "active"
      ? `Nearby banks ${this.banks.length}/${this.relevantBanks} · daylight ${Math.round(coverage * 100)}%` +
        ` · ${this.banks.reduce((sum, bank) => sum + bank.contacts.length, 0)} loaded-terrain contacts`
      : inactive[this.status as keyof typeof inactive] ?? "";
    legend.append(info);
    if (this.status === "active") {
      const explanation = document.createElement("div");
      explanation.textContent = "Match cloud edges → ray → contact crosses by color. Amber: fade begins; white: map edge.";
      const limit = document.createElement("div");
      limit.textContent = `Local samples, not shadow pixels; up to 3 banks / 128 contacts, refreshed 4×/s.` +
        (this.unknownContacts ? ` ${this.unknownContacts} paths cross unloaded terrain.` : "");
      legend.append(explanation, limit);
      if (!this.banks.length) {
        const empty = document.createElement("div");
        empty.textContent = "No cloud columns in the nearby map area. Look or fly toward another bank.";
        legend.append(empty);
      }
      for (const bank of this.banks) {
        const item = document.createElement("div");
        item.style.color = `#${bank.color.getHexString()}`;
        item.textContent = `Bank ${bank.id} · ${bank.contacts.length} contacts` +
          (!bank.contacts.length ? " (no contact verified in loaded terrain)" : "");
        legend.append(item);
        const contact = bank.contacts.find((sample) => sample.radius < CLOUD_SHADOW_FULL_RADIUS) ?? bank.contacts[0];
        if (!contact) continue;
        for (const source of [true, false]) {
          const element = document.createElement("span");
          element.className = "cloud-shadow-guide-label";
          element.style.color = `#${bank.color.getHexString()}`;
          element.textContent = `${source ? "Cloud" : "Shadow"} ${bank.id}`;
          this.overlay.append(element);
          const point = source ? contact.source.clone().sub(new THREE.Vector3(this.lastWind.x, 0, this.lastWind.y))
            : contact.point.clone();
          this.labels.push({ element, point, source });
        }
      }
    }
    this.overlay.append(legend);
  }
}

function selectCells(ids: Uint16Array, options: CloudShadowDebugUpdate): GuideCell[] {
  const half = Math.min(LOCAL_HALF_SIZE, options.cameraSize);
  const corners: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const corner = projectCloudGuideToHeight(options.anchor.clone()
      .addScaledVector(options.basis.right, sx * half).addScaledVector(options.basis.up, sy * half),
    CLOUD_TOP_HEIGHT_METERS, options.basis.forward, options.minSunHeight);
    if (!corner) return [];
    corners.push(corner);
  }
  const wind = options.cloud.wind;
  const toCell = (coordinate: number, offset: number): number =>
    Math.floor((coordinate - offset + CLOUD_TILE_SIZE_METERS / 2) / CLOUD_CELL_SIZE_METERS);
  const minX = toCell(Math.min(...corners.map((p) => p.x)), wind.x) - 1;
  const maxX = toCell(Math.max(...corners.map((p) => p.x)), wind.x) + 1;
  const minZ = toCell(Math.min(...corners.map((p) => p.z)), wind.z) - 1;
  const maxZ = toCell(Math.max(...corners.map((p) => p.z)), wind.z) + 1;
  const cells: GuideCell[] = [];
  for (let z = minZ; z <= maxZ; z += 1) for (let x = minX; x <= maxX; x += 1) {
    const id = getCloudBankId(ids, x, z);
    if (!id) continue;
    const column = sampleCloudColumn(x, z);
    const cell = { x, z, id, ...column, radius: 0 };
    const source = cloudCellCenter(cell, wind);
    cell.radius = getCloudShadowGuideRadius(source, options.anchor, options.cameraSize, options.basis);
    if (cell.radius >= 1 || !insideDepth(source, options) ||
      source.distanceTo(options.camera.position) >= options.cloud.viewDistance) continue;
    cells.push(cell);
  }
  return cells.sort((a, b) => a.radius - b.radius || a.id - b.id || a.z - b.z || a.x - b.x);
}

function cloudCellCenter(cell: GuideCell, wind: CloudWindOffset): THREE.Vector3 {
  return new THREE.Vector3((cell.x + 0.5) * CLOUD_CELL_SIZE_METERS - CLOUD_TILE_SIZE_METERS / 2 + wind.x,
    CLOUD_BASE_HEIGHT_METERS + cell.top * CLOUD_STEP_HEIGHT_METERS,
    (cell.z + 0.5) * CLOUD_CELL_SIZE_METERS - CLOUD_TILE_SIZE_METERS / 2 + wind.z);
}

function insideDepth(point: Point, options: CloudShadowDebugUpdate): boolean {
  const down = options.basis.forward;
  const depth = (point.x - options.lightPosition.x) * down.x +
    (point.y - options.lightPosition.y) * down.y + (point.z - options.lightPosition.z) * down.z;
  return depth >= options.cameraNear && depth <= options.cameraFar;
}

function addCloudCellEdges(positions: number[], colors: number[], cell: GuideCell, color: THREE.Color): void {
  const x = cell.x * CLOUD_CELL_SIZE_METERS - CLOUD_TILE_SIZE_METERS / 2;
  const z = cell.z * CLOUD_CELL_SIZE_METERS - CLOUD_TILE_SIZE_METERS / 2;
  const s = CLOUD_CELL_SIZE_METERS;
  for (const [dx, dz, a, b] of [
    [-1, 0, [x, z], [x, z + s]], [1, 0, [x + s, z + s], [x + s, z]],
    [0, -1, [x + s, z], [x, z]], [0, 1, [x, z + s], [x + s, z + s]]
  ] as const) {
    const neighbor = sampleCloudColumn(cell.x + dx, cell.z + dz);
    const low = CLOUD_BASE_HEIGHT_METERS + cell.bottom * CLOUD_STEP_HEIGHT_METERS - 0.04;
    const high = CLOUD_BASE_HEIGHT_METERS + cell.top * CLOUD_STEP_HEIGHT_METERS + 0.04;
    if (neighbor.top !== cell.top) {
      addSegment(positions, colors, new THREE.Vector3(a[0], high, a[1]), new THREE.Vector3(b[0], high, b[1]), color);
    }
    if (!neighbor.top || neighbor.bottom !== cell.bottom) {
      addSegment(positions, colors, new THREE.Vector3(a[0], low, a[1]), new THREE.Vector3(b[0], low, b[1]), color);
    }
    if (!neighbor.top) {
      addSegment(positions, colors, new THREE.Vector3(a[0], low, a[1]), new THREE.Vector3(a[0], high, a[1]), color);
    }
  }
}

function createLines(name: string, opacity: number, capacity: number): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const geometry = new THREE.BufferGeometry();
  for (const attribute of ["position", "color"]) {
    geometry.setAttribute(attribute, new THREE.BufferAttribute(new Float32Array(capacity * 3), 3)
      .setUsage(THREE.DynamicDrawUsage));
  }
  geometry.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity, depthWrite: false, toneMapped: false, fog: false
  }));
  lines.name = name;
  lines.frustumCulled = false;
  lines.renderOrder = 900;
  return lines;
}

function updateLineBuffers(lines: THREE.LineSegments, positions: number[], colors: number[]): void {
  const position = lines.geometry.getAttribute("position") as THREE.BufferAttribute;
  const color = lines.geometry.getAttribute("color") as THREE.BufferAttribute;
  const count = Math.min(positions.length, position.array.length);
  for (let index = 0; index < count; index += 1) {
    position.array[index] = positions[index];
    color.array[index] = colors[index];
  }
  position.addUpdateRange(0, count);
  color.addUpdateRange(0, count);
  position.needsUpdate = true;
  color.needsUpdate = true;
  lines.geometry.setDrawRange(0, Math.floor(count / 6) * 2);
}

function addSegment(positions: number[], colors: number[], a: Point, b: Point, color: THREE.Color): void {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
}

function addContactCross(positions: number[], colors: number[], point: THREE.Vector3,
  normal: THREE.Vector3, color: THREE.Color, size: number): void {
  const a = Math.abs(normal.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const b = new THREE.Vector3().crossVectors(normal, a).normalize();
  for (const axis of [a, b]) {
    addSegment(positions, colors, point.clone().addScaledVector(axis, -size),
      point.clone().addScaledVector(axis, size), color);
  }
}

function modulo(value: number, size: number): number { return ((value % size) + size) % size; }
function smoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
