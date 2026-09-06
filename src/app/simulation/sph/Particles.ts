import { Fn, If, exp, hash, instancedArray, instanceIndex, vec3 } from "three/tsl";
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
import { CELL_SCAN_BLOCK_SIZE, computeCellBlockSumsPass, computeBlockedCellStartsPass } from "./calcutate/cellStartIndices";
import { computeReorderParticlePass } from "./calcutate/reorderParticle";
import { computeResetCalcPass } from "./calcutate/resetCalculation";
import { computeSwitchBuffersPass } from "./calcutate/switchBuffers";

export class Particles {
  private boxWidth!: UniformTypeOf<number>;
  private boxHeight!: UniformTypeOf<number>;
  private topCollision!: UniformTypeOf<boolean>;
  private boxDepth!: UniformTypeOf<number>;
  public particleCount!: number;
  private sphConfig!: SPHConfig;

  private cellBlockSumsBuffer!: StorageBufferType;
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

  private xMin!: number;
  private cellSize!: number;
  private cellCountX!: number;
  private cellCountY!: number;
  private cellCountZ!: number;
  private totalCellCount!: number;
  private xMinCoord!: number;
  private yMinCoord!: number;
  private zMinCoord!: number;

  private kernels = new Map<string, THREE.ComputeNode>();
  private kernelConfig = "";
  private spatialDataValid = false;
  private pendingPasses: THREE.ComputeNode[] = [];

  private kernel(name: string, create: () => THREE.ComputeNode) {
    let node = this.kernels.get(name);
    if (!node) { node = create(); this.kernels.set(name, node); }
    return node;
  }

  private clearKernels() {
    for (const node of this.kernels.values()) node.dispose();
    this.kernels.clear();
  }

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
    this.topCollision = boundaryConfig.topCollision;

