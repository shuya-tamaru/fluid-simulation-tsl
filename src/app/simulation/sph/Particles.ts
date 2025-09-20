import {
  float,
  Fn,
  hash,
  instancedArray,
  instanceIndex,
  vec3,
  positionLocal,
  If,
  abs,
  sign,
} from "three/tsl";
import * as THREE from "three/webgpu";

export class Particles {
  private boxWidth!: number;
  private boxHeight!: number;
  private boxDepth!: number;
  private particleCount!: number;
  private positionsBuffer!: THREE.TSL.ShaderNodeObject<THREE.StorageBufferNode>;
  private velocitiesBuffer!: THREE.TSL.ShaderNodeObject<THREE.StorageBufferNode>;

  private renderer!: THREE.WebGPURenderer;

  private sphereGeometry!: THREE.SphereGeometry;
  private sphereMaterial!: THREE.MeshBasicNodeMaterial;
  private sphereMesh!: THREE.InstancedMesh;

  //params
  private delta!: number;
  public restitution!: number;

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
    this.delta = 1 / 60;
    this.restitution = 0.1;
    this.positionsBuffer = instancedArray(this.particleCount, "vec3");
    this.velocitiesBuffer = instancedArray(this.particleCount, "vec3");
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
      const vel = this.velocitiesBuffer.element(instanceIndex);

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
      const initialVelocity = vec3(0, 0, 0);

      pos.assign(initialPosition);
      vel.assign(initialVelocity);
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

  public compute() {
    const compute = Fn(() => {
      const pos = this.positionsBuffer.element(instanceIndex);
      const vel = this.velocitiesBuffer.element(instanceIndex);
      const gravity = vec3(0, -9.8, 0);

      const newPos = pos.add(vel.mul(float(this.delta))).toVar();
      const newVel = vel.add(gravity.mul(float(this.delta))).toVar();

      If(abs(newPos.x).greaterThan(float(this.boxWidth / 2)), () => {
        newPos.x.assign(float(this.boxWidth / 2).mul(sign(newPos.x)));
        const dumpVel = newVel.x.mul(-1.0).mul(float(1.0 - this.restitution));
        newVel.x.assign(dumpVel);
      });

      If(abs(newPos.y).greaterThan(float(this.boxHeight / 2)), () => {
        newPos.y.assign(float(this.boxHeight / 2).mul(sign(newPos.y)));
        const dumpVel = newVel.y.mul(-1.0).mul(float(1.0 - this.restitution));
        newVel.y.assign(dumpVel);
      });

      If(abs(newPos.z).greaterThan(float(this.boxDepth / 2)), () => {
        newPos.z.assign(float(this.boxDepth / 2).mul(sign(newPos.z)));
        const dumpVel = newVel.z.mul(-1.0).mul(float(1.0 - this.restitution));
        newVel.z.assign(dumpVel);
      });

      vel.assign(newVel);
      pos.assign(newPos);
    });
    const computeCompute = compute().compute(this.particleCount);
    this.renderer.computeAsync(computeCompute);
  }
}
