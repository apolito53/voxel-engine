import * as THREE from "three";
import type { VoxelBlockPosition } from "./raycast";

const OUTLINE_SCALE = 1.01;
const TARGET_BLOCK_LINE_COLOR = 0x050505;
const TARGET_RUBBLE_LINE_COLOR = 0xffffff;
const TARGET_LINE_OPACITY = 0.92;

export type TargetHighlightKind = "block" | "rubble";

export class TargetBlockHighlighter {
  readonly object: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  private readonly material: THREE.LineBasicMaterial;

  constructor() {
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const geometry = new THREE.EdgesGeometry(boxGeometry);
    boxGeometry.dispose();
    this.material = new THREE.LineBasicMaterial({
      color: TARGET_BLOCK_LINE_COLOR,
      depthTest: true,
      depthWrite: false,
      opacity: TARGET_LINE_OPACITY,
      transparent: true
    });

    this.object = new THREE.LineSegments(geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
    this.object.scale.setScalar(OUTLINE_SCALE);
    this.hide();
  }

  showBlock(block: VoxelBlockPosition, kind: TargetHighlightKind = "block"): void {
    // The outline is slightly larger than one block so it sits just above the
    // voxel faces instead of z-fighting with the terrain mesh.
    this.material.color.setHex(kind === "rubble" ? TARGET_RUBBLE_LINE_COLOR : TARGET_BLOCK_LINE_COLOR);
    this.object.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
    this.object.visible = true;
  }

  hide(): void {
    this.object.visible = false;
  }

  dispose(): void {
    this.object.geometry.dispose();
    const material = this.object.material;
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
      return;
    }
    material.dispose();
  }
}
