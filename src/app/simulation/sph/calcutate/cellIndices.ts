import { Fn, instanceIndex, uint } from "three/tsl";
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
  zMinCoord: number
): THREE.TSL.ShaderNodeFn<[]> {
  return Fn(() => {
    const pos = positionsBuffer.element(instanceIndex);
    const cellIndex_i = cellIndicesBuffer.element(instanceIndex).toVar();

    const cellIndex = positionToCellIndex(
      pos,
      cellSize,
      cellCountX,
      cellCountY,
      cellCountZ,
      xMinCoord,
      yMinCoord,
      zMinCoord
    )();

    cellIndex_i.assign(cellIndex);
    const cellCount_i = cellCountsBuffer.element(cellIndex).toVar();
    cellCount_i.assign(cellCount_i.add(uint(1)));
  });
}
