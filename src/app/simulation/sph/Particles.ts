import {
  float,
  Fn,
  hash,
  instancedArray,
  instanceIndex,
  uint,
  vec3,
  positionLocal,
} from "three/tsl";
import * as THREE from "three/webgpu";

export class Particles {
  private boxWidth!: number;
  private boxHeight!: number;
  private boxDepth!: number;
  private particleCount!: number;
  private positionsBuffer!: THREE.TSL.ShaderNodeObject<THREE.StorageBufferNode>;
  private renderer!: THREE.WebGPURenderer;

  private sphereGeometry!: THREE.SphereGeometry;
  private sphereMaterial!: THREE.MeshBasicNodeMaterial;
  private sphereMesh!: THREE.InstancedMesh;

  constructor(
    boxWidth: number,
    boxHeight: number,
    boxDepth: number,
    renderer: THREE.WebGPURenderer
  ) {
    this.boxWidth = boxWidth;
    this.boxHeight = boxHeight;
    this.boxDepth = boxDepth;
    this.particleCount = 1000;
    this.positionsBuffer = instancedArray(this.particleCount, "vec4");
    this.renderer = renderer;
  }

  public initialize() {
    this.initializeParticlePositions();
    this.createGeometry();
    this.createMaterial();
    this.createMesh();
  }

  private initializeParticlePositions() {
    const init = Fn(() => {
      const pos = this.positionsBuffer.element(instanceIndex);
      const seed = instanceIndex.mul(0xffffff);

      const x = hash(instanceIndex.mul(1664525))
        .sub(0.5)
        .mul(float(this.boxWidth));
      const y = hash(instanceIndex.mul(22695477))
        .sub(0.5)
        .mul(float(this.boxHeight));
      const z = hash(instanceIndex.mul(747796405))
        .sub(0.5)
        .mul(float(this.boxDepth));

      const initialPosition = vec3(x, y, z);
      pos.assign(initialPosition);
    });
    const initCompute = init().compute(this.particleCount);
    this.renderer.computeAsync(initCompute);
  }

  private createGeometry() {
    this.sphereGeometry = new THREE.SphereGeometry(0.1, 10, 10);
  }

  private createMaterial() {
    this.sphereMaterial = new THREE.MeshBasicNodeMaterial({
      color: 0xff00ff,
      // side: THREE.DoubleSide,
    });

    this.sphereMaterial.positionNode = positionLocal.add(
      this.positionsBuffer.toAttribute()
    );
  }

  private createMesh() {
    this.sphereMesh = new THREE.InstancedMesh(
      this.sphereGeometry,
      this.sphereMaterial,
      this.particleCount
    );
  }

  public addToScene(scene: THREE.Scene) {
    scene.add(this.sphereMesh);
  }

  public getPositionsBuffer(): THREE.TSL.ShaderNodeObject<THREE.StorageBufferNode> {
    return this.positionsBuffer;
  }
}
