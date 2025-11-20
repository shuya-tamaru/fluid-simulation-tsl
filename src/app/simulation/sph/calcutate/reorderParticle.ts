import * as THREE from "three/webgpu";
import { atomicAdd, Fn, If, instanceIndex, int } from "three/tsl";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeReorderParticlePass(
  cellIndicesBuffer: StorageBufferType,
  cellStartIndicesBuffer: StorageBufferType,
  offsetsBuffer: StorageBufferType,
  positionsBuffer: StorageBufferType,
  velocitiesBuffer: StorageBufferType,
  reorderedPositionsBuffer: StorageBufferType,
  reorderedVelocitiesBuffer: StorageBufferType,
  particleCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const i = instanceIndex.toVar();
    If(i.lessThan(particleCount), () => {
      const cellIndex = cellIndicesBuffer.element(instanceIndex);
      const ofs = atomicAdd(offsetsBuffer.element(cellIndex), int(1));
      const startIndex = cellStartIndicesBuffer.element(cellIndex);
      const dstIndex = startIndex.add(ofs);

      const pos = positionsBuffer.element(instanceIndex);
      const vel = velocitiesBuffer.element(instanceIndex);
      reorderedPositionsBuffer.element(dstIndex).assign(pos);
      reorderedVelocitiesBuffer.element(dstIndex).assign(vel);
    });
  });
}
