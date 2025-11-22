import * as THREE from "three/webgpu";
import { Fn, instanceIndex, hash, vec3 } from "three/tsl";
import type { StorageBufferType } from "../../../types/BufferType";
import type { UniformTypeOf } from "../../../types/UniformType";
import { SPHConfig } from "../SPHConfig";
import { computeDensityPass } from "../calcutate/density";
import { computePressurePass } from "../calcutate/pressure";
import { computePressureForcePass } from "../calcutate/pressureForce";
import { computeIntegratePass } from "../calcutate/integrate";
import { computeViscosityPass } from "../calcutate/viscosity";
import { computeCellIndicesPass } from "../calcutate/cellIndices";
import { computeCellStartIndicesPass } from "../calcutate/cellStartIndices";
import { computeReorderParticlePass } from "../calcutate/reorderParticle";
import { computeResetCalcPass } from "../calcutate/resetCalculation";
import { computeSwitchBuffersPass } from "../calcutate/switchBuffers";

export interface SphBuffers {
  cellIndicesBuffer: StorageBufferType;
  cellCountsBuffer: StorageBufferType;
  cellStartIndicesBuffer: StorageBufferType;
  offsetsBuffer: StorageBufferType;
  positionsBuffer: StorageBufferType;
  reorderedPositionsBuffer: StorageBufferType;
  reorderedVelocitiesBuffer: StorageBufferType;
  velocitiesBuffer: StorageBufferType;
  densitiesBuffer: StorageBufferType;
  pressuresBuffer: StorageBufferType;
  pressureForcesBuffer: StorageBufferType;
  viscosityForcesBuffer: StorageBufferType;
}

export interface SphGridParams {
  cellSize: number;
  cellCountX: number;
  cellCountY: number;
  cellCountZ: number;
  totalCellCount: number;
  xMinCoord: number;
  yMinCoord: number;
  zMinCoord: number;
}

export interface SphBoundaryParams {
  boxWidth: UniformTypeOf<number>;
  boxHeight: UniformTypeOf<number>;
  boxDepth: UniformTypeOf<number>;
}

export class SphCompute {
  private renderer: THREE.WebGPURenderer;
  private sphConfig: SPHConfig;
  private buffers: SphBuffers;
  private gridParams: SphGridParams;
  private boundaryParams: SphBoundaryParams;
  private particleCount: number;

  constructor(
    renderer: THREE.WebGPURenderer,
    sphConfig: SPHConfig,
    buffers: SphBuffers,
    gridParams: SphGridParams,
    boundaryParams: SphBoundaryParams,
    particleCount: number
  ) {
    this.renderer = renderer;
    this.sphConfig = sphConfig;
    this.buffers = buffers;
    this.gridParams = gridParams;
    this.boundaryParams = boundaryParams;
    this.particleCount = particleCount;
  }

  public updateBuffers(buffers: SphBuffers) {
    this.buffers = buffers;
  }

  public updateParticleCount(particleCount: number) {
    this.particleCount = particleCount;
  }

  public async initializeParticlePositions() {
    const init = Fn(() => {
      const pos = this.buffers.positionsBuffer.element(instanceIndex);

      const x = hash(instanceIndex.mul(3))
        .sub(0.5)
        .mul(this.boundaryParams.boxWidth);
      const y = hash(instanceIndex.mul(3))
        .sub(0.5)
        .mul(this.boundaryParams.boxHeight);
      const z = hash(instanceIndex.mul(7))
        .sub(0.5)
        .mul(this.boundaryParams.boxDepth);

      const initialPosition = vec3(x, y, z);

      pos.assign(initialPosition);
    });
    const initCompute = init().compute(this.particleCount);
    await this.renderer.computeAsync(initCompute);
  }

  private async computeResetCalculation() {
    const resetCalculationCompute = computeResetCalcPass(
      this.buffers.offsetsBuffer,
      this.buffers.cellCountsBuffer,
      this.gridParams.totalCellCount
    )().compute(this.gridParams.totalCellCount);
    await this.renderer.computeAsync(resetCalculationCompute);
  }

