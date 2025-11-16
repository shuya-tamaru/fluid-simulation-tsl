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
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../types/BufferType";
import { computeDensityPass } from "./calcutate/density";
import { computePressurePass } from "./calcutate/pressure";
import { computePressureForcePass } from "./calcutate/pressureForce";
import { computeIntegratePass } from "./calcutate/integrate";
import { computeViscosityPass } from "./calcutate/viscosity";
import type { UniformTypeOf } from "../../types/UniformType";
import { SPHConfig } from "./SPHConfig";
import type { BoundaryConfig } from "../boundaries/BoundaryConfig";
import { computeCellIndicesPass } from "./calcutate/cellIndices";
import { computeCellStartIndicesPass } from "./calcutate/cellStartIndices";
import { computeReorderParticlePass } from "./calcutate/reorderParticle";
import { computeResetCalcPass } from "./calcutate/resetCalculation";
import { computeSwitchBuffersPass } from "./calcutate/switchBuffers";

export class Particles {
  private boxWidth!: UniformTypeOf<number>;
  private boxHeight!: UniformTypeOf<number>;
  private boxDepth!: UniformTypeOf<number>;
  public particleCount!: number;
  private sphConfig!: SPHConfig;
  private boundaryConfig!: BoundaryConfig;

  private cellIndicesBuffer!: StorageBufferType;
  private cellCountsBuffer!: StorageBufferType;
  private cellStartIndicesBuffer!: StorageBufferType;
  private offsetsBuffer!: StorageBufferType;
  private positionsBuffer!: StorageBufferType;
  private reorderedPositionsBuffer!: StorageBufferType;
  private reorderedVelocitiesBuffer!: StorageBufferType;
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

  private cellSize!: number;
  private cellCountX!: number;
  private cellCountY!: number;
  private cellCountZ!: number;
  private totalCellCount!: number;
  private xMinCoord!: number;
  private yMinCoord!: number;
  private zMinCoord!: number;

  //params

  constructor(
    renderer: THREE.WebGPURenderer,
    sphConfig: SPHConfig,
    boundaryConfig: BoundaryConfig
  ) {
    this.renderer = renderer;
    this.sphConfig = sphConfig;
    this.particleCount = sphConfig.particleCount;
    this.boxWidth = boundaryConfig.width;
    this.boxHeight = boundaryConfig.height;
    this.boxDepth = boundaryConfig.depth;

    this.cellSize = this.sphConfig.h;
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
    this.cellIndicesBuffer = instancedArray(this.particleCount, "int");
    this.cellCountsBuffer = instancedArray(
      this.totalCellCount,
      "int"
    ).toAtomic();
    this.cellStartIndicesBuffer = instancedArray(this.totalCellCount, "int");
    this.offsetsBuffer = instancedArray(this.totalCellCount, "int").toAtomic();
    this.positionsBuffer = instancedArray(this.particleCount, "vec3");
    this.velocitiesBuffer = instancedArray(this.particleCount, "vec3");
    this.reorderedPositionsBuffer = instancedArray(this.particleCount, "vec3");
    this.reorderedVelocitiesBuffer = instancedArray(this.particleCount, "vec3");
    this.densitiesBuffer = instancedArray(this.particleCount, "float");
    this.pressuresBuffer = instancedArray(this.particleCount, "float");
    this.pressureForcesBuffer = instancedArray(this.particleCount, "vec3");
    this.viscosityForcesBuffer = instancedArray(this.particleCount, "vec3");
  }

  private async initializeParticlePositions() {
    const init = Fn(() => {
      const pos = this.positionsBuffer.element(instanceIndex);

      const x = hash(instanceIndex.mul(3)).sub(0.5).mul(this.boxWidth);
      const y = hash(instanceIndex.mul(5)).sub(0.5).mul(this.boxHeight);
      const z = hash(instanceIndex.mul(7)).sub(0.5).mul(this.boxDepth);

      const initialPosition = vec3(x, y, z);

      pos.assign(initialPosition);
    });
    const initCompute = init().compute(this.particleCount);
    await this.renderer.computeAsync(initCompute);
  }

  private createGeometry() {
    this.sphereGeometry = new THREE.SphereGeometry(0.2, 4, 4);
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
      speed.div(float(this.sphConfig.maxSpeed)),
      float(0.0),
      float(1.0)
    ).toVar();
    const deep = vec3(0.0, 0.05, 0.9);
    const mid = vec3(0.0, 0.6, 0.8);
    const foam = vec3(1.0, 1.0, 1.0);

    const color = vec3(0.0).toVar();

