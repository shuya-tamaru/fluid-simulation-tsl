import * as THREE from "three/webgpu";
import { abs, float, Fn, positionLocal } from "three/tsl";

export class BoxBoundary {
  private width!: number;
  private height!: number;
  private depth!: number;

  constructor() {
    this.width = 32;
    this.height = 16;
    this.depth = 16;
  }

  public createGeometry(): THREE.BoxGeometry {
    return new THREE.BoxGeometry(this.width, this.height, this.depth);
  }

  public createMaterial(): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial({
      color: 0xffffff,
      transparent: true,
      side: THREE.DoubleSide,
    });
    material.opacityNode = Fn(() => {
      const edgeWidth = float(0.05);
      const isXEdge = abs(positionLocal.x).greaterThan(
        float(this.width / 2).sub(edgeWidth)
      );
      const isYEdge = abs(positionLocal.y).greaterThan(
        float(this.height / 2).sub(edgeWidth)
      );
      const isZEdge = abs(positionLocal.z).greaterThan(
        float(this.depth / 2).sub(edgeWidth)
      );
      const edgeXY = isXEdge.and(isYEdge);
      const edgeXZ = isXEdge.and(isZEdge);
      const edgeYZ = isYEdge.and(isZEdge);

      const isEdge = edgeXY.or(edgeXZ).or(edgeYZ);

      return isEdge.select(float(1.0), float(0));
    })();

    return material;
  }

  public createMesh(): THREE.Mesh {
    return new THREE.Mesh(this.createGeometry(), this.createMaterial());
  }

  public addToScene(scene: THREE.Scene): void {
    scene.add(this.createMesh());
  }

  public getSizes(): { width: number; height: number; depth: number } {
    return { width: this.width, height: this.height, depth: this.depth };
  }
}