  private async computeCellIndices() {
    const cellIndicesCompute = computeCellIndicesPass(
      this.buffers.cellIndicesBuffer,
      this.buffers.cellCountsBuffer,
      this.buffers.positionsBuffer,
      this.gridParams.cellSize,
      this.gridParams.cellCountX,
      this.gridParams.cellCountY,
      this.gridParams.cellCountZ,
      this.gridParams.xMinCoord,
      this.gridParams.yMinCoord,
      this.gridParams.zMinCoord,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(cellIndicesCompute);
  }

  private async computeCellStartIndices() {
    const cellStartIndicesCompute = computeCellStartIndicesPass(
      this.buffers.cellStartIndicesBuffer,
      this.buffers.cellCountsBuffer,
      this.gridParams.totalCellCount
    )().compute(1);
    await this.renderer.computeAsync(cellStartIndicesCompute);
  }

  private async computeReorderParticle() {
    const reorderParticleCompute = computeReorderParticlePass(
      this.buffers.cellIndicesBuffer,
      this.buffers.cellStartIndicesBuffer,
      this.buffers.offsetsBuffer,
      this.buffers.positionsBuffer,
      this.buffers.velocitiesBuffer,
      this.buffers.reorderedPositionsBuffer,
      this.buffers.reorderedVelocitiesBuffer,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(reorderParticleCompute);
  }

  private async computeSwitchBuffers() {
    const switchBuffersCompute = computeSwitchBuffersPass(
      this.buffers.positionsBuffer,
      this.buffers.velocitiesBuffer,
      this.buffers.reorderedPositionsBuffer,
      this.buffers.reorderedVelocitiesBuffer,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(switchBuffersCompute);
  }

  private async computeDensity() {
    const densityCompute = computeDensityPass(
      this.buffers.positionsBuffer,
      this.buffers.densitiesBuffer,
      this.buffers.cellStartIndicesBuffer,
      this.buffers.cellCountsBuffer,
      this.sphConfig.poly6Kernel,
      this.sphConfig.h2,
      this.sphConfig.h6,
      this.sphConfig.mass,
      this.gridParams.cellSize,
      this.gridParams.cellCountX,
      this.gridParams.cellCountY,
      this.gridParams.cellCountZ,
      this.gridParams.xMinCoord,
      this.gridParams.yMinCoord,
      this.gridParams.zMinCoord,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(densityCompute);
  }

  private async computePressure() {
    const pressureCompute = computePressurePass(
      this.buffers.densitiesBuffer,
      this.buffers.pressuresBuffer,
      this.sphConfig.restDensity,
      this.sphConfig.pressureStiffness,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(pressureCompute);
  }

  private async computePressureForce() {
    const pressureForceCompute = computePressureForcePass(
      this.buffers.positionsBuffer,
      this.buffers.densitiesBuffer,
      this.buffers.pressuresBuffer,
      this.buffers.pressureForcesBuffer,
      this.buffers.cellStartIndicesBuffer,
      this.buffers.cellCountsBuffer,
      this.sphConfig.mass,
      this.sphConfig.h,
      this.sphConfig.h2,
      this.sphConfig.spiky,
      this.gridParams.cellSize,
      this.gridParams.cellCountX,
      this.gridParams.cellCountY,
      this.gridParams.cellCountZ,
      this.gridParams.xMinCoord,
      this.gridParams.yMinCoord,
      this.gridParams.zMinCoord,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(pressureForceCompute);
  }

  private async computeViscosity() {
    const viscosityCompute = computeViscosityPass(
      this.buffers.positionsBuffer,
      this.buffers.velocitiesBuffer,
      this.buffers.densitiesBuffer,
      this.buffers.viscosityForcesBuffer,
      this.buffers.cellStartIndicesBuffer,
      this.buffers.cellCountsBuffer,
      this.sphConfig.viscosity,
      this.sphConfig.viscosityMu,
      this.sphConfig.h,
      this.sphConfig.h2,
      this.sphConfig.mass,
      this.gridParams.cellSize,
      this.gridParams.cellCountX,
      this.gridParams.cellCountY,
      this.gridParams.cellCountZ,
      this.gridParams.xMinCoord,
      this.gridParams.yMinCoord,
      this.gridParams.zMinCoord,
      this.particleCount
    )().compute(this.particleCount);
    await this.renderer.computeAsync(viscosityCompute);
  }

  private async computeIntegrate() {
    const integrateCompute = computeIntegratePass(
      this.buffers.positionsBuffer,
      this.buffers.velocitiesBuffer,
      this.buffers.pressureForcesBuffer,
      this.buffers.viscosityForcesBuffer,
      this.sphConfig.mass,
      this.sphConfig.delta,
      this.sphConfig.restitution,
      this.boundaryParams.boxWidth,
      this.boundaryParams.boxHeight,
      this.boundaryParams.boxDepth,
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
