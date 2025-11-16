import type { StorageBufferType } from "../../../types/BufferType";
import * as THREE from "three/webgpu";
import { Fn, Loop, uint, atomicLoad } from "three/tsl";

export function computeCellStartIndicesPass(
  cellStartIndicesBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType,
  totalCellCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const acc = uint(0).toVar();

    const i = uint(0).toVar();

    Loop(i.lessThan(totalCellCount), () => {
      const startIndex = cellStartIndicesBuffer.element(i);
      startIndex.assign(acc);

      const count = atomicLoad(cellCountsBuffer.element(i));
      acc.addAssign(count);
      i.addAssign(uint(1));
    });
  });
}
