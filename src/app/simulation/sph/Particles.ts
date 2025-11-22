import {
  float,
  Fn,
  instancedArray,
  instanceIndex,
  vec3,
  positionLocal,
  normalLocal,
  max,
} from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../types/BufferType";
import type { UniformTypeOf } from "../../types/UniformType";
import { SPHConfig } from "./SPHConfig";
import type { BoundaryConfig } from "../boundaries/BoundaryConfig";
import { ParticleHelper } from "./helper/ParticleHelper";
import {
  SphCompute,
  type SphBuffers,
  type SphGridParams,
  type SphBoundaryParams,
} from "./compute/SphCompute";

export class Particles {
  private boxWidth!: UniformTypeOf<number>;
  private boxHeight!: UniformTypeOf<number>;
  private boxDepth!: UniformTypeOf<number>;
  public particleCount!: number;
  private sphConfig!: SPHConfig;

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

  private sphCompute!: SphCompute;

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
    this.initializeSphCompute();
    await this.sphCompute.initializeParticlePositions();
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

  private initializeSphCompute() {
    const buffers: SphBuffers = {
      cellIndicesBuffer: this.cellIndicesBuffer,
      cellCountsBuffer: this.cellCountsBuffer,
      cellStartIndicesBuffer: this.cellStartIndicesBuffer,
      offsetsBuffer: this.offsetsBuffer,
      positionsBuffer: this.positionsBuffer,
      reorderedPositionsBuffer: this.reorderedPositionsBuffer,
      reorderedVelocitiesBuffer: this.reorderedVelocitiesBuffer,
      velocitiesBuffer: this.velocitiesBuffer,
      densitiesBuffer: this.densitiesBuffer,
      pressuresBuffer: this.pressuresBuffer,
      pressureForcesBuffer: this.pressureForcesBuffer,
      viscosityForcesBuffer: this.viscosityForcesBuffer,
    };

    const gridParams: SphGridParams = {
      cellSize: this.cellSize,
      cellCountX: this.cellCountX,
      cellCountY: this.cellCountY,
      cellCountZ: this.cellCountZ,
      totalCellCount: this.totalCellCount,
      xMinCoord: this.xMinCoord,
      yMinCoord: this.yMinCoord,
      zMinCoord: this.zMinCoord,
    };

    const boundaryParams: SphBoundaryParams = {
      boxWidth: this.boxWidth,
      boxHeight: this.boxHeight,
      boxDepth: this.boxDepth,
    };

    this.sphCompute = new SphCompute(
      this.renderer,
      this.sphConfig,
      buffers,
      gridParams,
      boundaryParams,
      this.particleCount
    );
  }

  private createGeometry() {
    this.sphereGeometry = new THREE.SphereGeometry(0.2, 6, 6);
  }

  private createMaterial() {
    this.sphereMaterial = new THREE.MeshBasicNodeMaterial({
      side: THREE.DoubleSide,
    });

    this.sphereMaterial.positionNode = positionLocal.add(
      this.positionsBuffer.toAttribute()
    );
    this.updateMaterialColorNode();
  }

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

      const baseColor = ParticleHelper.getColorByVelocity(
        speed,
        this.sphConfig.maxSpeed
      )();
      const shaded = baseColor
        .mul(ambient.add(diffuse.mul(float(2.2))))
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

  public async compute() {
    await this.sphCompute.compute();
  }
}
