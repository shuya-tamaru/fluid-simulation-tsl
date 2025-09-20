import {
  float,
  Fn,
  hash,
  instancedArray,
  instanceIndex,
  vec3,
  positionLocal,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../types/BufferType";
import { computeGravityPass } from "./calcutate/gravity";
import { computeDensityPass } from "./calcutate/dencity";

export class Particles {
  private boxWidth!: number;
  private boxHeight!: number;
  private boxDepth!: number;
  private particleCount!: number;
  private positionsBuffer!: StorageBufferType;
  private velocitiesBuffer!: StorageBufferType;
  private densitiesBuffer!: StorageBufferType;

  private renderer!: THREE.WebGPURenderer;

  private sphereGeometry!: THREE.SphereGeometry;
  private sphereMaterial!: THREE.MeshBasicNodeMaterial;
  private sphereMesh!: THREE.InstancedMesh;

  //params
  private delta!: number;
  private restitution!: number;
  private mass!: number;
  private h!: number;
  private h2!: number;
  private h3!: number;
  private h9!: number;
  private poly6Kernel!: number;

  constructor(
    boxWidth: number,
    boxHeight: number,
    boxDepth: number,
    renderer: THREE.WebGPURenderer
  ) {
    this.boxWidth = boxWidth;
    this.boxHeight = boxHeight;
    this.boxDepth = boxDepth;
    this.particleCount = 100;
    this.delta = 1 / 60;
    this.restitution = 0.1;
    this.mass = 0.2;
    this.h = 1.0;
    this.h2 = Math.pow(this.h, 2);
    this.h3 = Math.pow(this.h, 3);
    this.h9 = Math.pow(this.h, 9);

    this.poly6Kernel = 315 / (64 * Math.PI * this.h9);
    this.positionsBuffer = instancedArray(this.particleCount, "vec3");
    this.velocitiesBuffer = instancedArray(this.particleCount, "vec3");
    this.densitiesBuffer = instancedArray(this.particleCount, "float");
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
      const density = this.densitiesBuffer.element(instanceIndex);

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
      density.assign(float(0.0));
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
      side: THREE.DoubleSide,
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

  private async computeGravity() {
    const gravityCompute = computeGravityPass(
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.delta,
      this.restitution,
      this.boxWidth,
      this.boxHeight,
      this.boxDepth
    )().compute(this.particleCount);
    this.renderer.computeAsync(gravityCompute);
  }
  private async computeDensity() {
    const densityCompute = computeDensityPass(
      this.positionsBuffer,
      this.densitiesBuffer,
      this.particleCount,
      this.poly6Kernel,
      this.h2,
      this.mass
    )().compute(this.particleCount);
    this.renderer.computeAsync(densityCompute);
  }

  public async compute() {
    await this.computeGravity();
    await this.computeDensity();
  }
}
