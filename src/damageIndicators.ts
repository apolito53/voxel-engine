import * as THREE from "three";

const DEFAULT_INDICATOR_TTL_MS = 1400;
const MAX_DAMAGE_INDICATORS = 64;
const SCREEN_PADDING_PX = 24;

export type DamageIndicatorOptions = {
  readonly id: string;
  readonly position: THREE.Vector3;
  readonly remainingHealth: number;
  readonly maxHealth: number;
  readonly label?: string;
  readonly destroyed?: boolean;
  readonly collateral?: boolean;
  readonly ttlMs?: number;
};

type DamageIndicatorEntry = {
  readonly element: HTMLElement;
  readonly fill: HTMLElement;
  readonly label: HTMLElement;
  readonly position: THREE.Vector3;
  expiresAt: number;
};

export class DamageIndicatorOverlay {
  private readonly root: HTMLElement;
  private readonly indicators = new Map<string, DamageIndicatorEntry>();
  private readonly projectedPosition = new THREE.Vector3();
  private readonly cameraSpacePosition = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(options: DamageIndicatorOptions): void {
    const maxHealth = Math.max(0.001, options.maxHealth);
    const remainingHealth = Math.max(0, options.remainingHealth);
    const ratio = options.destroyed === true ? 1 : clamp01(remainingHealth / maxHealth);
    const entry = this.getOrCreateEntry(options.id);

    entry.position.copy(options.position);
    entry.expiresAt = performance.now() + (options.ttlMs ?? DEFAULT_INDICATOR_TTL_MS);
    entry.fill.style.transform = `scaleX(${ratio})`;
    entry.label.textContent = options.label ?? `${formatHealth(remainingHealth)} / ${formatHealth(maxHealth)}`;
    entry.element.hidden = false;
    entry.element.classList.toggle("is-destroyed", options.destroyed === true);
    entry.element.classList.toggle("is-collateral", options.collateral === true);

    this.pruneOverflow();
  }

  update(camera: THREE.Camera, viewportWidth: number, viewportHeight: number): void {
    const now = performance.now();

    for (const [id, entry] of this.indicators) {
      if (now >= entry.expiresAt) {
        this.removeEntry(id, entry);
        continue;
      }

      if (!this.projectEntry(entry, camera, viewportWidth, viewportHeight)) {
        entry.element.hidden = true;
      }
    }
  }

  clear(): void {
    for (const [id, entry] of this.indicators) {
      this.removeEntry(id, entry);
    }
  }

  dispose(): void {
    this.clear();
  }

  private getOrCreateEntry(id: string): DamageIndicatorEntry {
    const existing = this.indicators.get(id);
    if (existing) return existing;

    const element = document.createElement("div");
    element.className = "damage-indicator";

    const bar = document.createElement("div");
    bar.className = "damage-indicator-bar";

    const fill = document.createElement("div");
    fill.className = "damage-indicator-fill";
    bar.appendChild(fill);

    const label = document.createElement("div");
    label.className = "damage-indicator-label";

    element.append(bar, label);
    this.root.appendChild(element);

    const entry = {
      element,
      fill,
      label,
      position: new THREE.Vector3(),
      expiresAt: 0
    };
    this.indicators.set(id, entry);
    return entry;
  }

  private projectEntry(
    entry: DamageIndicatorEntry,
    camera: THREE.Camera,
    viewportWidth: number,
    viewportHeight: number
  ): boolean {
    // Three.js cameras look down local -Z. If the marker is behind the camera,
    // projection can still produce finite screen coordinates, so reject it in
    // camera space before writing CSS positions.
    this.cameraSpacePosition.copy(entry.position).applyMatrix4(camera.matrixWorldInverse);
    if (this.cameraSpacePosition.z > 0) return false;

    this.projectedPosition.copy(entry.position).project(camera);
    if (
      this.projectedPosition.x < -1 ||
      this.projectedPosition.x > 1 ||
      this.projectedPosition.y < -1 ||
      this.projectedPosition.y > 1
    ) {
      return false;
    }

    const x = (this.projectedPosition.x * 0.5 + 0.5) * viewportWidth;
    const y = (-this.projectedPosition.y * 0.5 + 0.5) * viewportHeight;
    if (
      x < -SCREEN_PADDING_PX ||
      x > viewportWidth + SCREEN_PADDING_PX ||
      y < -SCREEN_PADDING_PX ||
      y > viewportHeight + SCREEN_PADDING_PX
    ) {
      return false;
    }

    entry.element.hidden = false;
    entry.element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
    return true;
  }

  private pruneOverflow(): void {
    if (this.indicators.size <= MAX_DAMAGE_INDICATORS) return;

    const oldestEntries = Array.from(this.indicators.entries())
      .sort((left, right) => left[1].expiresAt - right[1].expiresAt);

    while (this.indicators.size > MAX_DAMAGE_INDICATORS) {
      const oldest = oldestEntries.shift();
      if (!oldest) return;
      this.removeEntry(oldest[0], oldest[1]);
    }
  }

  private removeEntry(id: string, entry: DamageIndicatorEntry): void {
    entry.element.remove();
    this.indicators.delete(id);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function formatHealth(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}
