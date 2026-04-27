import * as THREE from "three";
import type { VoxelBlockPosition } from "./raycast";

const OUTLINE_SCALE = 1.01;
const TARGET_LINE_COLOR = 0x050505;
const TARGET_LINE_OPACITY = 0.92;

export class TargetBlockHighlighter {
  readonly object: THREE.LineSegments;

  constructor() {
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const material = new THREE.LineBasicMaterial({
      color: TARGET_LINE_COLOR,
      depthTest: true,
      depthWrite: false,
      opacity: TARGET_LINE_OPACITY,
      transparent: true
    });

    this.object = new THREE.LineSegments(geometry, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
    this.object.scale.setScalar(OUTLINE_SCALE);
    this.hide();
  }

  showBlock(block: VoxelBlockPosition): void {
    // The outline is slightly larger than one block so it sits just above the
    // voxel faces instead of z-fighting with the terrain mesh.
    this.object.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
    this.object.visible = true;
  }

  hide(): void {
    this.object.visible = false;
  }
}
