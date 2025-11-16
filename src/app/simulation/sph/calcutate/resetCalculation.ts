import * as THREE from "three/webgpu";
import { atomicStore, Fn, instanceIndex, int } from "three/tsl";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeResetCalcPass(
  offsetsBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    atomicStore(cellCountsBuffer.element(instanceIndex), int(0));
    atomicStore(offsetsBuffer.element(instanceIndex), int(0));
  });
}
