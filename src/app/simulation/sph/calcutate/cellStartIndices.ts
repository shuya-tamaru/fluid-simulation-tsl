import type { StorageBufferType } from "../../../types/BufferType";
import * as THREE from "three/webgpu";
import { Fn, Loop, atomicLoad, int } from "three/tsl";

export function computeCellStartIndicesPass(
  cellStartIndicesBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType,
  totalCellCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const acc = int(0).toVar();

    Loop(int(totalCellCount), ({ i }) => {
      const startIndex = cellStartIndicesBuffer.element(i);
      startIndex.assign(acc);

      const count = atomicLoad(cellCountsBuffer.element(i)).toVar();
      acc.addAssign(count);
    });
  });
}
