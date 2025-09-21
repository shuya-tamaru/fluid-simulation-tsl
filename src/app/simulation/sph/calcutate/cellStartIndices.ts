import type { StorageBufferType } from "../../../types/BufferType";
import * as THREE from "three/webgpu";
import { Fn, Loop, uint } from "three/tsl";

export function computeCellStartIndicesPass(
  cellStartIndicesBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType,
  totalCellCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const acc = uint(0).toVar();

    const i = uint(0).toVar();

    Loop(i.lessThan(totalCellCount), () => {
      cellStartIndicesBuffer.element(i).assign(acc);
      acc.assign(acc.add(cellCountsBuffer.element(i)));
      i.assign(i.add(uint(1)));
    });
  });
}
