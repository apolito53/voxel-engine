import * as THREE from "three";
import type { VoxelBlockPosition } from "./raycast";
import type { TerraformerSubCellBounds } from "./world";

const OUTLINE_SCALE = 1.01;
const SUB_CELL_OUTLINE_EXPAND = 0.003;
const TARGET_BLOCK_LINE_COLOR = 0x050505;
const TARGET_RUBBLE_LINE_COLOR = 0xffffff;
const TARGET_LINE_OPACITY = 0.92;

export type TargetHighlightKind = "block" | "rubble";

export class TargetBlockHighlighter {
  readonly object: THREE.Group;
  private readonly blockMaterial: THREE.LineBasicMaterial;
  private readonly subCellMaterial: THREE.LineBasicMaterial;
  private readonly blockOutline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  private readonly subCellOutline: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

  constructor() {
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const geometry = new THREE.EdgesGeometry(boxGeometry);
    boxGeometry.dispose();
    this.blockMaterial = new THREE.LineBasicMaterial({
      color: TARGET_BLOCK_LINE_COLOR,
      depthTest: true,
      depthWrite: false,
      opacity: TARGET_LINE_OPACITY,
      transparent: true
    });
    this.subCellMaterial = this.blockMaterial.clone();
    this.subCellMaterial.color.setHex(TARGET_BLOCK_LINE_COLOR);

    this.object = new THREE.Group();
    this.blockOutline = new THREE.LineSegments(geometry, this.blockMaterial);
    this.subCellOutline = new THREE.LineSegments(new THREE.BufferGeometry(), this.subCellMaterial);
    this.object.add(this.blockOutline, this.subCellOutline);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
    this.blockOutline.scale.setScalar(OUTLINE_SCALE);
    this.subCellOutline.frustumCulled = false;
    this.hide();
  }

  showBlock(block: VoxelBlockPosition, kind: TargetHighlightKind = "block"): void {
    // The outline is slightly larger than one block so it sits just above the
    // voxel faces instead of z-fighting with the terrain mesh.
    this.blockMaterial.color.setHex(kind === "rubble" ? TARGET_RUBBLE_LINE_COLOR : TARGET_BLOCK_LINE_COLOR);
    this.blockOutline.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
    this.blockOutline.visible = true;
    this.subCellOutline.visible = false;
    this.object.visible = true;
  }

  showSubCells(cells: readonly TerraformerSubCellBounds[]): void {
    const positions: number[] = [];
    for (const cell of cells) {
      appendBoxEdges(positions, expandBounds(cell, SUB_CELL_OUTLINE_EXPAND));
    }

    this.subCellOutline.geometry.dispose();
    this.subCellOutline.geometry = new THREE.BufferGeometry();
    this.subCellOutline.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.subCellOutline.geometry.computeBoundingSphere();
    this.blockOutline.visible = false;
    this.subCellOutline.visible = positions.length > 0;
    this.object.visible = positions.length > 0;
  }

  hide(): void {
    this.object.visible = false;
    this.blockOutline.visible = false;
    this.subCellOutline.visible = false;
  }

  dispose(): void {
    this.blockOutline.geometry.dispose();
    this.subCellOutline.geometry.dispose();
    this.blockMaterial.dispose();
    this.subCellMaterial.dispose();
  }
}

function expandBounds(bounds: TerraformerSubCellBounds, amount: number): TerraformerSubCellBounds {
  return {
    minX: bounds.minX - amount,
    maxX: bounds.maxX + amount,
    minY: bounds.minY - amount,
    maxY: bounds.maxY + amount,
    minZ: bounds.minZ - amount,
    maxZ: bounds.maxZ + amount
  };
}

function appendBoxEdges(positions: number[], bounds: TerraformerSubCellBounds): void {
  const corners = [
    [bounds.minX, bounds.minY, bounds.minZ],
    [bounds.maxX, bounds.minY, bounds.minZ],
    [bounds.maxX, bounds.maxY, bounds.minZ],
    [bounds.minX, bounds.maxY, bounds.minZ],
    [bounds.minX, bounds.minY, bounds.maxZ],
    [bounds.maxX, bounds.minY, bounds.maxZ],
    [bounds.maxX, bounds.maxY, bounds.maxZ],
    [bounds.minX, bounds.maxY, bounds.maxZ]
  ] as const;
  const edgePairs = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ] as const;

  for (const [from, to] of edgePairs) {
    positions.push(...corners[from], ...corners[to]);
  }
}
