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
import { computePressurePass } from "./calcutate/pressure";
import { computePressureForcePass } from "./calcutate/pressureForce";
import { computeIntegratePass } from "./calcutate/integrate";
import { computeViscosityPass } from "./calcutate/viscosity";
import type { UniformTypeOf } from "../../types/UniformType";

export class Particles {
  private boxWidth!: UniformTypeOf<number>;
  private boxHeight!: UniformTypeOf<number>;
  private boxDepth!: UniformTypeOf<number>;
  private particleCount!: number;
  private positionsBuffer!: StorageBufferType;
  private velocitiesBuffer!: StorageBufferType;
  private densitiesBuffer!: StorageBufferType;
  private pressuresBuffer!: StorageBufferType;
  private pressureForcesBuffer!: StorageBufferType;
  private viscosityForcesBuffer!: StorageBufferType;

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
  private h6!: number;
  private h9!: number;
  private poly6Kernel!: number;
  private spiky!: number;
  private restDensity!: number;
  private pressureStiffness!: number;
  private viscosity!: number;
  private viscosityMu!: number;

  constructor(
    boxWidth: UniformTypeOf<number>,
    boxHeight: UniformTypeOf<number>,
    boxDepth: UniformTypeOf<number>,
    renderer: THREE.WebGPURenderer
  ) {
    this.renderer = renderer;

    this.boxWidth = boxWidth;
    this.boxHeight = boxHeight;
    this.boxDepth = boxDepth;
    this.particleCount = 1000;
    this.delta = 1 / 60;
    this.restitution = 0.1;
    this.mass = 0.2;
    this.h = 1.0;
    this.h2 = Math.pow(this.h, 2);
    this.h3 = Math.pow(this.h, 3);
    this.h6 = Math.pow(this.h, 6);
    this.h9 = Math.pow(this.h, 9);
    this.restDensity = 0.8;
    this.pressureStiffness = 100;
    this.poly6Kernel = 315 / (64 * Math.PI * this.h9);
    this.spiky = -45 / (Math.PI * this.h6);
    this.viscosity = 45 / (Math.PI * this.h6);
    this.viscosityMu = 0.12;
    this.positionsBuffer = instancedArray(this.particleCount, "vec3");
    this.velocitiesBuffer = instancedArray(this.particleCount, "vec3");
    this.densitiesBuffer = instancedArray(this.particleCount, "float");
    this.pressuresBuffer = instancedArray(this.particleCount, "float");
    this.pressureForcesBuffer = instancedArray(this.particleCount, "vec3");
    this.viscosityForcesBuffer = instancedArray(this.particleCount, "vec3");
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

  private computeGravity() {
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
  private computeDensity() {
    const densityCompute = computeDensityPass(
      this.positionsBuffer,
      this.densitiesBuffer,
      this.particleCount,
      this.poly6Kernel,
      this.h2,
      this.h6,
      this.mass
    )().compute(this.particleCount);
    this.renderer.computeAsync(densityCompute);
  }

  private computePressure() {
    const pressureCompute = computePressurePass(
      this.densitiesBuffer,
      this.pressuresBuffer,
      this.restDensity,
      this.pressureStiffness
    )().compute(this.particleCount);
    this.renderer.computeAsync(pressureCompute);
  }

  private computePressureForce() {
    const pressureForceCompute = computePressureForcePass(
      this.positionsBuffer,
      this.densitiesBuffer,
      this.pressuresBuffer,
      this.pressureForcesBuffer,
      this.particleCount,
      this.mass,
      this.h,
      this.spiky
    )().compute(this.particleCount);
    this.renderer.computeAsync(pressureForceCompute);
  }

  private computeViscosity() {
    const viscosityCompute = computeViscosityPass(
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.densitiesBuffer,
      this.viscosityForcesBuffer,
      this.particleCount,
      this.viscosity,
      this.viscosityMu,
      this.h,
      this.mass
    )().compute(this.particleCount);
    this.renderer.computeAsync(viscosityCompute);
  }

  private computeIntegrate() {
    const integrateCompute = computeIntegratePass(
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.pressureForcesBuffer,
      this.viscosityForcesBuffer,
      this.mass,
      this.delta
    )().compute(this.particleCount);
    this.renderer.computeAsync(integrateCompute);
  }

  public compute() {
    this.computeGravity();
    this.computeDensity();
    this.computePressure();
    this.computePressureForce();
    this.computeViscosity();
    this.computeIntegrate();
  }
}
