import * as THREE from "three";
import type { BuilderBrushCell } from "./builderTools";

const PREVIEW_FILL_OPACITY = 0.32;
const PREVIEW_EDGE_COLOR = 0xffe28b;
const PREVIEW_EDGE_OPACITY = 0.92;
const PREVIEW_BOX_SCALE = 1.004;

export type BuilderBrushPreviewOptions = {
  readonly cells: readonly BuilderBrushCell[];
  readonly color: THREE.ColorRepresentation;
};

export class BuilderBrushPreview {
  readonly object: THREE.Group;
  private readonly fillMaterial: THREE.MeshBasicMaterial;
  private readonly edgeMaterial: THREE.LineBasicMaterial;
  private readonly fillGeometry: THREE.BoxGeometry;
  private readonly edgeObject: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private fillMesh: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private readonly matrix = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    this.object = new THREE.Group();
    this.object.name = "Builder brush preview";
    this.object.visible = false;

    this.fillGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.fillMaterial = new THREE.MeshBasicMaterial({
      color: 0x8fd891,
      transparent: true,
      opacity: PREVIEW_FILL_OPACITY,
      depthTest: true,
      depthWrite: false
    });

    this.fillMesh = new THREE.InstancedMesh(this.fillGeometry, this.fillMaterial, 1);
    this.fillMesh.name = "Builder ghost fill";
    this.fillMesh.frustumCulled = false;
    this.fillMesh.renderOrder = 930;
    this.fillMesh.count = 0;
    this.object.add(this.fillMesh);

    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: PREVIEW_EDGE_COLOR,
      transparent: true,
      opacity: PREVIEW_EDGE_OPACITY,
      depthTest: false,
      depthWrite: false
    });
    this.edgeObject = new THREE.LineSegments(new THREE.BufferGeometry(), this.edgeMaterial);
    this.edgeObject.name = "Builder ghost edges";
    this.edgeObject.frustumCulled = false;
    this.edgeObject.renderOrder = 931;
    this.object.add(this.edgeObject);

    scene.add(this.object);
  }

  update(options: BuilderBrushPreviewOptions): void {
    if (options.cells.length === 0) {
      this.hide();
      return;
    }

    this.ensureFillCapacity(options.cells.length);
    this.fillMaterial.color.set(options.color);
    this.edgeMaterial.color.setHex(PREVIEW_EDGE_COLOR);

    const edgePositions: number[] = [];
    for (let index = 0; index < options.cells.length; index += 1) {
      const cell = options.cells[index];
      this.matrix.compose(
        new THREE.Vector3(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5),
        new THREE.Quaternion(),
        new THREE.Vector3(PREVIEW_BOX_SCALE, PREVIEW_BOX_SCALE, PREVIEW_BOX_SCALE)
      );
      this.fillMesh.setMatrixAt(index, this.matrix);
      addBoxEdges(edgePositions, cell, PREVIEW_BOX_SCALE);
    }

    this.fillMesh.count = options.cells.length;
    this.fillMesh.instanceMatrix.needsUpdate = true;
    this.replaceEdgeGeometry(edgePositions);
    this.object.visible = true;
  }

  hide(): void {
    this.object.visible = false;
    this.fillMesh.count = 0;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.fillMesh.dispose();
    this.fillGeometry.dispose();
    this.fillMaterial.dispose();
    this.edgeMaterial.dispose();
    this.edgeObject.geometry.dispose();
  }

  private ensureFillCapacity(requiredCount: number): void {
    if (requiredCount <= this.fillMesh.instanceMatrix.count) return;

    const replacement = new THREE.InstancedMesh(this.fillGeometry, this.fillMaterial, requiredCount);
    replacement.name = this.fillMesh.name;
    replacement.frustumCulled = this.fillMesh.frustumCulled;
    replacement.renderOrder = this.fillMesh.renderOrder;
    replacement.count = 0;
    this.object.remove(this.fillMesh);
    this.fillMesh.dispose();
    this.fillMesh = replacement;
    this.object.add(this.fillMesh);
  }

  private replaceEdgeGeometry(positions: readonly number[]): void {
    this.edgeObject.geometry.dispose();
    this.edgeObject.geometry = new THREE.BufferGeometry();
    this.edgeObject.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  }
}

function addBoxEdges(positions: number[], cell: BuilderBrushCell, scale: number): void {
  const padding = (scale - 1) / 2;
  const minX = cell.x - padding;
  const minY = cell.y - padding;
  const minZ = cell.z - padding;
  const maxX = cell.x + 1 + padding;
  const maxY = cell.y + 1 + padding;
  const maxZ = cell.z + 1 + padding;
  const corners = [
    [minX, minY, minZ],
    [maxX, minY, minZ],
    [maxX, maxY, minZ],
    [minX, maxY, minZ],
    [minX, minY, maxZ],
    [maxX, minY, maxZ],
    [maxX, maxY, maxZ],
    [minX, maxY, maxZ]
  ] as const;
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ] as const;

  for (const [a, b] of edges) {
    positions.push(...corners[a], ...corners[b]);
  }
}
