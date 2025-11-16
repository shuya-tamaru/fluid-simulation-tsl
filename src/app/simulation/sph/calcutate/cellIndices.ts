import { Fn, instanceIndex, atomicAdd, int, If } from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";
import { positionToCellIndex } from "../utils/positionToCellIndex";

export function computeCellIndicesPass(
  cellIndicesBuffer: StorageBufferType,
  cellCountsBuffer: StorageBufferType,
  positionsBuffer: StorageBufferType,
  cellSize: number,
  cellCountX: number,
  cellCountY: number,
  cellCountZ: number,
  xMinCoord: number,
  yMinCoord: number,
  zMinCoord: number,
  particleCount: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const i = instanceIndex.toVar();
    If(i.lessThan(particleCount), () => {
      const pos = positionsBuffer.element(instanceIndex);
      const cellIndex_i = cellIndicesBuffer.element(instanceIndex);

      // @ts-ignore
      //prettier-ignore
      const index = positionToCellIndex(pos, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord)

      cellIndex_i.assign(index);
      atomicAdd(cellCountsBuffer.element(index), int(1));
    });
  });
}
