import * as THREE from "three/webgpu";
import { abs, float, Fn, positionLocal } from "three/tsl";
import type { UniformTypeOf } from "../../types/UniformType";
import type { BoundaryConfig } from "./BoundaryConfig";

export class BoxBoundary {
  private widthNode!: UniformTypeOf<number>;
  private heightNode!: UniformTypeOf<number>;
  private depthNode!: UniformTypeOf<number>;
  private material!: THREE.MeshBasicNodeMaterial;
  private mesh!: THREE.Mesh;

  private xMin: number;
  private waterMode = true;
  private boundaryConfig: BoundaryConfig;

  constructor(boundaryConfig: BoundaryConfig) {
    this.boundaryConfig = boundaryConfig;
    this.widthNode = boundaryConfig.width;
    this.heightNode = boundaryConfig.height;
    this.depthNode = boundaryConfig.depth;
    this.xMin = boundaryConfig.xMin;
  }

  public createGeometry(): THREE.BoxGeometry {
    return new THREE.BoxGeometry(
      this.widthNode.value,
      this.heightNode.value,
      this.depthNode.value
    );
  }

  public createMaterial(): THREE.MeshBasicNodeMaterial {
    this.material = new THREE.MeshBasicNodeMaterial({
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    this.updateMaterialOpacityNode();

    return this.material;
  }

  private updateMaterialOpacityNode(): void {
    this.material.opacityNode = Fn(() => {
      const edgeWidth = float(0.05);
      const isXEdge = abs(positionLocal.x).greaterThan(
        this.widthNode.div(2).sub(edgeWidth)
      );
      const isYEdge = abs(positionLocal.y).greaterThan(
        this.heightNode.div(2).sub(edgeWidth)
      );
      const isZEdge = abs(positionLocal.z).greaterThan(
        this.depthNode.div(2).sub(edgeWidth)
      );
      const edgeXY = isXEdge.and(isYEdge);
      const edgeXZ = isXEdge.and(isZEdge);
      const edgeYZ = isYEdge.and(isZEdge);
      const isEdge = edgeXY.or(edgeXZ).or(edgeYZ);
      return isEdge.select(float(1.0), float(0));
    })();
  }

  public createMesh(): THREE.Mesh {
    this.mesh = new THREE.Mesh(this.createGeometry(), this.createMaterial());
    this.updateMeshPosition();
    this.updateVisibility();
    return this.mesh;
  }

  // The left wall stays at xMin; only the right wall follows the width.
  private updateMeshPosition(): void {
    this.mesh.position.x = this.xMin + this.widthNode.value / 2;
  }

  public addToScene(scene: THREE.Scene): void {
    scene.add(this.createMesh());
  }

  public setWaterMode(enabled: boolean): void {
    this.waterMode = enabled;
    this.updateVisibility();
  }

  public updateVisibility(): void {
    if (this.mesh) this.mesh.visible = !this.waterMode || this.boundaryConfig.showFrameInWater;
  }

  public getSizes(): { width: number; height: number; depth: number } {
    return {
      width: this.widthNode.value,
      height: this.heightNode.value,
      depth: this.depthNode.value,
    };
  }

  public getSizesNodes(): {
    width: UniformTypeOf<number>;
    height: UniformTypeOf<number>;
    depth: UniformTypeOf<number>;
  } {
    return {
      width: this.widthNode,
      height: this.heightNode,
      depth: this.depthNode,
    };
  }

  public updateSizes(): void {
    if (this.mesh && this.mesh.geometry) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = this.createGeometry();
      this.updateMeshPosition();
    }
  }
}
