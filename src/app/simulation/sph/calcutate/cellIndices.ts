import { Fn, instanceIndex, atomicAdd, int } from "three/tsl";
import * as THREE from "three/webgpu";
import type { StorageBufferType } from "../../../types/BufferType";
import {
  coordToIndex,
  positionToCellCoord,
  positionToCellIndex,
} from "../utils/positionToCellIndex";

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
  zMinCoord: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pos = positionsBuffer.element(instanceIndex);
    const cellIndex_i = cellIndicesBuffer.element(instanceIndex);

    // @ts-ignore
    //prettier-ignore
    const cellIndexCoord = positionToCellCoord(pos, cellSize, cellCountX, cellCountY, cellCountZ, xMinCoord, yMinCoord, zMinCoord)

    // @ts-ignore
    //prettier-ignore
    const index = coordToIndex(cellIndexCoord, cellCountX, cellCountY)

    cellIndex_i.assign(index);
    const cellCount_i = cellCountsBuffer.element(index);
    atomicAdd(cellCount_i, int(1));
  });
}
