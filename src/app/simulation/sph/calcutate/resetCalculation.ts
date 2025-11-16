import * as THREE from "three/webgpu";
import { atomicStore, Fn, instanceIndex, uint } from "three/tsl";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeResetCalcPass(
  offsetsBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    atomicStore(cellCountsBuffer.element(instanceIndex), uint(0));
    atomicStore(offsetsBuffer.element(instanceIndex), uint(0));
  });
}
