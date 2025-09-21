import {
  float,
  Fn,
  hash,
  instancedArray,
  instanceIndex,
  vec3,
  positionLocal,
  normalLocal,
  clamp,
  If,
  mix,
  max,
  struct,
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
import { computeCellIndicesPass } from "./calcutate/cellIndices";
import { computeCellStartIndicesPass } from "./calcutate/cellStartIndices";
import { computeReorderParticlePass } from "./calcutate/reorderParticle";
import { computeResetCalcPass } from "./calcutate/resetCalc";

export class Particles {
  private boxWidth!: UniformTypeOf<number>;
  private boxHeight!: UniformTypeOf<number>;
  private boxDepth!: UniformTypeOf<number>;
  public particleCount!: number;

  private cellIndicesBuffer!: StorageBufferType;
  private cellCountsBuffer!: StorageBufferType;
  private cellStartIndicesBuffer!: StorageBufferType;
  private reorderedPositionsBuffer!: StorageBufferType;
  private reorderedVelocitiesBuffer!: StorageBufferType;
  private offsetsBuffer!: StorageBufferType;

  private positionsBuffer!: StorageBufferType;
  private velocitiesBuffer!: StorageBufferType;
  private densitiesBuffer!: StorageBufferType;
  private pressuresBuffer!: StorageBufferType;
  private pressureForcesBuffer!: StorageBufferType;
  private viscosityForcesBuffer!: StorageBufferType;

  private renderer!: THREE.WebGPURenderer;
  private scene!: THREE.Scene;

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
  private maxSpeed!: number;
  private cellSize!: number;
  private cellCountX!: number;
  private cellCountY!: number;
  private cellCountZ!: number;
  private totalCellCount!: number;
  private xMinCoord!: number;
  private yMinCoord!: number;
  private zMinCoord!: number;

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
    this.particleCount = 5000;
    this.delta = 1 / 60;
    this.restitution = 0.1;
    this.mass = 0.3;
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
    this.maxSpeed = 15;
    //neighbor search
    this.cellSize = this.h;
    this.cellCountX = Math.floor(this.boxWidth.value / this.cellSize);
    this.cellCountY = Math.floor(this.boxHeight.value / this.cellSize);
    this.cellCountZ = Math.floor(this.boxDepth.value / this.cellSize);
    this.totalCellCount = this.cellCountX * this.cellCountY * this.cellCountZ;
    this.xMinCoord = -this.boxWidth.value / 2;
    this.yMinCoord = -this.boxHeight.value / 2;
    this.zMinCoord = -this.boxDepth.value / 2;
  }

  public async initialize() {
    this.initializeParticleBuffers();
    await this.initializeParticlePositions();
    this.createGeometry();
    this.createMaterial();
    this.createMesh();
  }

  private initializeParticleBuffers() {
    this.cellIndicesBuffer = instancedArray(this.particleCount, "uint");
    this.cellCountsBuffer = instancedArray(this.totalCellCount, "uint");
    this.cellStartIndicesBuffer = instancedArray(this.totalCellCount, "uint");
    this.offsetsBuffer = instancedArray(this.totalCellCount, "uint").toAtomic();
    this.reorderedPositionsBuffer = instancedArray(this.particleCount, "vec3");
    this.reorderedVelocitiesBuffer = instancedArray(this.particleCount, "vec3");
    this.positionsBuffer = instancedArray(this.particleCount, "vec3");
    this.velocitiesBuffer = instancedArray(this.particleCount, "vec3");
    this.densitiesBuffer = instancedArray(this.particleCount, "float");
    this.pressuresBuffer = instancedArray(this.particleCount, "float");
    this.pressureForcesBuffer = instancedArray(this.particleCount, "vec3");
    this.viscosityForcesBuffer = instancedArray(this.particleCount, "vec3");
  }

  private async initializeParticlePositions() {
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
    await this.renderer.computeAsync(initCompute);
  }

  private createGeometry() {
    this.sphereGeometry = new THREE.SphereGeometry(0.15, 10, 10);
  }

  private createMaterial() {
    this.sphereMaterial = new THREE.MeshBasicNodeMaterial({
      color: 0xff00ff,
      side: THREE.DoubleSide,
    });

    this.sphereMaterial.positionNode = positionLocal.add(
      this.positionsBuffer.toAttribute()
    );
    this.updateMaterialColorNode();
  }

  // @ts-ignore
  private getColorByVelocity = Fn(([speed]) => {
    const t = clamp(
      speed.div(float(this.maxSpeed)),
      float(0.0),
      float(1.0)
    ).toVar();
    const deep = vec3(0.0, 0.05, 0.9);
    const mid = vec3(0.0, 0.6, 0.8);
    const foam = vec3(1.0, 1.0, 1.0);

    const color = vec3(0.0).toVar();

    If(t.lessThan(float(0.7)), () => {
      const k = t.div(float(0.7));
      color.assign(mix(deep, mid, k));
    }).Else(() => {
      const k = t.sub(float(0.7)).div(float(0.3));
      color.assign(mix(mid, foam, k));
    });

    return color;
  });

  private updateMaterialColorNode() {
    this.sphereMaterial.colorNode = Fn(() => {
      const normal = normalLocal.toVar();
      const lightDir = vec3(0.3, 1.0, 0.5).normalize().toVar();
      const ambient = float(0.2).toVar();
      const diffuse = max(normal.dot(lightDir), float(0.0)).toVar();
      const speed = this.velocitiesBuffer
        .element(instanceIndex)
        .length()
        .toVar();
      // @ts-ignore
      const baseColor = this.getColorByVelocity(speed);
      const shaded = baseColor
        .mul(ambient.add(diffuse.mul(float(3.2))))
        .toVar();
      return shaded;
    })();
  }

  private createMesh() {
    this.sphereMesh = new THREE.InstancedMesh(
      this.sphereGeometry,
      this.sphereMaterial,
      this.particleCount
    );
  }

  public addToScene(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.sphereMesh);
  }

  public getPositionsBuffer(): THREE.TSL.ShaderNodeObject<THREE.StorageBufferNode> {
    return this.positionsBuffer;
  }

  private computeResetCalc() {
    const resetCalcCompute = computeResetCalcPass(
      this.offsetsBuffer,
      this.cellCountsBuffer
    )().compute(this.totalCellCount);
    this.renderer.computeAsync(resetCalcCompute);
  }

  private computeCellIndices() {
    const cellIndicesCompute = computeCellIndicesPass(
      this.cellIndicesBuffer,
      this.cellCountsBuffer,
      this.positionsBuffer,
      this.cellSize,
      this.cellCountX,
      this.cellCountY,
      this.cellCountZ,
      this.xMinCoord,
      this.yMinCoord,
      this.zMinCoord
    )().compute(this.particleCount);
    this.renderer.computeAsync(cellIndicesCompute);
  }
  private computeCellStartIndices() {
    const cellStartIndicesCompute = computeCellStartIndicesPass(
      this.cellStartIndicesBuffer,
      this.cellCountsBuffer,
      this.totalCellCount
    )().compute(this.totalCellCount);
    this.renderer.computeAsync(cellStartIndicesCompute);
  }

  private computeReorderParticle() {
    const reorderParticleCompute = computeReorderParticlePass(
      this.cellIndicesBuffer,
      this.cellStartIndicesBuffer,
      this.offsetsBuffer,
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.reorderedPositionsBuffer,
      this.reorderedVelocitiesBuffer
    )().compute(this.particleCount);
    this.renderer.computeAsync(reorderParticleCompute);
  }

  private computeGravity() {
    const gravityCompute = computeGravityPass(
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.delta,
      this.restitution,
      this.boxWidth,
      this.boxHeight,
      this.boxDepth,
      this.mass
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
    this.computeResetCalc();
    this.computeCellIndices();
    this.computeCellStartIndices();
    this.computeReorderParticle();
    this.computeGravity();
    this.computeDensity();
    this.computePressure();
    this.computePressureForce();
    this.computeViscosity();
    this.computeIntegrate();
  }

  private disposeParticleBuffers() {
    this.positionsBuffer.dispose();
    this.velocitiesBuffer.dispose();
    this.densitiesBuffer.dispose();
    this.pressuresBuffer.dispose();
    this.pressureForcesBuffer.dispose();
    this.viscosityForcesBuffer.dispose();
  }

  private disposeParticleMesh() {
    if (this.scene && this.sphereMesh) {
      this.scene.remove(this.sphereMesh);
    }
    if (this.sphereMesh) {
      this.sphereMesh.geometry.dispose();
      this.sphereMesh.dispose();
    }
    if (this.sphereGeometry) {
      this.sphereGeometry.dispose();
    }
    if (this.sphereMaterial) {
      this.sphereMaterial.dispose();
    }
  }

  public async updateParticleCount(value: number) {
    this.particleCount = value;

    this.disposeParticleBuffers();
    this.disposeParticleMesh();

    await this.initialize();

    if (this.scene) {
      this.scene.add(this.sphereMesh);
    }
  }
}
