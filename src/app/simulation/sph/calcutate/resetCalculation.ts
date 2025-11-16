import * as THREE from "three/webgpu";
import { atomicStore, Fn, If, instanceIndex, int } from "three/tsl";
import type { StorageBufferType } from "../../../types/BufferType";

export function computeResetCalcPass(
  offsetsBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType,
  totalCellCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const i = instanceIndex.toVar();
    If(i.lessThan(totalCellCount), () => {
      atomicStore(cellCountsBuffer.element(i), int(0));
      atomicStore(offsetsBuffer.element(i), int(0));
    });
  });
}