    this.xMin = boundaryConfig.xMin;
    // Size the grid for the slider maxima, not the current box: box resizes
    // at runtime must never push particles outside the neighbour grid.
    this.cellSize = this.sphConfig.h;
    this.cellCountX = Math.ceil(boundaryConfig.maxWidth / this.cellSize);
    this.cellCountY = Math.ceil(boundaryConfig.maxHeight / this.cellSize);
    this.cellCountZ = Math.ceil(boundaryConfig.maxDepth / this.cellSize);
    this.totalCellCount = this.cellCountX * this.cellCountY * this.cellCountZ;
    this.xMinCoord = boundaryConfig.xMin;
    this.yMinCoord = -boundaryConfig.maxHeight / 2;
    this.zMinCoord = -boundaryConfig.maxDepth / 2;
  }

  public async initialize() {
    this.initializeParticleBuffers();
    await this.initializeParticlePositions();
  }

  private initializeParticleBuffers() {
    this.cellBlockSumsBuffer = instancedArray(Math.ceil(this.totalCellCount / CELL_SCAN_BLOCK_SIZE), "int");
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
      If(instanceIndex.lessThan(this.particleCount), () => {
        const pos = this.positionsBuffer.element(instanceIndex);

        const x = hash(instanceIndex.mul(3)).mul(this.boxWidth).add(this.xMin);
        const y = hash(instanceIndex.mul(5).add(1)).sub(0.5).mul(this.boxHeight);
        const z = hash(instanceIndex.mul(7)).sub(0.5).mul(this.boxDepth);

        const initialPosition = vec3(x, y, z);

        pos.assign(initialPosition);
      });
    });
    const initCompute = init().compute(this.particleCount);
    await this.renderer.computeAsync(initCompute);
    initCompute.dispose();
  }

  private disposeParticleBuffers() {
    this.clearKernels();
    this.spatialDataValid = false;
    this.cellBlockSumsBuffer.dispose();
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

  public async updateParticleCount(value: number) {
    this.disposeParticleBuffers();
    this.particleCount = value;
    await this.initialize();
  }

  public getVelocitiesBuffer(): StorageBufferType {
    return this.velocitiesBuffer;
  }

  public getDensitiesBuffer(): StorageBufferType {
    return this.densitiesBuffer;
  }

  public getCellStartIndicesBuffer(): StorageBufferType {
    return this.cellStartIndicesBuffer;
  }

  public getCellCountsBuffer(): StorageBufferType {
    return this.cellCountsBuffer;
  }

  /** Grid constants required to walk the spatial hash from other passes. */
  public getGridParams() {
    return {
      cellSize: this.cellSize,
      cellCountX: this.cellCountX,
      cellCountY: this.cellCountY,
      cellCountZ: this.cellCountZ,
      xMinCoord: this.xMinCoord,
      yMinCoord: this.yMinCoord,
      zMinCoord: this.zMinCoord,
    };
  }

  public getPositionsBuffer(): THREE.TSL.ShaderNodeObject<THREE.StorageBufferNode> {
    return this.positionsBuffer;
  }

  private computeResetCalculation() {
    const resetCalculationCompute = this.kernel("resetCalculationCompute", () => computeResetCalcPass(
      this.offsetsBuffer,
      this.cellCountsBuffer,
      this.totalCellCount
    )().compute(this.totalCellCount));
    this.pendingPasses.push(resetCalculationCompute);
  }

  private computeCellIndices() {
    const cellIndicesCompute = this.kernel("cellIndicesCompute", () => computeCellIndicesPass(
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
    )().compute(this.particleCount));
    this.pendingPasses.push(cellIndicesCompute);
  }

  private computeCellStartIndices() {
    const blocks = Math.ceil(this.totalCellCount / CELL_SCAN_BLOCK_SIZE);
    this.pendingPasses.push(this.kernel("cellBlockSums", () => computeCellBlockSumsPass(
      this.cellCountsBuffer, this.cellBlockSumsBuffer, this.totalCellCount
    )().compute(blocks)));
    this.pendingPasses.push(this.kernel("cellStartIndices", () => computeBlockedCellStartsPass(
      this.cellStartIndicesBuffer, this.cellCountsBuffer, this.cellBlockSumsBuffer, this.totalCellCount
    )().compute(blocks)));
  }

  private computeReorderParticle() {
    const reorderParticleCompute = this.kernel("reorderParticleCompute", () => computeReorderParticlePass(
      this.cellIndicesBuffer,
      this.cellStartIndicesBuffer,
      this.offsetsBuffer,
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.reorderedPositionsBuffer,
      this.reorderedVelocitiesBuffer,
      this.particleCount
    )().compute(this.particleCount));
    this.pendingPasses.push(reorderParticleCompute);
  }

  private computeSwitchBuffers() {
    const switchBuffersCompute = this.kernel("switchBuffersCompute", () => computeSwitchBuffersPass(
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.reorderedPositionsBuffer,
      this.reorderedVelocitiesBuffer,
      this.particleCount
    )().compute(this.particleCount));
    this.pendingPasses.push(switchBuffersCompute);
  }

  private computeDensity() {
    const densityCompute = this.kernel("densityCompute", () => computeDensityPass(
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
    )().compute(this.particleCount));
    this.pendingPasses.push(densityCompute);
  }

  private computePressure() {
    const pressureCompute = this.kernel("pressureCompute", () => computePressurePass(
      this.densitiesBuffer,
      this.pressuresBuffer,
      this.sphConfig.restDensity,
      this.sphConfig.pressureStiffness,
      this.particleCount
    )().compute(this.particleCount));
    this.pendingPasses.push(pressureCompute);
  }

  private computePressureForce() {
    const pressureForceCompute = this.kernel("pressureForceCompute", () => computePressureForcePass(
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
    )().compute(this.particleCount));
    this.pendingPasses.push(pressureForceCompute);
  }

  private computeViscosity() {
    const viscosityCompute = this.kernel("viscosityCompute", () => computeViscosityPass(
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
    )().compute(this.particleCount));
    this.pendingPasses.push(viscosityCompute);
  }

  private computeIntegrate(delta: number) {
    const integrateCompute = this.kernel("integrateCompute", () => computeIntegratePass(
      this.positionsBuffer,
      this.velocitiesBuffer,
      this.pressureForcesBuffer,
      this.viscosityForcesBuffer,
      this.sphConfig.mass,
      delta,
      this.sphConfig.restitution,
      this.sphConfig.damping,
      this.boxWidth,
      this.boxHeight,
      this.boxDepth,
      this.topCollision,
      this.xMin,
      this.particleCount
    )().compute(this.particleCount));
    this.pendingPasses.push(integrateCompute);
  }

  /** A local upward impulse for inspecting splashes without restarting the fluid. */
  public async splash() {
    const impulse = Fn(() => {
      If(instanceIndex.lessThan(this.particleCount), () => {
        const position = this.positionsBuffer.element(instanceIndex);
        const velocity = this.velocitiesBuffer.element(instanceIndex);
        // Slightly left of the box centre, wherever the piston has put it.
        const impulseX = this.boxWidth.mul(0.32).add(this.xMin);
        const distance2 = position.x.sub(impulseX).pow(2).add(position.z.pow(2));
        const strength = exp(distance2.div(-9));
        velocity.addAssign(vec3(3, 16, 0).mul(strength));
      });
    })().compute(this.particleCount);
    await this.renderer.computeAsync(impulse);
    impulse.dispose();
  }

  public async compute() {
    const configKey = JSON.stringify(this.sphConfig);
    if (configKey !== this.kernelConfig) {
      this.clearKernels();
      this.spatialDataValid = false;
      this.kernelConfig = configKey;
    }
    // Sub-stepping keeps the stiff pressure solve stable: one full-dt step
    // leaves permanent particle jitter that never lets the pool calm down.
    const substeps = this.sphConfig.substeps;
    for (let step = 0; step < substeps; step++) {
      this.prepareSpatialData();
      this.computePressure();
      this.computePressureForce();
      this.computeViscosity();
      this.computeIntegrate(this.sphConfig.delta / substeps);
      this.spatialDataValid = false;
    }
    // Keep current positions/density available to whitewater and the next tick.
    this.prepareSpatialData();
    this.flushPasses();
  }

  private prepareSpatialData() {
    if (this.spatialDataValid) return;
    this.computeResetCalculation();
    this.computeCellIndices();
    this.computeCellStartIndices();
    this.computeReorderParticle();
    this.computeSwitchBuffers();
    this.computeDensity();
    this.spatialDataValid = true;
  }

  private flushPasses() {
    if (this.pendingPasses.length === 0) return;
    // One ordered GPU submission; storage dependencies remain dispatch barriers.
    this.renderer.compute(this.pendingPasses);
    this.pendingPasses = [];
  }

  public async refreshSpatialData() {
    // Public callers may have written positions directly (GPU fixtures, emitters).
    this.spatialDataValid = false;
    this.prepareSpatialData();
    this.flushPasses();
  }
}
