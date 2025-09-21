import * as THREE from "three/webgpu";
import { atomicAdd, Fn, instanceIndex, uint } from "three/tsl";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeReorderParticlePass(
  cellIndicesBuffer: StorageBufferType,
  cellStartIndicesBuffer: StorageBufferType,
  offsetsBuffer: StorageBufferType,
  positionsBuffer: StorageBufferType,
  velocitiesBuffer: StorageBufferType,
  reorderedPositionsBuffer: StorageBufferType,
  reorderedVelocitiesBuffer: StorageBufferType
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const cellIndex = cellIndicesBuffer.element(instanceIndex);
    const startIndex = cellStartIndicesBuffer.element(cellIndex);
    const offset = atomicAdd(offsetsBuffer.element(cellIndex), uint(1));
    const dstIndex = startIndex.add(offset);

    const pos = positionsBuffer.element(instanceIndex);
    const vel = velocitiesBuffer.element(instanceIndex);
    reorderedPositionsBuffer.element(dstIndex).assign(pos);
    reorderedVelocitiesBuffer.element(dstIndex).assign(vel);
  });
}