    If(t.lessThan(float(0.85)), () => {
      const k = t.div(float(0.85));
      color.assign(mix(deep, mid, k));
    }).Else(() => {
      const k = t.sub(float(0.85)).div(float(0.15));
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

  private disposeParticleBuffers() {
    this.cellIndicesBuffer.dispose();
    this.cellCountsBuffer.dispose();
    this.cellStartIndicesBuffer.dispose();
    this.offsetsBuffer.dispose();
    this.positionsBuffer.dispose();
    this.reorderedPositionsBuffer.dispose();
    this.reorderedVelocitiesBuffer.dispose();
    this.velocitiesBuffer.dispose();
    this.densitiesBuffer.dispose();
    this.pressuresBuffer.dispose();
    this.pressureForcesBuffer.dispose();
    this.viscosityForcesBuffer.dispose();
  }

  private disposeParticleMesh() {
    if (this.scene) {
      this.scene.remove(this.sphereMesh);
    }
    this.sphereMesh.dispose();
    this.sphereGeometry.dispose();
    this.sphereMaterial.dispose();
  }

  public async updateParticleCount(value: number) {
    this.disposeParticleBuffers();
    this.disposeParticleMesh();
    this.particleCount = value;
    await this.initialize();

    if (this.scene) {
      this.scene.add(this.sphereMesh);
    }
  }

  public getPositionsBuffer(): THREE.TSL.ShaderNodeObject<THREE.StorageBufferNode> {
    return this.positionsBuffer;
  }

  private async computeResetCalculation() {
    const resetCalculationCompute = computeResetCalcPass(
      this.offsetsBuffer,
      this.cellCountsBuffer,
      this.totalCellCount
    )().compute(this.totalCellCount);
    await this.renderer.computeAsync(resetCalculationCompute);
  }

  private async computeCellIndices() {
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
      this.zMinCoord,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(cellIndicesCompute);
  }

  private async computeCellStartIndices() {
    const cellStartIndicesCompute = computeCellStartIndicesPass(
      this.cellStartIndicesBuffer,
      this.cellCountsBuffer,
      this.totalCellCount
    )().compute(1);
    await this.renderer.computeAsync(cellStartIndicesCompute);
  }

  private async computeReorderParticle() {
    const reorderParticleCompute = computeReorderParticlePass(
      this.cellIndicesBuffer,
      this.cellStartIndicesBuffer,
      this.offsetsBuffer,
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.reorderedPositionsBuffer,
      this.reorderedVelocitiesBuffer,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(reorderParticleCompute);
  }

  private async computeSwitchBuffers() {
    const switchBuffersCompute = computeSwitchBuffersPass(
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.reorderedPositionsBuffer,
      this.reorderedVelocitiesBuffer,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(switchBuffersCompute);
  }

  private async computeDensity() {
    const densityCompute = computeDensityPass(
      this.positionsBuffer,
      this.densitiesBuffer,
      this.cellStartIndicesBuffer,
      this.cellCountsBuffer,
      this.sphConfig.poly6Kernel,
      this.sphConfig.h2,
      this.sphConfig.h6,
      this.sphConfig.mass,
      this.cellSize,
      this.cellCountX,
      this.cellCountY,
      this.cellCountZ,
      this.xMinCoord,
      this.yMinCoord,
      this.zMinCoord,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(densityCompute);
  }

  private async computePressure() {
    const pressureCompute = computePressurePass(
      this.densitiesBuffer,
      this.pressuresBuffer,
      this.sphConfig.restDensity,
      this.sphConfig.pressureStiffness,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(pressureCompute);
  }

  private async computePressureForce() {
    const pressureForceCompute = computePressureForcePass(
      this.positionsBuffer,
      this.densitiesBuffer,
      this.pressuresBuffer,
      this.pressureForcesBuffer,
      this.cellStartIndicesBuffer,
      this.cellCountsBuffer,
      this.sphConfig.mass,
      this.sphConfig.h,
      this.sphConfig.h2,
      this.sphConfig.spiky,
      this.cellSize,
      this.cellCountX,
      this.cellCountY,
      this.cellCountZ,
      this.xMinCoord,
      this.yMinCoord,
      this.zMinCoord,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(pressureForceCompute);
  }

  private async computeViscosity() {
    const viscosityCompute = computeViscosityPass(
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.densitiesBuffer,
      this.viscosityForcesBuffer,
      this.cellStartIndicesBuffer,
      this.cellCountsBuffer,
      this.sphConfig.viscosity,
      this.sphConfig.viscosityMu,
      this.sphConfig.h,
      this.sphConfig.h2,
      this.sphConfig.mass,
      this.cellSize,
      this.cellCountX,
      this.cellCountY,
      this.cellCountZ,
      this.xMinCoord,
      this.yMinCoord,
      this.zMinCoord,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(viscosityCompute);
  }

  private async computeIntegrate() {
    const integrateCompute = computeIntegratePass(
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.pressureForcesBuffer,
      this.viscosityForcesBuffer,
      this.sphConfig.mass,
      this.sphConfig.delta,
      this.sphConfig.restitution,
      this.boxWidth,
      this.boxHeight,
      this.boxDepth,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(integrateCompute);
  }

  public async compute() {
    await this.computeResetCalculation();
    await this.computeCellIndices();
    await this.computeCellStartIndices();
    await this.computeReorderParticle();
    await this.computeSwitchBuffers();
    await this.computeDensity();
    await this.computePressure();

    await this.computePressureForce();
    await this.computeViscosity();
    await this.computeIntegrate();
  }
}
